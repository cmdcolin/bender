import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { voiceMask } from '../trigbus'
import { softclip } from '../util/softclip'
import { Burst } from '../util/burst'
import { Drunk } from '../util/drift'
import { octaves, wrap1 } from '../util/pitch'
import { mulberry32, type Rng } from '../util/rng'
import { snap } from '../../scale'
import { Bus } from '../bus'
import {
  decodeStep,
  encodeStep,
  ROM_ADDR_LINES,
  ROM_DATA_LINES,
  ROMS,
  YOURS,
  type Rom,
} from './roms'
import {
  asTuneLen,
  decodeTune,
  encodeTune,
  HOLD,
  isNote,
  keyOf,
  REST,
  TUNE_LANE_KEYS,
  TUNE_STEPS,
} from '../../tune'

// One index table per lane: the melody the oscillator plays, then the two
// stacked chips whose notes come out on the key line.
const LANE_IDX = TUNE_LANE_KEYS.map(keys => keys.map(k => IDX[k]))
const TUNE_IDX = LANE_IDX[0]!

const BASE_HZ = 220
const ENV_FLOOR = 0.003

// An envelope that has fallen under the floor stops there, rather than halving
// its way toward zero for the rest of the session.
//
// Everything here already treats the floor as silence — a voice under it is a
// voice free to be stolen, and none of them are summed — so the last stretch
// was inaudible arithmetic. It was not free arithmetic, though: five minutes of
// quiet is all it takes for a decaying double to reach the range the hardware
// stops handling in one piece, and from there every multiply costs twenty times
// what it did. The one stage that is always on doubled in cost the longer the
// toy was left switched on, and stayed doubled.
const fade = (env: number, decay: number) => (env > ENV_FLOOR ? env * decay : 0)

// Every note the divider can strike, as a ratio. The ROM steps, the keys and the
// triads are all whole semitones, so the chip's own pitches are a table — eight
// voices at eight Math.pow calls a sample is the one stage that is always on
// paying for arithmetic it did last sample.
const SEMI_LO = -48
const SEMI = Float64Array.from({ length: 144 }, (_, i) =>
  Math.pow(2, (i + SEMI_LO) / 12),
)
const ratio = (semitone: number) =>
  SEMI[semitone - SEMI_LO] ?? Math.pow(2, semitone / 12)

// The tone selector taps the divider chain at a different width. Narrow pulses
// null different harmonics; none of them is compensated for level, exactly as
// the cheap chips left them.
export const TONE_DUTY = [0.5, 0.25, 0.125, 0.0625]

// The arpeggiator's patterns, in the order the switch has them. It is not a
// second sequencer: the counter that walks the ROM is walking the keys your
// hand is holding instead, off the same divider, so every bend on the clock is
// a bend on the arpeggio.
export const ARP_MODES = ['off', 'up', 'down', 'up-down', 'random', 'as played']
const ARP = { up: 1, down: 2, upDown: 3, random: 4, asPlayed: 5 }

// The wire the toy never shipped with: the kit's step clock brought over to the
// timing chain, dividing. What the selector picks is how much of a beat one toy
// step is worth — the kit counts sixteen steps to the bar, so the first of these
// is one step of the tune per step of the pattern.
export const SYNC_MODES = ['off', 'sixteenths', 'eighths', 'quarters']
const SYNC_PER_BEAT = [0, 4, 2, 1]

// The rate a locked chip counts at, taken from the tempo as the panel has it
// written rather than as the kit is currently keeping it. Both machines hang off
// one supply and one divider: the drum machine multiplies its own step rate by
// the rail's clockFactor, and so does everything below here, so a sag arrives on
// both sides on its own. Reading the kit's running rate into this number would
// charge the toy for it twice and the tune would fall behind the pattern exactly
// as fast as the batteries went flat.
const kitStepHz = (bpm: number, mode: number) =>
  (Math.max(bpm, 0.6) / 60) * (SYNC_PER_BEAT[mode] ?? 4)

// Four notes, as the toys of the era had, and how far apart the four output
// stages came out of the bin. Written as a deviation from nominal rather than
// as the trims themselves, so the knob that scales it has a zero: all four
// parts identical, and a chord that browns out in lockstep instead of dying a
// voice at a time. One is the spread the board shipped with.
const VOICE_SPREAD = [-0.14, 0.21, -0.03, 0.12]
const trimAt = (k: number, spread: number) => 1 + VOICE_SPREAD[k]! * spread

// A key voice. Silence is its envelope being down, not a sentinel note: the keys
// reach two octaves under the toy's own bottom, and a semitone below zero is a
// note like any other.
interface Voice {
  note: number
  phase: number
  env: number
  held: boolean
  started: number
}

