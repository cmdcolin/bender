import { ACCENT_GAIN } from '../../drums'
import { IDX } from '../../engine/params'
import { Bus, FAULT_NAMES } from '../bus'
import { DEST, hop } from '../modbus'
import { KEY_BIAS, voiceMask } from '../trigbus'
import { lpCoef, OnePoleLP } from '../util/onepole'
import {
  buildPcmRom,
  CHORDS,
  noteHz,
  PCM_ADDR_LINES,
  PCM_DATA_LINES,
  rateReg,
  regHz,
  ROM_HZ,
  ROM_PER_CYCLE,
  SAMPLE_SECS,
  SAMPLED,
} from './pcmRom'

import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Sampler } from './sampler'

// The third machine on the rail: the eight-bit home keyboard, and the only one
// on this board that makes pads, strings, choirs and bells.
//
// There is no oscillator in it. There is a ROM holding one short recording of
// each voice and a counter walking that ROM at whatever rate the note asks for,
// and that is the whole architecture — which is also why it is the most bent
// instrument ever built. The counter is an address bus and the ROM answers on a
// data bus, so both halves of the thing are wires a knife can reach. A data
// line held high fills in the quiet part of every word, and that is the sound
// on every circuit-bent record anybody has made.
//
// Two things about the clock are as much of the sound as the ROM is. It was cut
// at a fifth of the board's rate and nothing interpolates on the way out, so
// every voice comes back with its own images sitting over it — the grit is the
// part rather than an effect on it. And the rate is a twelve-bit *divider*, so
// what comes out is the nearest number the counter can be told rather than the
// note: dead in tune at the bottom of the keyboard and a few cents sharp at the
// top, exactly as the part was.

const N_VOICES = 4

const IDLE = 0
const ATTACK = 1
const DECAY = 2
const SUSTAIN = 3
const RELEASE = 4

const ENV_FLOOR = 0.0005

// The four shapes behind the four buttons. `sustain` is where the decay stops
// and whether it stops at all: a piano's does not, so the loop only ever sounds
// underneath a fall that is already on its way to nothing.
const ENV_SHAPE = [
  { attack: 0.004, decay: 1.7, sustain: 0 },
  { attack: 0.012, decay: 0.12, sustain: 0.85 },
  { attack: 0.55, decay: 0.9, sustain: 0.75 },
  { attack: 0.002, decay: 3.6, sustain: 0 },
]

// The one LFO on the die. No rate register, no depth register and no way to
// stop it — the button picks whether a voice is wired to it and whether that
// wire waits, and that is the whole of the vibrato circuit.
const VIB_HZ = 6.2
const VIB_CENTS = 14
const VIB_DELAY = 0.45
const VIB_STEPS = 64
const VIB_FACTOR = Float64Array.from({ length: VIB_STEPS }, (_, i) =>
  Math.pow(2, (VIB_CENTS * Math.sin((2 * Math.PI * i) / VIB_STEPS)) / 1200),
)

/** The DAC's word, which is the ROM's word: eight bits and no more. */
const DAC_STEPS = 128

/** One voice against the one output stage the four of them share. */
const VOICE_GAIN = 0.38

/** And the trim between that stage and the mix bus. */
const OUT_TRIM = 0.8

/** Which way a stale bit falls on each of the two buses. */
const ADDR_SEED = 0x39
const DATA_SEED = 0x8e

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

interface Voice {
  /** what this voice plays, which a chord makes different from the key */
  note: number
  /** the key that struck it, so letting that key go lets the voicing go */
  root: number
  pos: number
  /** ROM words an output sample, before the rail and the clock knob */
  inc: number
  reg: number
  env: number
  stage: number
  started: number
  /** samples since the strike, which is all the delayed vibrato needs */
  age: number
  /** whether a hand is still on it. A gate edge is not, so it lets go at once */
  held: boolean
  gain: number
}

const newVoice = (): Voice => ({
  note: 0,
  root: 0,
  pos: 0,
  inc: 0,
  reg: 1,
  env: 0,
  stage: IDLE,
  started: 0,
  age: 0,
  held: false,
  gain: 1,
})

export class PcmKeys implements Stage {
  label = 'pcmKeys'
  static readonly MAX_SOUNDING = N_VOICES

