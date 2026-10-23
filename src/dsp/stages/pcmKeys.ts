import { ACCENT_GAIN } from '../../drums.ts'
import { IDX } from '../../engine/params.ts'
import { Bus, FAULT_NAMES } from '../bus.ts'
import { DEST, hop } from '../modbus.ts'
import { SupplyTap, type Supplies } from '../supplies.ts'
import { KEY_BIAS, SEQ_TO_PCM, voiceMask } from '../trigbus.ts'
import { lpCoef, OnePoleLP } from '../util/onepole.ts'
import { mulberry32 } from '../util/rng.ts'
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
} from './pcmRom.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'
import type { Sampler } from './sampler.ts'

const N_VOICES = 4

const IDLE = 0
const ATTACK = 1
const DECAY = 2
const SUSTAIN = 3
const RELEASE = 4

const ENV_FLOOR = 0.0005

const ENV_SHAPE = [
  { attack: 0.004, decay: 1.7, sustain: 0 },
  { attack: 0.012, decay: 0.12, sustain: 0.85 },
  { attack: 0.55, decay: 0.9, sustain: 0.75 },
  { attack: 0.002, decay: 3.6, sustain: 0 },
]

const VIB_HZ = 6.2
const VIB_CENTS = 14
const VIB_DELAY = 0.45
const VIB_STEPS = 64
const VIB_FACTOR = Float64Array.from({ length: VIB_STEPS }, (_, i) =>
  Math.pow(2, (VIB_CENTS * Math.sin((2 * Math.PI * i) / VIB_STEPS)) / 1200),
)

const DAC_STEPS = 128
const VOICE_GAIN = 0.38
const OUT_TRIM = 0.8

const ADDR_SEED = 0x39
const DATA_SEED = 0x8e
const FAULT_SEED = 0x5a1

const LATCH_KEEPS = 5

const SAMPLE_WORDS = Math.round(SAMPLE_SECS * ROM_HZ)

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

const knob = (base: number, lane: Float32Array | null, i: number) =>
  clamp01(lane ? base + lane[i]! : base)

const bitsFor = (len: number) => Math.max(1, Math.ceil(Math.log2(len)))

interface Voice {
  note: number
  root: number
  pos: number
  inc: number
  reg: number
  env: number
  stage: number
  started: number
  age: number
  held: boolean
  gated: boolean
  gain: number
  dir: number
  runOn: boolean
  low: boolean
  at: number
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
  gated: false,
  gain: 1,
  dir: 1,
  runOn: false,
  low: false,
  at: 0,
})

function flatten(rom: { data: Int8Array }[]) {
  const flat = new Int8Array(rom.reduce((n, w) => n + w.data.length, 0))
  const base: number[] = []
  let at = 0
  for (const w of rom) {
    base.push(at)
    flat.set(w.data, at)
    at += w.data.length
  }
  return { flat, base }
}

export class PcmKeys implements Stage {
  label = 'pcmKeys'
  static readonly MAX_SOUNDING = N_VOICES

  private rom = buildPcmRom()
  private voices: Voice[] = Array.from({ length: N_VOICES }, newVoice)
  private clock = 0
  private lastNote = 0
  private queued: { note: number; gain: number; held: boolean }[] = []

  private flat: Int8Array
  private romBase: number[]
  private romRam: Int8Array
  private sampleRam = new Int8Array(SAMPLE_WORDS)
  private ramFor: unknown = null

  private mem: Int8Array | null = null
  private mono: Float32Array | null = null
  private base = 0
  private memLen = 0
  private romLen = 0
  private romBits = 1
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

  private rng = mulberry32(FAULT_SEED)
  private latched = 0
  private keepMask = -1

  private vibPhase = 0
  private vibFactor = 1
  private toneA = new OnePoleLP()
  private toneB = new OnePoleLP()

  private attackCoef = 1
  private decayCoef = 0
  private releaseCoef = 0
  private sustainAt = 0
  private decayTo = ENV_FLOOR