// Auto-bass-chord: the accompaniment section the toys ran under the demo song.
// Tonic, dominant, subdominant — three chords is all the cheap ones offered.
const MAJOR_TRIADS = [
  [0, 4, 7],
  [7, 11, 14],
  [5, 9, 12],
]
const MINOR_TRIADS = [
  [0, 3, 7],
  [7, 11, 14],
  [5, 8, 12],
]

const pitchClass = (n: number) => ((n % 12) + 12) % 12

// Each ROM declares its own key, so the triads land in the song's key rather
// than wherever the note numbers happen to start.
const triadsFor = (song: { key: number; minor?: boolean }) =>
  (song.minor ? MINOR_TRIADS : MAJOR_TRIADS).map(t => t.map(n => n + song.key))

const BASS_TRIM = 1.05
const CHORD_TRIM = [0.9, 1.15, 1]
// The triad sits under the melody rather than beside it.
const CHORD_GAIN = 0.7

// A jammed output stage sits where the latch left it instead of following the
// rail down.
const LATCH_AMP = 0.85

// How far a capacitor hung on the timing pin can divide the clock, in octaves.
// Four is what puts a toy melody under the bottom of its own keyboard and turns
// its squares into something you feel rather than hear — which is the stock
// value, not a ceiling: the knob is which cap you hung there, and the dive goes
// as deep as the part you found.
const dragDivisor = (octaves: number) => Math.pow(2, octaves) - 1

// One small output stage carries every voice, so a chord leans on its headroom
// rather than coming out four times louder.
const mixVoices = (sum: number, drive: number) => softclip(sum * drive) / drive

// A counter can't strike a pulse narrower than one clock tick, so the narrow
// tones widen back toward a square as the note climbs past the divider's
// resolution — the same place a real chip runs out of counts. The output cap
// centres the result, so a narrow tap swings the same peak-to-peak as a square
// but comes out as a spike carrying less of the energy.
const pulse = (phase: number, duty: number, inc: number) => {
  const d = Math.max(duty, inc)
  return phase < d ? 2 * (1 - d) : -2 * d
}