  private rom = buildPcmRom()
  private voices: Voice[] = Array.from({ length: N_VOICES }, newVoice)
  private clock = 0
  private lastNote = 0
  private lastReboot = 0
  private queued: { note: number; gain: number }[] = []

  // What the address counter is walking this block: the ROM's own words, or the
  // sample memory — which is not an array here at all. It is the sampler's
  // reel, read a fifth as often and squared off to eight bits on the way past.
  private romData: Int8Array | null = null
  private mono: Float32Array | null = null
  private romLen = 0
  private loopStart = 0
  private loopEnd = 0
  private decim: number

  private addrBus = new Bus(PCM_ADDR_LINES, ADDR_SEED)
  private dataBus = new Bus(PCM_DATA_LINES, DATA_SEED)
  private addrLine = -1
  private addrFault = 0
  private dataLine = -1
  private dataFault = 0
  private busCut = 1

  private vibPhase = 0
  private vibFactor = 1
  private toneA = new OnePoleLP()
  private toneB = new OnePoleLP()

  private attackCoef = 1
  private decayCoef = 0
  private releaseCoef = 0
  private sustainAt = 0

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly sampler: Sampler,
  ) {
    this.decim = sr / ROM_HZ
  }

  when(p: Float32Array) {
    return p[IDX.pcmLevel]! > 0
  }

  /** A key going down, from the bed drawn under the toy's or off a controller.
      A hand is a hand, so nothing here decides a length. */
  noteOn(note: number, gain = 1) {
    if (this.queued.length >= N_VOICES) this.queued.shift()
    this.queued.push({ note, gain })
  }

  noteOff(note: number) {
    for (const v of this.voices) {
      if (v.root === note && v.stage !== IDLE) v.stage = RELEASE
    }
  }

  /** Every note the chip is holding down, for the panel's third keybed. */
  soundingNotes(out: Int16Array): number {
    let n = 0
    for (const v of this.voices) if (v.stage !== IDLE) out[n++] = v.note
    return n
  }

  // Which voice takes a note. The same note again keeps its own voice, an idle
  // one is free, and a full part gives up whatever went down first — four
  // voices with a chord button on them means the part is always nearly full.
  private pick(note: number): Voice {
    for (const v of this.voices) {
      if (v.note === note && v.stage !== IDLE) return v
    }
    for (const v of this.voices) if (v.stage === IDLE) return v
    let steal = this.voices[0]!
    for (const v of this.voices) if (v.started < steal.started) steal = v
    return steal
  }

  private key(note: number, gain: number, held: boolean, root: number) {
    const v = this.pick(note)
    v.note = note
    v.root = root
    v.gain = gain
    v.held = held
    v.started = this.clock++
    v.age = 0
    v.pos = 0
    v.env = 0
    v.stage = ATTACK
    v.reg = rateReg(noteHz(note))
    // The counter's step, straight off the register rather than off the note
    // that was asked for, which is where the sharp top octave comes from.
    v.inc = (ROM_PER_CYCLE * regHz(v.reg)) / this.sr
  }

  // One key, and whatever the chord button puts under it. A four-note voicing
  // is the whole part, and that is not the panel being mean: the chip has four
  // voices and the button has no way to ask for a fifth.
  private strike(note: number, gain: number, held: boolean, chord: number) {
    this.lastNote = note
    for (const step of CHORDS[chord] ?? CHORDS[0]!) {
      this.key(note + step, gain, held, note)
    }
  }

  // The word at one address. Both buses are in the path and neither is in it on
  // a board nobody has been at, so an unbent chip reads the ROM as an array and
  // pays for nothing it is not using.
  private word(i: number): number {
    if (this.romData) return this.romData[i]! + DAC_STEPS
    const v = this.mono![Math.round(i * this.decim)] ?? 0
    const q = Math.round(v * (DAC_STEPS - 1))
    return (q < -127 ? -127 : q > 127 ? 127 : q) + DAC_STEPS
  }

  private read(pos: number): number {
    let a = pos | 0
    if (this.addrLine >= 0) {
      a = this.addrBus.read(a, this.addrLine, this.addrFault, this.busCut)
      // A line held high addresses past the end of a part that never had one:
      // the counter is wider than the memory it is walking, so what comes back
      // is the same words again from underneath. It folds rather than stops.
      a %= this.romLen
    }
    if (this.dataLine < 0) return (this.word(a) - DAC_STEPS) / DAC_STEPS
    const d = this.dataBus.read(
      this.word(a),
      this.dataLine,
      this.dataFault,
      this.busCut,
    )
    return ((d & 0xff) - DAC_STEPS) / DAC_STEPS
  }

  private stepEnv(v: Voice) {
    switch (v.stage) {
      case ATTACK:
        v.env += (1.02 - v.env) * this.attackCoef
        if (v.env >= 1) {
          v.env = 1
          v.stage = DECAY
        }
        break
      case DECAY:
        v.env *= this.decayCoef
        // A key nobody is holding never reaches the sustain: a gate is an edge,
        // and an edge has let go of the key before the attack is even over.
        if (v.env <= this.sustainAt) {
          v.stage = v.held && this.sustainAt > 0 ? SUSTAIN : RELEASE
        }
        break
      case SUSTAIN:
        v.env = this.sustainAt
        break
      case RELEASE:
        v.env *= this.releaseCoef
        if (v.env < ENV_FLOOR) {
          v.env = 0
          v.stage = IDLE
        }
        break
    }
  }

  // Which memory the counter walks, settled once a block. The wave ROM was cut
  // when the chip was built; the sample memory is whatever is threaded on the
  // sampler, and its loop is the two markers on that reel — so dropping a file
  // on the page and pressing a key is the whole of what this keyboard is
  // famous for.
  private selectVoice(voice: number, p: Float32Array): boolean {
    if (voice !== SAMPLED) {
      const wave = this.rom[voice] ?? this.rom[0]!
      this.romData = wave.data
      this.mono = null
      this.romLen = wave.data.length
      this.loopStart = wave.loopStart
      this.loopEnd = wave.loopEnd
      return true
    }
    const mono = this.sampler.mono
    // A second and a half is what the memory holds, and past that the part
    // never recorded anything — so the markers stop where the memory does.
    const len = mono
      ? Math.min(
          Math.round(SAMPLE_SECS * ROM_HZ),
          Math.floor(mono.length / this.decim),
        )
      : 0
    if (!mono || len < 4) {
      this.romData = null
      this.mono = null
      return false
    }
    const at = (frac: number) =>
      Math.min(Math.max(Math.round((frac * mono.length) / this.decim), 0), len)
    const lo = at(Math.min(p[IDX.loopIn]!, p[IDX.loopOut]!))
    const hi = at(Math.max(p[IDX.loopIn]!, p[IDX.loopOut]!))
    this.romData = null
    this.mono = mono
    this.romLen = len
    this.loopStart = Math.min(lo, len - 2)
    this.loopEnd = Math.max(hi, this.loopStart + 2)
    return true
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.pcmLevel]!
    const rail = this.rail
    // A reboot is not a note ending — it is the chip losing power in the middle
    // of one, so what was down comes back up with nothing on it.
    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      for (const v of this.voices) {
        v.stage = IDLE
        v.env = 0
      }
      this.queued.length = 0
    }

    const bay = ctx.mod
    this.addrLine =
      hop(p[IDX.pcmAddrLine]!, PCM_ADDR_LINES + 1, bay.read(DEST.pcmAddrLine)) -
      1
    this.addrFault = hop(
      p[IDX.pcmAddrFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.pcmAddrFault),
    )
    this.dataLine =
      hop(p[IDX.pcmDataLine]!, PCM_DATA_LINES + 1, bay.read(DEST.pcmDataLine)) -
      1
    this.dataFault = hop(
      p[IDX.pcmDataFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.pcmDataFault),
    )
    this.busCut = clamp01(p[IDX.pcmBusCut]!)

    const chord = Math.round(p[IDX.pcmChord]!)
    const vibrato = Math.round(p[IDX.pcmVibrato]!)
    const gateOn = p[IDX.pcmKeyGate]! < 0.5
    const drumMask = voiceMask(Math.round(p[IDX.pcmStruck]!))
    const loaded = this.selectVoice(Math.round(p[IDX.pcmVoice]!), p)

    // Every rate on this chip counts off the divider the pitch does, so a
    // starving rail stretches the envelopes along with the notes.
    const scale = Math.max(rail.clockFactor, 0.05)
    const shape = ENV_SHAPE[Math.round(p[IDX.pcmEnv]!)] ?? ENV_SHAPE[0]!
    this.attackCoef = 1 - Math.exp(-1 / (shape.attack * scale * this.sr))
    this.decayCoef = Math.exp(-1 / (shape.decay * scale * this.sr))
    this.releaseCoef = Math.exp(-1 / (p[IDX.pcmRelease]! * scale * this.sr))
    this.sustainAt = shape.sustain
    const toneCoef = lpCoef(p[IDX.pcmTone]!, this.sr)
    const vibDelay = VIB_DELAY * this.sr
    const vibStep = (VIB_HZ * scale * VIB_STEPS) / this.sr
    const clock = scale * p[IDX.pcmClockX]!
    const amp = rail.ampFactor * level * OUT_TRIM

    // The keys, before the block: a hand is holding them, so they land with the
    // voice this block is about to run rather than the one the last one left.
    for (const q of this.queued) this.strike(q.note, q.gain, true, chord)
    this.queued.length = 0

    const span = this.loopEnd - this.loopStart
    let load = 0

    for (let i = 0; i < io.n; i++) {
      this.vibPhase += vibStep
      while (this.vibPhase >= VIB_STEPS) this.vibPhase -= VIB_STEPS
      this.vibFactor = vibrato > 0 ? VIB_FACTOR[this.vibPhase | 0]! : 1

      // The toy's gate line, which is every note anything on this board strikes.
      // Somebody soldered it onto this keyboard's key input the way they did the
      // FM chip's, so out of the box the demo song plays the strings.
      const struck = gateOn ? ctx.trig.key[i]! : 0
      if (struck !== 0) {
        this.strike(struck - KEY_BIAS, 1, ctx.trig.keyHeld[i]! > 0, chord)
      }

      // And the kit's own lines, for whoever clipped them on here. A trigger
      // carries a strike and nothing else, so the note is the one the keyboard
      // last played — a drum pattern rekeying whatever chord you left standing.
      if (drumMask !== 0) {
        const bits = Math.round(ctx.trig.drumBits[i]!) & drumMask
        if (bits !== 0) {
          const gain = Math.min(ctx.trig.drumGain[i]! / ACCENT_GAIN, 1)
          this.strike(this.lastNote, gain, false, chord)
        }
      }

      if (!loaded) continue

      let sum = 0
      for (const v of this.voices) {
        if (v.stage === IDLE) continue
        this.stepEnv(v)
        v.age++
        // Delayed is the same LFO behind a wire that waits: the chip has one
        // oscillator, and the button decides when a voice starts listening.
        const depth =
          vibrato === 2 ? Math.min(v.age / vibDelay, 1) : vibrato > 0 ? 1 : 0
        v.pos += v.inc * clock * (1 + (this.vibFactor - 1) * depth)
        if (v.pos >= this.loopEnd) {
          v.pos = this.loopStart + ((v.pos - this.loopStart) % span)
        }
        sum += this.read(v.pos) * v.env * v.gain * VOICE_GAIN
      }

      // One output stage for four voices, eight bits wide, with the
      // reconstruction filter behind it: two poles and no more, which is why a
      // part cut at a fifth of the rate sounds like this rather than clean.
      const railed = sum < -1 ? -1 : sum > 1 ? 1 : sum
      const word = Math.round(railed * DAC_STEPS) / DAC_STEPS
      const out =
        this.toneB.process(this.toneA.process(word, toneCoef), toneCoef) * amp
      load += out < 0 ? -out : out
      io.l[i]! += out
      io.r[i]! += out
    }
    // Three chips on one supply are three chips' worth of current: the kit
    // writes this first and the other two add to it.
    rail.reported += load / io.n
  }

  panic() {
    for (const v of this.voices) {
      v.stage = IDLE
      v.env = 0
      v.pos = 0
    }
    this.queued.length = 0
    this.clock = 0
    this.lastNote = 0
    this.vibPhase = 0
    this.vibFactor = 1
    this.toneA.reset()
    this.toneB.reset()
    this.addrBus.reset()
    this.dataBus.reset()
  }
}