  private readonly sr: number
  private readonly power: SupplyTap
  private readonly sampler: Sampler

  constructor(sr: number, supplies: Supplies, sampler: Sampler) {
    this.sr = sr
    this.power = new SupplyTap(supplies)
    this.sampler = sampler
    this.decim = sr / ROM_HZ
    const { flat, base } = flatten(this.rom)
    this.flat = flat
    this.romBase = base
    this.romRam = new Int8Array(flat.length)
  }

  when(p: Float32Array) {
    return p[IDX.pcmLevel]! > 0
  }

  /** A key going down, from the bed drawn under the toy's or off a controller. */
  noteOn(note: number, gain = 1) {
    if (this.queued.length >= N_VOICES) this.queued.shift()
    this.queued.push({ note, gain, held: true })
  }

  noteOff(note: number) {
    for (const q of this.queued) if (q.note === note) q.held = false
    this.release(note, false)
  }

  /** The toy's key coming up. It ends only what the gate struck. */
  gateOff(note: number) {
    this.release(note, true)
  }

  private release(note: number, gated: boolean) {
    for (const v of this.voices) {
      if (v.root === note && v.gated === gated && v.stage !== IDLE)
        v.stage = RELEASE
    }
  }

  /** Every note the chip is holding down, for the panel's third keybed. */
  soundingNotes(out: Int16Array): number {
    let n = 0
    for (const v of this.voices) if (v.stage !== IDLE) out[n++] = v.note
    return n
  }

  private pick(note: number): Voice {
    for (const v of this.voices) {
      if (v.note === note && v.stage !== IDLE) return v
    }
    for (const v of this.voices) if (v.stage === IDLE) return v
    let steal = this.voices[0]!
    for (const v of this.voices) if (v.started < steal.started) steal = v
    return steal
  }

  private key(
    note: number,
    gain: number,
    held: boolean,
    root: number,
    gated: boolean,
  ) {
    const v = this.pick(note)
    v.note = note
    v.root = root
    v.gain = gain
    v.held = held
    v.gated = gated
    v.started = this.clock++
    v.age = 0
    v.pos = 0
    v.env = 0
    v.stage = ATTACK
    v.dir = 1
    v.runOn = false
    v.low = false
    v.reg = rateReg(noteHz(note))
    v.inc = (ROM_PER_CYCLE * regHz(v.reg)) / this.sr
  }

  private strike(
    note: number,
    gain: number,
    held: boolean,
    chord: number,
    gated = false,
  ) {
    this.lastNote = note
    for (const step of CHORDS[chord] ?? CHORDS[0]!) {
      this.key(note + step, gain, held, note, gated)
    }
  }

  private word(at: number): number {
    if (this.mem) return this.mem[at]! + DAC_STEPS
    const v = this.mono![Math.round(at * this.decim)] ?? 0
    const q = Math.round(v * (DAC_STEPS - 1))
    return (q < -127 ? -127 : q > 127 ? 127 : q) + DAC_STEPS
  }