export class ToyChip implements Stage {
  label = 'toyChip'
  private phase = 0
  private pos = 0
  // What the melody oscillator is on, or REST for nothing. A sentinel rather
  // than a negative number, because the memory reaches two octaves under the
  // chip's bottom A and a note below zero is a note like any other.
  private note: number = REST
  private stepClock = 0
  // The steps being played this block and how many of them come round: the
  // ROM's own table, or the memory's. Filled in place from the params rather
  // than built, because an array built per block is garbage per block on the
  // one thread that cannot collect it.
  private mine = new Array<number>(TUNE_STEPS).fill(REST)
  // The stacked chips' steps, in the same shape and read off the same address.
  private stacks = LANE_IDX.slice(1).map(() =>
    new Array<number>(TUNE_STEPS).fill(REST),
  )
  private poly = false
  private yours = false
  private len = 1
  // What the memory held when its key was last worked out. The accompaniment
  // needs a key and yours is read off the notes, so it is worked out when they
  // change rather than every block.
  private mineStamp = NaN
  private env = 0
  private voices: Voice[] = VOICE_SPREAD.map(() => ({
    note: 0,
    phase: 0,
    env: 0,
    held: false,
    started: 0,
  }))
  private voiceClock = 0
  private triads = MAJOR_TRIADS
  private lastRom: Rom | undefined
  private chord = MAJOR_TRIADS[0]!
  private bassNote = 0
  private bassFifth = false
  private bassPhase = 0
  private bassEnv = 0
  private chordPhase = [0, 0, 0]
  private chordEnv = 0
  // Where the key line's matrix is wired, for the notes this chip strikes on
  // its own. The keybeds are snapped on the other thread, so what these two are
  // for is the trigger patch — nothing over there ever sees the note.
  private keyScale = 0
  private keyRoot = 0
  private gateState = 1
  private gateClock = 0
  private clockWalk = 0
  private lastReboot = 0
  private wasPlaying = false
  // The gate, waiting to go out on the bus. A flag rather than a sentinel note:
  // the keys reach under the toy's bottom key, so there is no note number left
  // over to mean "nothing struck".
  private keyPending = false
  private keyNote = 0
  // The keys a hand is holding, in the order they went down, and the same list
  // sorted — which is the whole of what the arpeggiator plays. Held here rather
  // than read off the voices because there are four voices and no reason a hand
  // cannot hold five keys: what the arpeggio walks is the hand, and what the
  // voices do is run out.
  //
  // Both are rebuilt on a key event and never inside the block, so the sort is
  // a handful of numbers on a key press rather than arithmetic per sample.
  private heldKeys: number[] = []
  private arpUp: number[] = []
  private arpClock = 0
  private arpStep = 0
  // Whether the switch is on, as of the last block: a key goes down between two
  // blocks, and it has to know then whether to sound or to wait for the count.
  private arping = false
  // Whether a hand is still on the key the gate is about to report. The ROM and
  // a trigger line strike and let go in the same instant; a finger does not.
  private keyHeldPending = false
  private lastTiming = 0
  private envDecay = 1
  // The last block's accompaniment level, kept for the note report: bass and
  // chord envelopes run whether or not anyone can hear them.
  private accompLevel = 0
  private rng: Rng
  // The two buses between the ROM and the rest of the chip, and where the knife
  // is on them this block. Held here rather than passed down because every read
  // of the ROM has to go through the same fault — a sequencer that saw one note
  // and a divider that got another would be two chips.
  private dataBus: Bus
  private addrBus: Bus
  private dataLine = -1
  private dataFault = 0
  private addrLine = -1
  private addrFault = 0
  private busCut = 1
  // The crystal's own wander, and the counter's habit of slipping in runs
  // rather than at a steady rate.
  private drift = new Drunk()
  private counterFault: Burst

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
    seed = 101,
  ) {
    this.rng = mulberry32(seed)
    this.counterFault = new Burst(sr, 1.1)
    this.dataBus = new Bus(ROM_DATA_LINES, seed ^ 0xda7a)
    this.addrBus = new Bus(ROM_ADDR_LINES, seed ^ 0xadd4)
  }

  // The toy's own keys are switches: they pass no gain and strike at full. A
  // wire onto the gate can arrive at any level, which is what the trigger patch
  // has always done and what a controller's velocity is.
  noteOn(semitone: number, gain = 1) {
    if (!this.heldKeys.includes(semitone)) {
      this.heldKeys.push(semitone)
      this.arpUp = [...this.heldKeys].sort((a, b) => a - b)
      // A chord going down on an idle arpeggiator strikes its first note there
      // and then, rather than a beat later: the count starts under your hand.
      if (this.heldKeys.length === 1) this.arpClock = 1
    }
    // With the switch on, a key held is a key waiting its turn — the count is
    // what strikes it, and holding it down would be a drone under the arpeggio.
    if (this.arping) return
    this.strike(semitone, gain).held = true
    this.keyHeldPending = true
  }

  // A voice struck and let go. The keys hold theirs down; a trigger line
  // soldered onto the gate does not, so what it strikes decays like a ROM note.
  private strike(semitone: number, gain: number): Voice {
    const v = this.pick(semitone)
    v.note = semitone
    v.env = gain
    v.held = false
    v.started = this.voiceClock++
    this.keyNote = semitone
    this.keyPending = true
    this.keyHeldPending = false
    return v
  }

  noteOff(semitone: number) {
    const at = this.heldKeys.indexOf(semitone)
    if (at >= 0) {
      this.heldKeys.splice(at, 1)
      this.arpUp = [...this.heldKeys].sort((a, b) => a - b)
      // The last key up ends the figure rather than pausing it, so the next
      // chord starts on its own first note instead of halfway through the last.
      if (this.heldKeys.length === 0) this.arpStep = 0
    }
    for (const v of this.voices) if (v.note === semitone) v.held = false
  }

  // Which note the count is on. Every mode is one walk over the held keys,
  // stacked as many octaves up as the range asks for — the pattern decides the
  // order and the octave falls out of how far along the walk it has got.
  private arpNote(mode: number, range: number): number {
    const keys = mode === ARP.asPlayed ? this.heldKeys : this.arpUp
    const n = keys.length
    const span = n * range
    if (mode === ARP.random) {
      const k = Math.floor(this.rng() * span) % span
      return keys[k % n]! + 12 * Math.floor(k / n)
    }
    // Up-down turns round on the ends without playing either of them twice, so
    // a three-note chord is five steps rather than six.
    const cycle = mode === ARP.upDown && span > 1 ? span * 2 - 2 : span
    const step = this.arpStep++ % cycle
    const at = step < span ? step : cycle - step
    const oct = Math.floor(at / n)
    // Down means down: the walk starts on the top note of the top octave and
    // falls off the bottom, rather than descending its way upward.
    return mode === ARP.down
      ? keys[n - 1 - (at % n)]! + 12 * (range - 1 - oct)
      : keys[at % n]! + 12 * oct
  }

  // Every note the chip is making a sound with, written into `out` and returned
  // as a count — the melody, the backing it walks under it, and the four key
  // voices, which is where your hands, a controller and the kit's trigger line
  // all end up. What the panel's keyboard lights, so a tune plays itself across
  // the drawn keys and a kick bridged onto the gate shows which note it strikes.
  //
  // Envelopes rather than note numbers decide, because a voice that has decayed
  // still remembers what it played. A chip that is rebooting or dead is silent
  // whatever its envelopes say.
  soundingNotes(out: Int16Array): number {
    let n = 0
    if (this.rail.booting || this.rail.dead) return n
    if (this.transport.tune && isNote(this.note) && this.env > ENV_FLOOR)
      out[n++] = this.note
    if (this.accompLevel > 0) {
      if (this.bassEnv > ENV_FLOOR) out[n++] = this.bassNote
      if (this.chordEnv > ENV_FLOOR)
        for (const note of this.chord) out[n++] = note
    }
    for (const v of this.voices) if (v.env > ENV_FLOOR) out[n++] = v.note
    return n
  }

  /** How many notes `soundingNotes` can report at once. */
  static readonly MAX_SOUNDING = 9

  /** Where the tune's counter is standing, and how far through that step it has
      got. The panel quantizes a note you play in against these: the memory runs
      on the chip's own clock, and every bend that drags that clock — the pot on
      the timing pin, a flat rail, the crystal wandering — is already in them,
      which nothing on the other thread could work out for itself. */
  get tunePos() {
    return this.pos
  }

  get tuneFrac() {
    return Math.min(Math.max(this.stepClock, 0), 1)
  }

  // Retrigger the note if it is already up, else take a silent voice; failing
  // that steal, preferring a released voice and the oldest within its group.
  private pick(semitone: number): Voice {
    for (const v of this.voices) if (v.note === semitone) return v
    for (const v of this.voices) if (!v.held && v.env <= ENV_FLOOR) return v
    let steal = this.voices[0]!
    for (const v of this.voices) {
      if (v.held === steal.held ? v.started < steal.started : !v.held) steal = v
    }
    return steal
  }

  // Also true when only the drums or the FM chip play: this stage owns the
  // shared rail tick, and it owns the key line the FM chip is soldered onto, so
  // the demo song has to keep clocking even with the toy itself turned down.
  when(p: Float32Array) {
    return p[IDX.chipLevel]! > 0 || p[IDX.drumLevel]! > 0 || p[IDX.fmLevel]! > 0
  }

  // The only way anything here reads the ROM. The counter puts an address on
  // one bus and a note code comes back on the other, so a fault on either
  // reaches the melody, the chord the accompaniment harmonises to and whatever
  // a drum hit clocks out of the tune alike.
  // Where the counter actually lands. Split out because one counter addresses
  // all three chips: a step reads the melody and the two stacked lanes off the
  // same faulted address, rather than rolling the address fault once a lane and
  // playing a chord off three different steps.
  private romAddr(pos: number): number {
    return (
      this.addrBus.read(pos, this.addrLine, this.addrFault, this.busCut) %
      this.len
    )
  }

  private readRom(tune: number[], pos: number): number {
    return this.readAt(tune, this.romAddr(pos))
  }

  private readAt(tune: number[], addr: number): number {
    const step = tune[addr]!
    const word = this.dataBus.read(
      this.yours ? encodeTune(step) : encodeStep(step),
      this.dataLine,
      this.dataFault,
      this.busCut,
    )
    // Both banks come back in the memory's vocabulary, so nothing downstream
    // has to know which of the two it is reading. The ROM's own spelling — -1
    // for a rest, -2 for a hold — only works because its steps never go below
    // the chip's bottom A, and yours do.
    if (this.yours) return decodeTune(word)
    const rom = decodeStep(word)
    return rom === -1 ? REST : rom === -2 ? HOLD : rom
  }

  // The stacked chips, on the address the melody was read at. They are wired to
  // the key line, so what they hold takes key voices and decays like a struck
  // note — a chord the memory plays through the voices your hands would use.
  private strikeStacks(addr: number) {
    if (!this.poly) return
    for (const lane of this.stacks) {
      const note = lane[addr]!
      if (isNote(note)) this.strike(note, 1)
    }
  }

  // Pressing play drops the needle on step 0. Coming back from a brownout is
  // not that tidy: the program counter holds whatever junk was in the latch when
  // the rail went, so the tune comes back from the middle of itself as often as
  // from the top. Rebooting into bar one every time is what made a starving chip
  // sound like a loop.
  private restart(tune: number[], junk = false) {
    this.pos = junk && this.rng() < 0.6 ? Math.floor(this.rng() * this.len) : 0
    this.stepClock = junk ? this.rng() : 0
    const addr = this.romAddr(this.pos)
    const step = this.readAt(tune, addr)
    this.note = isNote(step) ? step : REST
    this.env = isNote(step) ? 1 : 0
    this.strikeStacks(addr)
    this.chord = this.triads[0]!
    this.bassFifth = false
  }

  // The accompaniment reads the melody instead of a chord button: a chord tone
  // moves it, a passing tone leaves it where it stands.
  private harmonize(note: number) {
    const pc = pitchClass(note)
    const found = this.triads.find(t => t.some(n => pitchClass(n) === pc))
    if (found) this.chord = found
  }

  // The accompaniment section, off whichever clock moved the step: bass on the
  // step, chord stab on the offbeat, the bass alternating root and fifth the way
  // the toys walked it.
  private oomPah() {
    if (this.pos % 2 === 0) {
      this.bassNote = (this.bassFifth ? this.chord[2]! : this.chord[0]!) - 12
      this.bassFifth = !this.bassFifth
      this.bassEnv = 1
    } else {
      this.chordEnv = 1
    }
  }

  // What a hit off the kit's trigger line does to the chip. It strikes a voice
  // rather than the melody oscillator, so it sounds whether or not the demo
  // song is running — the same as your hands do.
  private fromDrum(mode: number, tune: number[], gain: number) {
    // The matrix on the key line catches these on the way to the voice. A kick
    // picking a step at random is a note nobody chose — which is the reason to
    // have the thing at all — and it is only the voice that moves: the counter
    // stays on the step as written, and so does the chord the melody sets.
    const hit = (note: number) =>
      this.strike(snap(note, this.keyScale, this.keyRoot), gain)
    switch (mode) {
      // The kit clocks the tune: one hit, one step of the ROM, so a sixteen-step
      // pattern plays the melody and the kick decides where the beat is.
      case 1: {
        this.pos = (this.pos + 1) % this.len
        const step = this.readRom(tune, this.pos)
        if (isNote(step)) {
          this.note = step
          this.harmonize(step)
          hit(step)
        }
        // The whole band walks with the step, so the backing follows the kick
        // rather than a clock the tune is no longer keeping.
        this.oomPah()
        return
      }
      case 2: {
        const step = this.readRom(tune, Math.floor(this.rng() * this.len))
        if (isNote(step)) hit(step)
        return
      }
      case 3:
        hit(this.chord[Math.floor(this.rng() * 3)]!)
        return
      default:
        hit(isNote(this.note) ? this.note : this.chord[0]!)
    }
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.chipLevel]!
    // The nineteenth tune is the one you played in. It is not in the bank —
    // the bank is what the chip shipped with — so it arrives as sixteen params
    // and is copied into an array this owns, and from there down nothing in the
    // stage knows which of the two it is playing.
    const pick = Math.round(p[IDX.chipTune]!)
    this.yours = pick === YOURS
    const rom = ROMS[pick] ?? ROMS[0]!
    const tune = this.yours ? this.mine : rom.steps
    // What the part itself counts at: the ROM's own nominal rate, or the knob
    // that stands in for one when the chip is playing the memory. A lock
    // replaces this number and nothing else. Everything downstream of it still
    // drags the tune — Clock, a pot on the timing pin, the crystal wandering, a
    // rail going flat — because all of that is in `timing` below and `timing` is
    // still what the count is multiplied by. A toy that kept time through a
    // dying battery would be half the instrument gone.
    const nominalHz = this.yours ? Math.max(p[IDX.tuneRate]!, 0.01) : rom.stepHz
    const sync = Math.round(p[IDX.chipSync]!)
    const stepHz = sync > 0 ? kitStepHz(p[IDX.drumBpm]!, sync) : nominalHz
    let stamp = 0
    this.poly = false
    if (this.yours) {
      this.len = asTuneLen(p[IDX.tuneLen]!)
      this.poly = Math.round(p[IDX.tunePoly]!) === 1
      stamp = this.len
      for (let i = 0; i < TUNE_STEPS; i++) {
        const step = p[TUNE_IDX[i]!]!
        this.mine[i] = step
        stamp = (stamp * 31 + step) % 0x7fffffff
      }
      for (let lane = 0; lane < this.stacks.length; lane++) {
        const idx = LANE_IDX[lane + 1]!
        const steps = this.stacks[lane]!
        for (let i = 0; i < TUNE_STEPS; i++) {
          const step = p[idx[i]!]!
          steps[i] = step
          stamp = (stamp * 31 + step) % 0x7fffffff
        }
      }
    } else {
      this.len = rom.steps.length
    }
    const clockX = p[IDX.chipClockX]!
    const baseStarve = p[IDX.chipStarve]!
    const battery = p[IDX.chipBattery]!
    const spot = Math.round(p[IDX.chipBendSpot]!)
    const pot = p[IDX.chipBendPot]!
    // Choice 0 on either selector is a bus nobody has been at, so the lines
    // count from -1 and every read below is a straight one.
    this.dataLine = Math.round(p[IDX.chipDataLine]!) - 1
    this.dataFault = Math.round(p[IDX.chipDataFault]!)
    this.addrLine = Math.round(p[IDX.chipAddrLine]!) - 1
    this.addrFault = Math.round(p[IDX.chipAddrFault]!)
    this.busCut = p[IDX.chipBusCut]!
    const tone = TONE_DUTY[Math.round(p[IDX.chipTone]!)] ?? TONE_DUTY[0]!
    // bias bend drags the duty cycle up from whatever the tone selector taps
    const duty = spot === 3 ? Math.min(tone + pot * 0.45, 0.98) : tone
    const micToRail = Math.round(p[IDX.micPatch]!) === 1
    const fbToRail = ctx.fbDest === 2
    const modClock = ctx.mod.read(DEST.chipClock)
    // A wire onto the supply itself. Everything else on this board is powered
    // from the rail, so this is the one destination that reaches all of them at
    // once: a kick on it browns the toy out on every hit, the LFO on it is a
    // rail that dies in time.
    const modStarve = ctx.mod.read(DEST.starve)
    const accomp = p[IDX.chipAccomp]!
    this.accompLevel = accomp
    // Whichever of the kit's voices is bridged onto the gate, and what it plays.
    const trigMask = voiceMask(Math.round(p[IDX.trigToKeys]!))
    const trigNote = Math.round(p[IDX.trigKeysNote]!)
    this.keyScale = Math.round(p[IDX.keyScale]!)
    this.keyRoot = Math.round(p[IDX.keyRoot]!)
    const drift = p[IDX.chipDrift]!
    const arpMode = Math.round(p[IDX.chipArp]!)
    const arpHz = p[IDX.chipArpHz]!
    const arpRange = Math.max(Math.round(p[IDX.chipArpOct]!), 1)
    // Whether a key going down between blocks sounds on its own or waits for
    // the count. The switch moving with a hand already on the keys hands the
    // chord over either way: on, and what was droning lets go for the count to
    // walk; off, and what your hand is still holding comes back as a chord.
    if (this.arping !== arpMode > 0) {
      this.arping = arpMode > 0
      if (this.arping) for (const v of this.voices) v.held = false
      else for (const note of this.heldKeys) this.noteOn(note)
    }
    const cluster = p[IDX.faultCluster]!
    const couple = p[IDX.couple]!
    const rail = this.rail
    const maxHz = this.sr * 0.49
    const clipHz = p[IDX.chipClipHz]!
    const clipClock = p[IDX.chipClipClock]!
    // What the board is doing, then what the board is made of. Both once a
    // block: the parts are knobs like any other, and a hand on one of them is a
    // part being swapped between blocks rather than mid-sample.
    rail.setBoard(
      battery,
      ctx.heat,
      p[IDX.chipLatch]!,
      cluster,
      p[IDX.chipCap]!,
    )
    rail.setParts({
      lead: p[IDX.chipLeadR]!,
      latchHold: p[IDX.chipLatchHold]!,
      watchdog: p[IDX.chipWatchdog]!,
      clipStarve: p[IDX.chipClipBite]!,
      clipHold: p[IDX.chipClipHold]! / 1000,
      dragPull: p[IDX.chipClipCharge]!,
      dragDrop: p[IDX.chipClipRelease]!,
      decouple: p[IDX.chipDecouple]! / 1000,
    })
    const dragMax = dragDivisor(p[IDX.chipDragOct]!)
    const spread = p[IDX.chipSpread]!
    const mixDrive = p[IDX.chipMixDrive]!

    // Which key the backing plays in. A ROM says so; a melody you played in
    // does not, so it is read off the notes — and only when they change, since
    // reading it is a walk over the memory and a fresh set of triads.
    if (this.yours) {
      if (stamp !== this.mineStamp) {
        this.mineStamp = stamp
        this.lastRom = undefined
        // The chord lanes count toward the key: a third somebody stacked on
        // the melody is the note that says major or minor, and reading the
        // melody alone would harmonise against half of what is playing.
        this.triads = triadsFor(
          keyOf([
            ...this.mine.slice(0, this.len),
            ...(this.poly
              ? this.stacks.flatMap(l => l.slice(0, this.len))
              : []),
          ]),
        )
        this.chord = this.triads[0]!
      }
    } else if (rom !== this.lastRom) {
      this.lastRom = rom
      this.mineStamp = NaN
      this.triads = triadsFor(rom)
      this.chord = this.triads[0]!
    }

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.restart(tune, true)
    }
    if (this.transport.tune !== this.wasPlaying) {
      this.wasPlaying = this.transport.tune
      if (this.wasPlaying) this.restart(tune)
    }

    for (let i = 0; i < io.n; i++) {
      this.counterFault.step()
      const latched = rail.latched
      // clock bend: the pot shorts the RC — wildly fast and unstable
      let clock = clockX
      if (spot === 1 && pot > 0) {
        this.clockWalk += (this.rng() - 0.5) * pot * 0.2
        this.clockWalk *= 0.999
        clock *= 1 + pot * 24 * (1 + 0.4 * Math.sin(this.clockWalk))
      }
      // The clip landing on the timing pin instead of the supply, which is the
      // other way to move a clock and by far the larger one. Starving the rail
      // is worth a fraction of an octave before the chip stops running at all;
      // hanging a capacitor off the oscillator divides it, and dividing has no
      // such limit. As deep as the part you hung there, travelling at whatever
      // rate that cap charges — the whole timebase going with it, so the tune,
      // the tempo and the envelopes dive together and the melody arrives
      // somewhere under the bottom of the keyboard.
      if (clipClock > 0) clock /= 1 + clipClock * dragMax * rail.clipTravel
      // The toy runs on its own crystal and it wanders. Nothing pulls it back,
      // so it never settles on a ratio with the drum machine — the two lean past
      // each other and come back for as long as you leave it running. A lock
      // does not stop that either: it hands the counter a rate off the kit and
      // then the wander is applied to it, which is a tune that starts the bar
      // with the pattern and breathes against it rather than one that walks off.
      // The wire is on the timing pin, not on a phase detector.
      if (drift > 0) {
        clock *= 1 + this.drift.step(0.08, this.sr, this.rng) * 0.3 * drift
      }
      if (modClock) clock *= octaves(modClock[i]! * 3)
      // Flat cells slow the divider itself, so the song runs late as well as low.
      const timing = clock * rail.clockFactor

      // sequencer — the run/stop line freezes it where it stands, and so does a
      // latched die: the counter stops clocking and the note it was on stays on
      if (this.transport.tune && !latched) {
        this.stepClock += (stepHz * timing) / this.sr
      }
      if (this.stepClock >= 1) {
        this.stepClock -= 1
        let next = this.pos + 1
        // counter bend: program counter corruption
        if (
          spot === 2 &&
          this.counterFault.roll(pot * 0.7, cluster, this.rng)
        ) {
          next = this.rng() < 0.5 ? this.pos : Math.floor(this.rng() * this.len)
        }
        this.pos = next % this.len
        const addr = this.romAddr(this.pos)
        // A hold keeps whatever is ringing; a rest drops the voice; a note strikes
        const step = this.readAt(tune, addr)
        this.strikeStacks(addr)
        if (isNote(step)) {
          this.note = step
          this.env = 1
          this.keyNote = step
          this.keyPending = true
          this.harmonize(step)
        } else if (step === REST) {
          this.note = REST
        }

        this.oomPah()
      }

      // The arpeggiator, on the same divider as everything else on this die —
      // which is the whole of why it is here rather than on a clock of its own.
      // Slow the chip and the figure slows with the tune, the tempo and the
      // envelopes; put a pot on the timing pin and it dives with them. A cheap
      // keyboard's arpeggio was never a musical decision, it was whatever the
      // counter was doing. Its rate is its own knob rather than the ROM's
      // number, though, so a lock does not land it on the kit the way it lands
      // the tune: what the figure gets from the kit is what the divider gets,
      // which is every bend and no tempo.
      if (arpMode > 0 && this.heldKeys.length > 0) {
        this.arpClock += (arpHz * timing) / this.sr
        while (this.arpClock >= 1) {
          this.arpClock -= 1
          this.strike(this.arpNote(arpMode, arpRange), 1)
        }
      }

      // The kit's trigger line, bridged onto the gate. The hit is a block old,
      // which is 2.7 ms and nothing a trigger line has ever been able to tell.
      if (trigMask && Math.round(ctx.trig.drumBits[i]!) & trigMask) {
        this.fromDrum(trigNote, tune, Math.min(ctx.trig.drumGain[i]!, 1))
      }

      // gate bend: the gate line buzzes open and shut
      if (spot === 4 && pot > 0) {
        this.gateClock += ((30 + pot * 400) * (0.5 + this.rng())) / this.sr
        if (this.gateClock >= 1) {
          this.gateClock -= 1
          this.gateState =
            this.rng() < 0.5 + pot * 0.3 ? 1 - this.gateState : this.gateState
        }
      } else {
        this.gateState = 1
      }

      // One envelope generator, timed off the ROM's own step rate the way a
      // cheap chip ties decay to its tempo clock. Only a moving clock — the bend
      // walking, the crystal wandering, or a wire on it — makes that a fresh exp
      // every sample; a latch holds the envelope where it stood along with
      // everything else it froze.
      if (timing !== this.lastTiming) {
        this.lastTiming = timing
        this.envDecay = Math.exp(-(0.8 * stepHz * timing) / this.sr)
      }
      const envDecay = latched ? 1 : this.envDecay
      this.env = fade(this.env, envDecay)
      this.bassEnv = fade(this.bassEnv, envDecay)
      this.chordEnv = fade(this.chordEnv, envDecay)
      for (const v of this.voices) if (!v.held) v.env = fade(v.env, envDecay)

      // A latched output stage is jammed on rather than fading with the supply,
      // so the note doesn't get quieter as the rail goes — it holds its level
      // and dives in pitch until there is no rail left to hold it.
      const amp = latched ? LATCH_AMP : rail.ampFactor

      let out = 0
      if (!rail.booting && !rail.dead) {
        const note = this.transport.tune ? this.note : REST
        if (isNote(note) && this.env > ENV_FLOOR) {
          const hz = Math.min(
            BASE_HZ * ratio(note) * clock * rail.pitchFactor,
            maxHz,
          )
          const inc = hz / this.sr
          this.phase = wrap1(this.phase + inc)
          out += pulse(this.phase, duty, inc) * this.env * amp
        }
        let keys = 0
        if (accomp > 0) {
          if (this.bassEnv > ENV_FLOOR) {
            const hz = Math.min(
              BASE_HZ *
                ratio(this.bassNote) *
                clock *
                rail.pitchFactorAt(BASS_TRIM),
              maxHz,
            )
            const inc = hz / this.sr
            this.bassPhase = wrap1(this.bassPhase + inc)
            keys +=
              pulse(this.bassPhase, duty, inc) *
              this.bassEnv *
              rail.ampFactorAt(BASS_TRIM) *
              accomp
          }
          if (this.chordEnv > ENV_FLOOR) {
            for (let c = 0; c < 3; c++) {
              const trim = CHORD_TRIM[c]!
              const hz = Math.min(
                BASE_HZ *
                  ratio(this.chord[c]!) *
                  clock *
                  rail.pitchFactorAt(trim),
                maxHz,
              )
              const inc = hz / this.sr
              this.chordPhase[c] = wrap1(this.chordPhase[c]! + inc)
              keys +=
                pulse(this.chordPhase[c]!, duty, inc) *
                this.chordEnv *
                rail.ampFactorAt(trim) *
                CHORD_GAIN *
                accomp
            }
          }
        }
        for (let k = 0; k < this.voices.length; k++) {
          const v = this.voices[k]!
          if (v.env <= ENV_FLOOR) continue
          const trim = trimAt(k, spread)
          const hz = Math.min(
            BASE_HZ * ratio(v.note) * clock * rail.pitchFactorAt(trim),
            maxHz,
          )
          const inc = hz / this.sr
          v.phase = wrap1(v.phase + inc)
          keys += pulse(v.phase, duty, inc) * v.env * rail.ampFactorAt(trim)
        }
        out = (out + mixVoices(keys, mixDrive)) * this.gateState
        if (spot === 3) out += pot * 0.4
      }

      out *= level * 0.4
      // A loop screaming in the top end draws on the same cells the toy runs
      // off, so a squeal that got away browns out the chip that started it.
      const extra =
        (micToRail ? Math.abs(ctx.mic[i]!) * 2 : 0) +
        (fbToRail ? Math.abs(ctx.fb[i]!) * 2 : 0) +
        couple * Math.max(ctx.bright[i]!, 0) * 0.5
      const starve = modStarve
        ? Math.min(Math.max(baseStarve + modStarve[i]!, 0), 1)
        : baseStarve
      rail.tick(Math.abs(out), starve, extra, clipHz, clipClock)
      ctx.railV[i] = rail.v
      ctx.step[i] = this.stepClock
      // The chip's gate, brought out to the bus whether anything is soldered to
      // it or not: a note struck is a note struck, whether the ROM struck it,
      // your hand struck it or a drum hit came back round and struck it.
      if (this.keyPending) {
        ctx.trig.keyStruck(i, this.keyNote, this.keyHeldPending)
        this.keyPending = false
      }
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.dataBus.reset()
    this.addrBus.reset()
    this.note = REST
    this.phase = 0
    this.env = 0
    this.bassEnv = 0
    this.chordEnv = 0
    for (const v of this.voices) {
      v.note = 0
      v.env = 0
      v.held = false
    }
    this.heldKeys.length = 0
    this.arpUp.length = 0
    this.arpStep = 0
    this.arpClock = 0
    this.rail.reset()
  }
}