  private read(v: Voice): number {
    let a = v.pos | 0
    if (this.keepMask !== -1) {
      const own = a
      a = (a & this.keepMask) | (this.latched & ~this.keepMask)
      this.latched = own
    }
    if (this.addrLine >= 0) {
      a = this.addrBus.read(a, this.addrLine, this.addrFault, this.busCut)
    }
    const lim = v.runOn ? this.memLen : this.romLen
    if (a >= lim) a %= lim
    let at = this.base + a
    if (at >= this.memLen) at -= this.memLen
    v.at = at
    if (this.dataLine < 0) return (this.word(at) - DAC_STEPS) / DAC_STEPS
    const d = this.dataBus.read(
      this.word(at),
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
        if (v.env <= this.decayTo) {
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

  private selectVoice(voice: number, p: Float32Array, writing: boolean) {
    if (voice !== SAMPLED) {
      const wave = this.rom[voice] ?? this.rom[0]!
      if (writing && this.ramFor !== this.flat) {
        this.romRam.set(this.flat)
        this.ramFor = this.flat
      }
      this.mem = writing ? this.romRam : this.flat
      this.mono = null
      this.base = this.romBase[voice] ?? 0
      this.memLen = this.flat.length
      this.romLen = wave.data.length
      this.romBits = bitsFor(this.romLen)
      this.loopStart = wave.loopStart
      this.loopEnd = wave.loopEnd
      return true
    }
    const mono = this.sampler.mono
    const len = mono
      ? Math.min(SAMPLE_WORDS, Math.floor(mono.length / this.decim))
      : 0
    if (!mono || len < 4) {
      this.mem = null
      this.mono = null
      return false
    }
    if (writing && this.ramFor !== mono) {
      this.mono = mono
      this.mem = null
      for (let i = 0; i < len; i++) this.sampleRam[i] = this.word(i) - DAC_STEPS
      this.ramFor = mono
    }
    const at = (frac: number) =>
      Math.min(Math.max(Math.round((frac * mono.length) / this.decim), 0), len)
    const lo = at(Math.min(p[IDX.loopIn]!, p[IDX.loopOut]!))
    const hi = at(Math.max(p[IDX.loopIn]!, p[IDX.loopOut]!))
    this.mem = writing ? this.sampleRam : null
    this.mono = mono
    this.base = 0
    this.memLen = len
    this.romLen = len
    this.romBits = bitsFor(len)
    this.loopStart = Math.min(lo, len - 2)
    this.loopEnd = Math.max(hi, this.loopStart + 2)
    return true
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.pcmLevel]!
    const rail = this.power.pick(p[IDX.pcmSupply]!)
    if (this.power.rebooted()) {
      for (const v of this.voices) {
        v.stage = IDLE
        v.env = 0
      }
      this.queued.length = 0
      this.ramFor = null
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

    const runOnBase = p[IDX.pcmRunOn]!
    const writeBase = p[IDX.pcmWrite]!
    const signBase = p[IDX.pcmSignDir]!
    const latchBase = p[IDX.pcmLatch]!
    const modRunOn = bay.read(DEST.pcmRunOn)
    const modWrite = bay.read(DEST.pcmWrite)
    const modSign = bay.read(DEST.pcmSignDir)
    const modLatch = bay.read(DEST.pcmLatch)
    const writing = writeBase > 0 || modWrite !== null
    if (!writing) this.ramFor = null

    const chord = Math.round(p[IDX.pcmChord]!)
    const vibrato = Math.round(p[IDX.pcmVibrato]!)
    const gateOn = p[IDX.pcmKeyGate]! < 0.5
    const sings = Math.round(p[IDX.monoSeqTo]!) === SEQ_TO_PCM
    const drumMask = voiceMask(Math.round(p[IDX.pcmStruck]!))
    const loaded = this.selectVoice(Math.round(p[IDX.pcmVoice]!), p, writing)

    const scale = Math.max(rail.clockFactor, 0.05)
    const shape = ENV_SHAPE[Math.round(p[IDX.pcmEnv]!)] ?? ENV_SHAPE[0]!
    this.attackCoef = 1 - Math.exp(-1 / ((shape.attack / scale) * this.sr))
    this.decayCoef = Math.exp(-1 / ((shape.decay / scale) * this.sr))
    this.releaseCoef = Math.exp(-1 / ((p[IDX.pcmRelease]! / scale) * this.sr))
    this.sustainAt = shape.sustain
    this.decayTo = Math.max(shape.sustain, ENV_FLOOR)
    const toneCoef = lpCoef(p[IDX.pcmTone]!, this.sr)
    const vibDelay = VIB_DELAY * this.sr
    const vibStep = (VIB_HZ * scale * VIB_STEPS) / this.sr
    const clock = scale * p[IDX.pcmClockX]!
    const amp = rail.ampFactor * level * OUT_TRIM

    for (const q of this.queued) this.strike(q.note, q.gain, q.held, chord)
    this.queued.length = 0

    const span = this.loopEnd - this.loopStart
    const voices = this.voices
    let load = 0

    for (let i = 0; i < io.n; i++) {
      this.vibPhase += vibStep
      while (this.vibPhase >= VIB_STEPS) this.vibPhase -= VIB_STEPS
      this.vibFactor = vibrato > 0 ? VIB_FACTOR[this.vibPhase | 0]! : 1

      const struck = gateOn ? ctx.trig.key[i]! : 0
      if (struck !== 0) {
        this.strike(struck - KEY_BIAS, 1, ctx.trig.keyHeld[i]! > 0, chord, true)
      }
      const sung = sings ? ctx.trig.seqKey[i]! : 0
      if (sung !== 0) this.strike(sung - KEY_BIAS, 1, false, chord, true)

      if (drumMask !== 0) {
        const bits = Math.round(ctx.trig.drumBits[i]!) & drumMask
        if (bits !== 0) {
          const gain = Math.min(ctx.trig.drumGain[i]! / ACCENT_GAIN, 1)
          this.strike(this.lastNote, gain, false, chord)
        }
      }

      if (!loaded) continue

      const runOn = knob(runOnBase, modRunOn, i) ** 2
      const flip = knob(signBase, modSign, i) ** 2
      const latch = knob(latchBase, modLatch, i)
      this.keepMask =
        latch > 0
          ? (1 <<
              (this.romBits -
                Math.ceil(latch * (this.romBits - LATCH_KEEPS)))) -
            1
          : -1

      let sum = 0
      let raw = 0
      for (const v of voices) {
        if (v.stage === IDLE) continue
        this.stepEnv(v)
        v.age++
        const depth =
          vibrato === 2 ? Math.min(v.age / vibDelay, 1) : vibrato > 0 ? 1 : 0
        if (flip === 0) v.dir = 1
        v.pos += v.inc * clock * (1 + (this.vibFactor - 1) * depth) * v.dir
        if (v.pos < this.loopStart && v.dir < 0) v.pos += span
        if (v.pos >= this.loopEnd && !v.runOn) {
          if (runOn > 0 && this.rng() < runOn) v.runOn = true
          else v.pos = this.loopStart + ((v.pos - this.loopStart) % span)
        }
        if (v.runOn && v.pos >= this.memLen) {
          v.pos -= this.memLen
          v.runOn = false
        }
        const s = this.read(v)
        if (flip > 0) {
          const low = s < 0
          if (v.low && !low && v.pos >= this.loopStart && this.rng() < flip)
            v.dir = -v.dir
          v.low = low
        }
        raw += s
        sum += s * v.env * v.gain * VOICE_GAIN
      }

      if (this.mem && this.ramFor !== null) {
        const chance = knob(writeBase, modWrite, i) ** 2
        if (chance > 0) {
          const q = Math.round(
            (raw < -1 ? -1 : raw > 1 ? 1 : raw) * (DAC_STEPS - 1),
          )
          for (const v of voices) {
            if (v.stage !== IDLE && this.rng() < chance) this.mem[v.at] = q
          }
        }
      }

      const railed = sum < -1 ? -1 : sum > 1 ? 1 : sum
      const word = Math.round(railed * DAC_STEPS) / DAC_STEPS
      const out =
        this.toneB.process(this.toneA.process(word, toneCoef), toneCoef) * amp
      load += out < 0 ? -out : out
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.drawing += load / io.n
  }

  panic() {
    for (const v of this.voices) {
      v.stage = IDLE
      v.env = 0
      v.pos = 0
      v.dir = 1
      v.runOn = false
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
    this.rng = mulberry32(FAULT_SEED)
    this.latched = 0
    this.ramFor = null
  }
}
