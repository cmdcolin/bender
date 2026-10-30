import { IDX } from '../../engine/params.ts'
import { snap } from '../../scale.ts'
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
} from '../../tune.ts'
import { Bus, FAULT_NAMES } from '../bus.ts'
import { MIC } from '../micJacks.ts'
import { DEST, hop, type ModBus } from '../modbus.ts'
import { SupplyTap, poweredUp, type Supplies } from '../supplies.ts'
import { voiceMask } from '../trigbus.ts'
import { GroundEdge } from '../util/bounce.ts'
import { Burst } from '../util/burst.ts'
import { clamp01 } from '../util/clamp.ts'
import { CrossingRate } from '../util/crossings.ts'
import { Drunk } from '../util/drift.ts'
import { coef, Follower } from '../util/follower.ts'
import { removeAt } from '../util/list.ts'
import { A3_HZ, octaves, tapDivisor, wrap1 } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'
import {
  decodeStep,
  encodeStep,
  ROM_ADDR_LINES,
  ROM_DATA_LINES,
  ROMS,
  YOURS,
  type Rom,
} from './roms.ts'
import {
  PICK_NEXT,
  PICK_RANDOM,
  sfxAt,
  sfxLength,
  SFX_NAMES,
  WIRE_REBOOT,
  WIRE_STUCK,
  WIRE_TOY,
  type SfxFrame,
} from './toySfx.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'
import type { Transport } from '../transport.ts'

// One index table per lane: the melody the oscillator plays, then the two
// stacked chips whose notes come out on the key line.
const LANE_IDX = TUNE_LANE_KEYS.map(keys => keys.map(k => IDX[k]))
const TUNE_IDX = LANE_IDX[0]!

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
const leak = (env: number, decay: number) =>
  env > LEAK_FLOOR ? LEAK_FLOOR + (env - LEAK_FLOOR) * decay : env

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
const kitBeatHz = (bpm: number) => Math.max(bpm, 0.6) / 60
const kitStepHz = (bpm: number, mode: number) =>
  kitBeatHz(bpm) * (SYNC_PER_BEAT[mode] ?? 4)

// The same wire onto the arpeggiator's count, with divisions past the tune's:
// an arpeggio lives in the triplets and thirty-seconds a melody never reaches.
export const ARP_SYNC_MODES = [
  'off',
  'quarters',
  'eighths',
  'eighth triplets',
  'sixteenths',
  'sixteenth triplets',
  'thirty-seconds',
  'thirty-second triplets',
  'sixty-fourths',
]
const ARP_SYNC_PER_BEAT = [0, 1, 2, 3, 4, 6, 8, 12, 16]

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
  // The divider word this voice loaded, and the note it loaded it for.
  ratio: number
  loaded: number
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
// than wherever the note numbers happen to start. Every key's are laid out up
// front, so changing song hands the chip a table rather than building one.
const TRIADS_IN_KEY = [MAJOR_TRIADS, MINOR_TRIADS].map(triads =>
  Array.from({ length: 12 }, (_, key) => triads.map(t => t.map(n => n + key))),
)
const triadsFor = (song: { key: number; minor?: boolean }) =>
  TRIADS_IN_KEY[song.minor ? 1 : 0]![pitchClass(song.key)]!

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
const dragDivisor = (depth: number) => Math.pow(2, depth) - 1

// One small output stage carries every voice, so a chord leans on its headroom
// rather than coming out four times louder.
const mixVoices = (sum: number, drive: number) => softclip(sum * drive) / drive

// One output pin and a scan counter handing it to each sounding voice in turn:
// the melody, the bass, the three chord notes, the four keys and the effect
// buttons. The counter runs off the chip's clock, so Scan sets how many clock
// ticks it waits per slot and a clock bend drags the scan with it.
const SLOTS = 10
const SFX_SLOT = 9
const SCAN_TOP_HZ = 6000
const SCAN_OCTAVES = 10
const scanRate = (scan: number) =>
  scan > 0 ? SCAN_TOP_HZ * octaves(-SCAN_OCTAVES * scan) : 0

// The output trace runs past the timing pin. Its coupling is a highpass through
// a few picofarads, and the RC on the pin smooths what gets through.
const CROSS_LP_HZ = 2500
const CROSS_HP_HZ = 30
const CROSS_OCTAVES = 4.5

// The FM chip's output wired onto the same timing pin through the same coupling,
// a block late, since the toy runs first. Its output sits lower than the toy's,
// so it goes in with more gain.
const FM_CLOCK_GAIN = 4
const FM_CLOCK_OCTAVES = 4
// The mic on the clock pin: a voice crossing zero 220 times a second runs the
// chip at stock speed. In silence the clock drops to 1/256 and the toy clicks.
const MIC_CLOCK_FLOOR = 1 / 256
const MIC_CLOCK_TOP = 16
// The mic on a bus: its loudness, as a binary word XORed onto the lines.
const MIC_BUS_GAIN = 4

// A latch between the voices and the output pin, strobed off the melody's pitch
// divider: from five octaves over the note at the bottom of the knob to three
// under it at the top.
const HOLD_TOP = 5
const HOLD_SPAN = 8

// A free-running oscillator whose wrap resets every voice's divider. The knob
// sweeps it from 30 Hz up four and a half octaves. A note over it is cut short
// each cycle; a note under it never finishes a cycle and falls silent.
const SYNC_LOW_HZ = 30
const SYNC_OCTAVES = 4.5

// The envelope counter's width. The top of the knob leaves one step, a gate;
// the bottom leaves 32.
const BITS_OCTAVES = 5

// The tone selector's narrowest tap, where a strike opens the pulse before the
// envelope lets it close back to the selected width.
const DUTY_STRIKE = 0.04

// The noise register under the effect buttons: fifteen bits, feedback off the
// bottom two.
const SFX_GAIN = 0.8
const LFSR_SEED = 1

export const LOOP_TARGETS = [
  ...Array.from({ length: ROM_ADDR_LINES }, (_, i) => `A${i}`),
  'reset',
]
const LOOP_RESET = ROM_ADDR_LINES

// The chip sets each voice's volume by pulse-width: a carrier off the clock
// divider, compared against the envelope. Stock it sits far above hearing; the
// knob taps it further down the divider chain.
const PWM_TOP_HZ = 20000
const PWM_OCTAVES = 10
const pwmRate = (pwm: number) =>
  pwm > 0 ? PWM_TOP_HZ * octaves(-PWM_OCTAVES * pwm) : 0

// The wires that pick which song the ROM serves: enough for every bank,
// including the memory you played in.
export const BANK_LINES = 5

// Each note loads a whole-number divider off a master clock, and the pitch is
// master / N. A3 loads 512, so the keyboard's span sits inside twelve bits.
export const DIV_LINES = 12
const DIV_A3 = 512
const DIV_MAX = (1 << DIV_LINES) - 1
// The effect voice loads whole words off this clock, so a fast sweep climbs in
// audible steps near the top.
const MASTER_HZ = A3_HZ * DIV_A3

// How many keys share a row of the key matrix. With the diodes lifted, holding
// two keys in different rows and columns also closes the other two corners.
export const GHOST_MODES = ['off', '4 wide', '6 wide', '8 wide']
const GHOST_COLS = [0, 4, 6, 8]
export const MATRIX_COLS = 8
const MATRIX_KEYS = 36

// The tune's counter clocked off a stage of the melody's own pitch divider
// rather than the tempo divider, so each note sets how long it lasts. The knob
// slides the wire from the ninth stage up to the first, where the tune steps at
// half the note's pitch.
const TAP_STAGES = 9
const GND_TRIP = 0.45

// The envelope cap with a trigger across it and a leak beside it: the leak
// drains the cap up to seven octaves faster, and when it reaches a quarter the
// trigger fires the hold switch and charges it full again. Every note keeps
// restriking itself, from a stutter up to a buzz around 200 Hz.
const RELAX_AT = 0.25
const RELAX_OCTAVES = 7

// The envelope's counter bridged onto the divider word, so a note's pitch
// falls as it fades, by up to this many octaves.
const ENV_DIV_OCTAVES = 3

// The PWM carrier taken off the melody's pitch divider in place of the master
// clock, so it sits a whole number of octaves under the note: one at the bottom
// of the knob, six at the top.
const PWM_TAP_LOW = 1
const PWM_TAP_SPAN = 5

export const ENV_CAPS = ['stock', 'reversed', 'leaky']
const ENV_REVERSED = 1
const ENV_LEAKY = 2
// Where a leaky cap settles instead of draining.
const LEAK_FLOOR = 0.3

// A counter can't strike a pulse narrower than one clock tick, so the narrow
// tones widen back toward a square as the note climbs past the divider's
// resolution — the same place a real chip runs out of counts. The output cap
// centres the result, so a narrow tap swings the same peak-to-peak as a square
// but comes out as a spike carrying less of the energy.
const ascending = (a: number, b: number) => a - b

/** e^-x. The clock moves every sample, so a cache never hits; at the rates an
    envelope runs x stays tiny and four Taylor terms hold to 3e-9. */
const expNeg = (x: number) =>
  x < 0.05 ? 1 - x * (1 - (x / 2) * (1 - (x / 3) * (1 - x / 4))) : Math.exp(-x)

const addOnce = (out: number[], g: number, skip: number[]) => {
  if (!skip.includes(g) && !out.includes(g)) out.push(g)
}

const width = (duty: number, amount: number, env: number) =>
  amount > 0 ? duty + (DUTY_STRIKE - duty) * amount * env : duty

const pulse = (phase: number, duty: number, inc: number) => {
  const d = Math.max(duty, inc)
  return phase < d ? 2 * (1 - d) : -2 * d
}

interface ChipLanes {
  modSync: Float32Array | null
  modXor: Float32Array | null
  modBits: Float32Array | null
  modDutyEnv: Float32Array | null
  modFmClock: Float32Array | null
  modHold: Float32Array | null
  modTap: Float32Array | null
  modRelax: Float32Array | null
  modEnvDiv: Float32Array | null
  modPwmTap: Float32Array | null
  modCross: Float32Array | null
  modScan: Float32Array | null
  modPwm: Float32Array | null
  modShort: Float32Array | null
  modClock: Float32Array | null
}

export class ToyChip implements Stage {
  label = 'toyChip'
  private readonly lanes: ChipLanes = {
    modSync: null,
    modXor: null,
    modBits: null,
    modDutyEnv: null,
    modFmClock: null,
    modHold: null,
    modTap: null,
    modRelax: null,
    modEnvDiv: null,
    modPwmTap: null,
    modCross: null,
    modScan: null,
    modPwm: null,
    modShort: null,
    modClock: null,
  }
  private phase = 0
  private pos = 0
  // What the melody oscillator is on, or REST for nothing. A sentinel rather
  // than a negative number, because the memory reaches two octaves under the
  // chip's bottom A and a note below zero is a note like any other.
  private note: number = REST
  private stepClock = 0
  private stepHzNow = 1
  // The steps being played this block and how many of them come round: the
  // ROM's own table, or the memory's. Filled in place from the params rather
  // than built, because an array built per block is garbage per block on the
  // one thread that cannot collect it.
  private mine = Array.from({ length: TUNE_STEPS }, () => REST)
  // The stacked chips' steps, in the same shape and read off the same address.
  private stacks = LANE_IDX.slice(1).map(() =>
    Array.from({ length: TUNE_STEPS }, () => REST),
  )
  private poly = false
  private yours = false
  private len = 1
  private mineLen = 1
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
    ratio: 1,
    loaded: NaN,
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
  // The last block's accompaniment level, kept for the note report: bass and
  // chord envelopes run whether or not anyone can hear them.
  private accompLevel = 0
  private rng: Rng
  // The two buses between the ROM and the rest of the chip, and where the fault
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
  // A wire from one pin of the note latch onto the address bus or the counter's
  // reset. `latch` is the word the latch last took, before the wire pulls on it.
  private loopFrom = -1
  private loopTo = 0
  private latch = 0
  private counterHigh = true
  private resetEdge = false
  private slotVal = new Float64Array(SLOTS)
  private slotLive = new Uint8Array(SLOTS)
  private slot = 0
  private scanClock = 0
  private lastOut = 0
  private crossLp = 0
  private crossHp = 0
  private fmLp = 0
  private fmHp = 0
  private holdPhase = 0
  private held = 0
  private syncPhase = 0
  private xorAmt = 0
  private envSteps = 0
  private crossLpA: number
  private crossHpA: number
  private pwmPhase = 0
  private envCap = 0
  private shortAmt = 0
  private romPick = 0
  private bankBus: Bus
  private bankLine = -1
  private bankFault = 0
  private divBus: Bus
  private divLine = -1
  private divFault = 0
  // Bumped when the fault on the divider moves, so every voice reloads.
  private divStamp = 0
  private melodyRatio = 1
  private melodyLoaded = NaN
  private bassRatio = 1
  private bassLoaded = NaN
  private chordRatio = [1, 1, 1]
  private chordLoaded: number[] | undefined
  private loadedStamp = 0
  private ghostCols = 0
  private ghosts: number[] = []
  private nextGhosts: number[] = []
  // What the melody's divider is running at, kept through a rest: the divider
  // goes on counting the last word it loaded.
  private melodyHz = A3_HZ
  // The output pin bridged onto an address or a data line, and which way it
  // last drove them.
  private outAddr = -1
  private outData = -1
  private outBit = 0
  private kitAddr = 0
  private outKeys = -1
  private pinKeys: number[] = []
  private pinHigh = false
  private scanPhase = 0
  private gndEdge = new GroundEdge(GND_TRIP)
  private kitCount = 0
  private micRate: CrossingRate
  private micEnv = new Follower()
  private readonly micAttack: number
  private readonly micRelease: number
  private micAddr = 0
  private micData = 0
  // The effect button sounding, or -1, and whether a finger is still on it: a
  // held button runs its program again each time it ends.
  private sfx = -1
  private sfxHeld = false
  private sfxT = 0
  private sfxPhase = 0
  private sfxWord = 0
  private sfxRatio = 1
  private sfxStamp = -1
  private noiseClock = 0
  private lfsr = LFSR_SEED
  private frame: SfxFrame = { oct: 0, tone: 0, noiseOct: 0, noise: 0 }
  // The wire onto the effect buttons, as of this block, and the last button the
  // next-along pick pressed.
  private sfxWire = 0
  private sfxPick = 0
  private sfxNext = -1

  private readonly sr: number
  private readonly supplies: Supplies
  private readonly power: SupplyTap
  private readonly transport: Transport

  constructor(
    sr: number,
    supplies: Supplies,
    transport: Transport,
    seed = 101,
  ) {
    this.sr = sr
    this.supplies = supplies
    this.power = new SupplyTap(supplies)
    this.transport = transport
    this.rng = mulberry32(seed)
    this.counterFault = new Burst(sr, 1.1)
    this.dataBus = new Bus(ROM_DATA_LINES, seed ^ 0xda7a)
    this.addrBus = new Bus(ROM_ADDR_LINES, seed ^ 0xadd4)
    this.crossLpA = Math.exp((-2 * Math.PI * CROSS_LP_HZ) / sr)
    this.crossHpA = Math.exp((-2 * Math.PI * CROSS_HP_HZ) / sr)
    this.micRate = new CrossingRate(sr)
    this.micAttack = coef(0.002, sr)
    this.micRelease = coef(0.08, sr)
    this.bankBus = new Bus(BANK_LINES, seed ^ 0xba4c)
    this.divBus = new Bus(DIV_LINES, seed ^ 0xd1f)
  }

  // The pitch ratio a note loads into its divider. With no fault on the
  // divider word it is the exact ratio, so the stock board's pitches stay put.
  private divRatio(note: number): number {
    if (this.divLine < 0) return ratio(note)
    const n = Math.min(Math.max(Math.round(DIV_A3 / ratio(note)), 1), DIV_MAX)
    const word = this.divBus.read(n, this.divLine, this.divFault, this.busCut)
    return DIV_A3 / Math.max(word, 1)
  }

  // Every pair of held keys in different rows and columns closes the other two
  // corners of their rectangle.
  private ghostKeys(out: number[]) {
    out.length = 0
    const cols = this.ghostCols
    if (!cols) return
    const keys = this.heldKeys
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i]!
        const b = keys[j]!
        const ra = Math.floor(a / cols)
        const rb = Math.floor(b / cols)
        const ca = a - ra * cols
        const cb = b - rb * cols
        if (ra === rb || ca === cb) continue
        addOnce(out, ra * cols + cb, keys)
        addOnce(out, rb * cols + ca, keys)
      }
    }
  }

  private sortHeld() {
    const up = this.arpUp
    up.length = 0
    for (const k of this.heldKeys) up.push(k)
    for (const g of this.ghosts) up.push(g)
    up.sort(ascending)
  }

  // Strikes the corners that just closed and lets go of the ones that opened.
  private regroundGhosts() {
    const was = this.ghosts
    const next = this.nextGhosts
    this.ghostKeys(next)
    for (const g of was)
      if (!next.includes(g) && !this.heldKeys.includes(g))
        for (const v of this.voices) if (v.note === g) v.held = false
    this.ghosts = next
    this.nextGhosts = was
    this.sortHeld()
    if (this.arping) return
    for (const g of next) if (!was.includes(g)) this.strike(g, 1).held = true
  }

  // The toy's own keys are switches: they pass no gain and strike at full. A
  // wire onto the gate can arrive at any level, which is what the trigger patch
  // has always done and what a controller's velocity is.
  noteOn(semitone: number, gain = 1) {
    if (!this.heldKeys.includes(semitone)) {
      this.heldKeys.push(semitone)
      this.sortHeld()
      // A chord going down on an idle arpeggiator strikes its first note there
      // and then, rather than a beat later: the count starts under your hand.
      if (this.heldKeys.length === 1) this.arpClock = 1
    }
    // The corners strike before the key itself, so the gate reports the key.
    if (this.ghostCols || this.ghosts.length) this.regroundGhosts()
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

  /** An effect button going down cuts whatever effect was sounding and starts
      its own program from the top. */
  sfxOn(sfx: number) {
    if (sfxLength(sfx) <= 0) return
    this.sfx = sfx
    this.sfxHeld = true
    this.sfxT = 0
  }

  // A press off the wire. A stuck button stays down, and on random or next it
  // picks again each time a pass ends.
  private wirePress() {
    const pick = this.sfxPick
    this.sfx =
      pick === PICK_RANDOM
        ? Math.floor(this.rng() * SFX_NAMES.length)
        : pick === PICK_NEXT
          ? (this.sfxNext = (this.sfxNext + 1) % SFX_NAMES.length)
          : pick
    this.sfxHeld = this.sfxWire === WIRE_STUCK
    this.sfxT = 0
  }

  /** Letting go lets the pass run to its end. */
  sfxOff(sfx: number) {
    if (sfx === this.sfx && this.sfxWire !== WIRE_STUCK) this.sfxHeld = false
  }

  noteOff(semitone: number) {
    const at = this.heldKeys.indexOf(semitone)
    if (at >= 0) {
      removeAt(this.heldKeys, at)
      this.sortHeld()
      // The last key up ends the figure rather than pausing it, so the next
      // chord starts on its own first note instead of halfway through the last.
      if (this.heldKeys.length === 0) this.arpStep = 0
    }
    for (const v of this.voices) if (v.note === semitone) v.held = false
    if (this.ghostCols || this.ghosts.length) this.regroundGhosts()
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
    const rail = this.power.rail
    if (rail.booting || rail.dead) return n
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

  /** How long a step of the tune lasts at the rate the chip is counting now. */
  get tuneStepMs() {
    return 1000 / this.stepHzNow
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

  // Also true when only another machine plays: this stage owns the key line
  // the FM chip is soldered onto, so the demo song has to keep clocking even
  // with the toy itself turned down.
  when(p: Float32Array) {
    return poweredUp(p)
  }

  // The only way anything here reads the ROM. The counter puts an address on
  // one bus and a note code comes back on the other, so a fault on either
  // reaches the melody, the chord the accompaniment harmonises to and whatever
  // a drum hit clocks out of the tune alike.
  // Where the counter actually lands. Split out because one counter addresses
  // all three chips: a step reads the melody and the two stacked lanes off the
  // same faulted address, rather than rolling the address fault once a lane and
  // playing a chord off three different steps.
  //
  // A wire from the note latch onto an address pin makes a bridged pair, and
  // the lower driver wins: the address bit survives only where the last note
  // had that bit set, and the note's bit survives only where the counter does.
  private romAddr(pos: number): number {
    let addr = pos
    if (this.loopFrom >= 0 && this.loopTo !== LOOP_RESET) {
      this.counterHigh = ((pos >> this.loopTo) & 1) === 1
      if (!((this.latch >> this.loopFrom) & 1)) addr &= ~(1 << this.loopTo)
    }
    if (this.outAddr >= 0)
      addr = (addr & ~(1 << this.outAddr)) | (this.outBit << this.outAddr)
    if (this.kitAddr > 0) addr &= ~((1 << this.kitAddr) - 1) | this.kitCount
    addr ^= this.micAddr
    return (
      this.addrBus.read(addr, this.addrLine, this.addrFault, this.busCut) %
      this.len
    )
  }

  // Where the counter goes after `pos`. The jumper reaches the reset pin through
  // a capacitor, so a note that raises the latched bit sends the counter back to
  // zero once, and a run of notes holding it high lets the count go on.
  private nextPos(pos: number): number {
    if (this.resetEdge) {
      this.resetEdge = false
      return 0
    }
    return (pos + 1) % this.len
  }

  private readRom(tune: number[], pos: number): number {
    return this.readAt(tune, this.romAddr(pos))
  }

  private readAt(tune: number[], addr: number): number {
    let yours = this.yours
    // A fault on the song wires sends this read to another bank, at the same
    // address folded into that song's length.
    if (this.bankLine >= 0) {
      const bank = this.bankBus.read(
        this.romPick,
        this.bankLine,
        this.bankFault,
        this.busCut,
      )
      yours = bank === YOURS
      if (yours) tune = this.mine
      else tune = ROMS[bank % ROMS.length]!.steps
      addr %= yours ? this.mineLen : tune.length
    }
    const step = tune[addr]!
    let word = this.dataBus.read(
      yours ? encodeTune(step) : encodeStep(step),
      this.dataLine,
      this.dataFault,
      this.busCut,
    )
    if (this.loopFrom >= 0) {
      const bit = 1 << this.loopFrom
      this.resetEdge =
        this.loopTo === LOOP_RESET && !(this.latch & bit) && !!(word & bit)
      this.latch = word
      if (this.loopTo !== LOOP_RESET && !this.counterHigh)
        word &= ~(1 << this.loopFrom)
    }
    if (this.outData >= 0)
      word = (word & ~(1 << this.outData)) | (this.outBit << this.outData)
    word ^= this.micData
    // Both banks come back in the memory's vocabulary, so nothing downstream
    // has to know which of the two it is reading. The ROM's own spelling — -1
    // for a rest, -2 for a hold — only works because its steps never go below
    // the chip's bottom A, and yours do.
    if (yours) return decodeTune(word)
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
        this.pos = this.nextPos(this.pos)
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

  // The bay's lanes and the wiring selectors, read once a block outside
  // process(): TurboFan inlines against one budget per function, and the
  // sample loop needs process()'s for the helpers it calls every sample.
  private readLanes(bay: ModBus) {
    const lanes = this.lanes
    lanes.modSync = bay.read(DEST.chipHardSync)
    lanes.modXor = bay.read(DEST.chipXor)
    lanes.modBits = bay.read(DEST.chipEnvBits)
    lanes.modDutyEnv = bay.read(DEST.chipDutyEnv)
    lanes.modFmClock = bay.read(DEST.chipFmClock)
    lanes.modHold = bay.read(DEST.chipHold)
    lanes.modTap = bay.read(DEST.chipStepTap)
    lanes.modRelax = bay.read(DEST.chipEnvRelax)
    lanes.modEnvDiv = bay.read(DEST.chipEnvDiv)
    lanes.modPwmTap = bay.read(DEST.chipPwmTap)
    lanes.modCross = bay.read(DEST.chipCrosstalk)
    lanes.modScan = bay.read(DEST.chipScan)
    lanes.modPwm = bay.read(DEST.chipPwm)
    lanes.modShort = bay.read(DEST.chipShort)
    lanes.modClock = bay.read(DEST.chipClock)
  }

  private readWiring(p: Float32Array, bay: ModBus) {
    this.dataLine =
      hop(
        p[IDX.chipDataLine]!,
        ROM_DATA_LINES + 1,
        bay.read(DEST.chipDataLine),
      ) - 1
    this.dataFault = hop(
      p[IDX.chipDataFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.chipDataFault),
    )
    this.addrLine =
      hop(
        p[IDX.chipAddrLine]!,
        ROM_ADDR_LINES + 1,
        bay.read(DEST.chipAddrLine),
      ) - 1
    this.addrFault = hop(
      p[IDX.chipAddrFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.chipAddrFault),
    )
    this.busCut = p[IDX.chipBusCut]!
    this.loopFrom =
      hop(
        p[IDX.chipLoopFrom]!,
        ROM_DATA_LINES + 1,
        bay.read(DEST.chipLoopFrom),
      ) - 1
    this.loopTo = hop(
      p[IDX.chipLoopTo]!,
      LOOP_TARGETS.length,
      bay.read(DEST.chipLoopTo),
    )
    this.outAddr =
      hop(p[IDX.chipOutAddr]!, ROM_ADDR_LINES + 1, bay.read(DEST.chipOutAddr)) -
      1
    this.outData =
      hop(p[IDX.chipOutData]!, ROM_DATA_LINES + 1, bay.read(DEST.chipOutData)) -
      1
    this.kitAddr = hop(
      p[IDX.chipKitAddr]!,
      ROM_ADDR_LINES + 1,
      bay.read(DEST.chipKitAddr),
    )
    this.envCap = hop(
      p[IDX.chipEnvCap]!,
      ENV_CAPS.length,
      bay.read(DEST.chipEnvCap),
    )
    this.bankLine =
      hop(p[IDX.chipBankLine]!, BANK_LINES + 1, bay.read(DEST.chipBankLine)) - 1
    this.bankFault = hop(
      p[IDX.chipBankFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.chipBankFault),
    )
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.chipLevel]!
    // The nineteenth tune is the one you played in. It is not in the bank —
    // the bank is what the chip shipped with — so it arrives as sixteen params
    // and is copied into an array this owns, and from there down nothing in the
    // stage knows which of the two it is playing.
    const pick = Math.round(p[IDX.chipTune]!)
    this.yours = pick === YOURS
    this.romPick = pick
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
    this.mineLen = asTuneLen(p[IDX.tuneLen]!)
    this.len = this.yours ? this.mineLen : rom.steps.length
    this.poly = this.yours && Math.round(p[IDX.tunePoly]!) === 1
    const clockX = p[IDX.chipClockX]!
    const spot = Math.round(p[IDX.chipBendSpot]!)
    const pot = p[IDX.chipBendPot]!
    // Choice 0 on either selector is a bus nobody has been at, so the lines
    // count from -1 and every read below is a straight one.
    const bay = ctx.mod
    this.readWiring(p, bay)
    const crossBase = p[IDX.chipCrosstalk]!
    const scanBase = p[IDX.chipScan]!
    const pwmBase = p[IDX.chipPwm]!
    const shortBase = p[IDX.chipShort]!
    const tapBase = p[IDX.chipStepTap]!
    const relaxBase = p[IDX.chipEnvRelax]!
    const envDivBase = p[IDX.chipEnvDiv]!
    const pwmTapBase = p[IDX.chipPwmTap]!
    const fmClockBase = p[IDX.chipFmClock]!
    const holdBase = p[IDX.chipHold]!
    const syncBase = p[IDX.chipHardSync]!
    const xorBase = p[IDX.chipXor]!
    const bitsBase = p[IDX.chipEnvBits]!
    const dutyEnvBase = p[IDX.chipDutyEnv]!
    this.readLanes(bay)
    const {
      modSync,
      modXor,
      modBits,
      modDutyEnv,
      modFmClock,
      modHold,
      modTap,
      modRelax,
      modEnvDiv,
      modPwmTap,
      modCross,
      modScan,
      modPwm,
      modShort,
      modClock,
    } = this.lanes
    const keyScan = p[IDX.chipKeyScan]!
    const outKeys =
      hop(p[IDX.chipOutKeys]!, MATRIX_COLS + 1, bay.read(DEST.chipOutKeys)) - 1
    if (outKeys !== this.outKeys) {
      this.outKeys = outKeys
      this.releasePin()
      this.pinHigh = false
    }
    // A ROM tune whose song wires have been got at can land on the memory, so
    // the memory is filled whenever a read might reach it.
    let stamp = this.mineLen
    if (this.yours || this.bankLine >= 0) {
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
    }
    const divLine =
      hop(p[IDX.chipDivLine]!, DIV_LINES + 1, bay.read(DEST.chipDivLine)) - 1
    const divFault = hop(
      p[IDX.chipDivFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.chipDivFault),
    )
    if (divLine !== this.divLine || divFault !== this.divFault) {
      this.divLine = divLine
      this.divFault = divFault
      this.divStamp++
    }
    const ghostCols =
      GHOST_COLS[
        hop(p[IDX.chipGhost]!, GHOST_COLS.length, bay.read(DEST.chipGhost))
      ] ?? 0
    if (ghostCols !== this.ghostCols) {
      this.ghostCols = ghostCols
      this.regroundGhosts()
    }
    const tone = TONE_DUTY[Math.round(p[IDX.chipTone]!)] ?? TONE_DUTY[0]!
    // bias bend drags the duty cycle up from whatever the tone selector taps
    const duty = spot === 3 ? Math.min(tone + pot * 0.45, 0.98) : tone
    const micJack = Math.round(p[IDX.micPatch]!)
    const micClock = micJack === MIC.toyClock
    if (micJack !== MIC.toyAddr) this.micAddr = 0
    if (micJack !== MIC.toyData) this.micData = 0
    const accomp = p[IDX.chipAccomp]!
    this.accompLevel = accomp
    // Whichever of the kit's voices is bridged onto the gate, and what it plays.
    const trigMask = voiceMask(Math.round(p[IDX.trigToKeys]!))
    const trigNote = Math.round(p[IDX.trigKeysNote]!)
    this.keyScale = Math.round(p[IDX.keyScale]!)
    this.keyRoot = Math.round(p[IDX.keyRoot]!)
    const drift = p[IDX.chipDrift]!
    const arpMode = Math.round(p[IDX.chipArp]!)
    const arpPerBeat = ARP_SYNC_PER_BEAT[Math.round(p[IDX.chipArpSync]!)] ?? 0
    const arpHz = arpPerBeat
      ? kitBeatHz(p[IDX.drumBpm]!) * arpPerBeat
      : p[IDX.chipArpHz]!
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
    const supplies = this.supplies
    const rail = this.power.pick(p[IDX.chipSupply]!)
    const maxHz = this.sr * 0.49
    // The clip on the timing pin is the shared cells' clip, so only a toy on
    // those cells feels it.
    const clipClock = rail === supplies.shared ? p[IDX.chipClipClock]! : 0
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

    const sfxWire = Math.round(p[IDX.sfxWire]!)
    const sfxPick = Math.round(p[IDX.sfxPick]!)
    if (sfxWire !== this.sfxWire || sfxPick !== this.sfxPick) {
      const wasStuck = this.sfxWire === WIRE_STUCK
      this.sfxWire = sfxWire
      this.sfxPick = sfxPick
      if (sfxWire === WIRE_STUCK) this.wirePress()
      else if (wasStuck) this.sfxHeld = false
    }
    const sfxMask = voiceMask(sfxWire < WIRE_TOY ? sfxWire : 0)

    if (this.power.rebooted()) {
      this.restart(tune, true)
      if (sfxWire === WIRE_REBOOT) this.wirePress()
    }
    if (this.transport.tune !== this.wasPlaying) {
      this.wasPlaying = this.transport.tune
      if (this.wasPlaying) this.restart(tune)
    }

    for (let i = 0; i < io.n; i++) {
      this.counterFault.step()
      const latched = rail.latched
      const cross =
        (modCross ? clamp01(crossBase + modCross[i]!) : crossBase) *
        CROSS_OCTAVES
      const scanHz = scanRate(
        modScan ? clamp01(scanBase + modScan[i]!) : scanBase,
      )
      const pwmHz = pwmRate(modPwm ? clamp01(pwmBase + modPwm[i]!) : pwmBase)
      const stepTap = modTap ? clamp01(tapBase + modTap[i]!) : tapBase
      const relax = modRelax ? clamp01(relaxBase + modRelax[i]!) : relaxBase
      const drain = relax > 0 ? octaves(RELAX_OCTAVES * relax) : 1
      const envDiv =
        (modEnvDiv ? clamp01(envDivBase + modEnvDiv[i]!) : envDivBase) *
        ENV_DIV_OCTAVES
      const pwmTap = modPwmTap
        ? clamp01(pwmTapBase + modPwmTap[i]!)
        : pwmTapBase
      this.shortAmt = modShort ? clamp01(shortBase + modShort[i]!) : shortBase
      this.xorAmt = modXor ? clamp01(xorBase + modXor[i]!) : xorBase
      const bits = modBits ? clamp01(bitsBase + modBits[i]!) : bitsBase
      this.envSteps =
        bits > 0
          ? Math.max(Math.round(octaves(BITS_OCTAVES * (1 - bits))), 1)
          : 0
      const dutyEnv = modDutyEnv
        ? clamp01(dutyEnvBase + modDutyEnv[i]!)
        : dutyEnvBase
      const hardSync = modSync ? clamp01(syncBase + modSync[i]!) : syncBase
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
      if (cross > 0) {
        this.crossLp = flushDenormal(
          this.lastOut + this.crossLpA * (this.crossLp - this.lastOut),
        )
        this.crossHp = flushDenormal(
          this.crossLp + this.crossHpA * (this.crossHp - this.crossLp),
        )
        clock *= octaves(cross * softclip(this.crossLp - this.crossHp))
      }
      const fmClock = modFmClock
        ? clamp01(fmClockBase + modFmClock[i]!)
        : fmClockBase
      if (fmClock > 0) {
        const x = ctx.fm[i]! * FM_CLOCK_GAIN
        this.fmLp = flushDenormal(x + this.crossLpA * (this.fmLp - x))
        this.fmHp = flushDenormal(
          this.fmLp + this.crossHpA * (this.fmHp - this.fmLp),
        )
        clock *= octaves(
          fmClock * FM_CLOCK_OCTAVES * softclip(this.fmLp - this.fmHp),
        )
      }
      if (micClock) {
        const hz = this.micRate.process(ctx.mic[i]!)
        clock *= Math.min(Math.max(hz / A3_HZ, MIC_CLOCK_FLOOR), MIC_CLOCK_TOP)
      }
      if (micJack === MIC.toyAddr || micJack === MIC.toyData)
        this.micOnBus(tune, ctx.mic[i]!, micJack)
      if (this.kitAddr > 0 && ctx.trig.drumStep[i]! > 0) {
        this.kitCount = ctx.trig.drumStep[i]! - 1
        if (this.transport.tune && !latched) this.kitStrike(tune)
      }
      // Flat cells slow the divider itself, so the song runs late as well as low.
      const timing = clock * rail.clockFactor
      this.stepHzNow =
        stepTap > 0
          ? this.melodyHz / tapDivisor(stepTap, TAP_STAGES)
          : stepHz * timing

      // sequencer — the run/stop line freezes it where it stands, and so does a
      // latched die: the counter stops clocking and the note it was on stays on
      if (this.transport.tune && !latched) {
        this.stepClock += this.stepHzNow / this.sr
        if (this.gndEdge.rise(ctx.gnd[i]!)) this.stepClock += 1
      }
      if (this.stepClock >= 1) {
        this.stepClock -= 1
        let next = this.nextPos(this.pos)
        // counter bend: program counter corruption
        if (
          spot === 2 &&
          this.counterFault.roll(pot * 0.7, cluster, this.rng)
        ) {
          next = this.rng() < 0.5 ? this.pos : Math.floor(this.rng() * this.len)
        }
        this.pos = next
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
      // number, so it has its own lock, which replaces the knob and leaves
      // every bend in `timing`.
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
      if (sfxMask && Math.round(ctx.trig.drumBits[i]!) & sfxMask)
        this.wirePress()

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
      // cheap chip ties decay to its tempo clock; a latch holds the envelope
      // where it stood along with everything else it froze.
      const envDecay = latched
        ? 1
        : expNeg((0.8 * stepHz * timing * drain) / this.sr)
      const cap = this.envCap
      const voices = this.voices
      if (cap === ENV_LEAKY) {
        this.env = leak(this.env, envDecay)
        this.bassEnv = leak(this.bassEnv, envDecay)
        this.chordEnv = leak(this.chordEnv, envDecay)
        for (let k = 0; k < voices.length; k++) {
          const v = voices[k]!
          if (!v.held) v.env = leak(v.env, envDecay)
        }
      } else {
        this.env = fade(this.env, envDecay)
        this.bassEnv = fade(this.bassEnv, envDecay)
        this.chordEnv = fade(this.chordEnv, envDecay)
        // A reversed cap drains a held key too, since the hold switch sits
        // across the same cap.
        for (let k = 0; k < voices.length; k++) {
          const v = voices[k]!
          if (!v.held || cap === ENV_REVERSED) v.env = fade(v.env, envDecay)
        }
      }
      if (relax > 0) {
        if (this.env < RELAX_AT) this.env = 1
        if (this.bassEnv < RELAX_AT) this.bassEnv = 1
        if (this.chordEnv < RELAX_AT) this.chordEnv = 1
        for (let k = 0; k < voices.length; k++) {
          const v = voices[k]!
          if (v.env > ENV_FLOOR && v.env < RELAX_AT) v.env = 1
        }
      }

      // A latched output stage is jammed on rather than fading with the supply,
      // so the note doesn't get quieter as the rail goes — it holds its level
      // and dives in pitch until there is no rail left to hold it.
      const amp = latched ? LATCH_AMP : rail.ampFactor

      const pwmOn = pwmHz > 0 || pwmTap > 0
      if (pwmTap > 0)
        this.pwmPhase = wrap1(
          this.pwmPhase +
            (this.melodyHz * octaves(-PWM_TAP_LOW - PWM_TAP_SPAN * pwmTap)) /
              this.sr,
        )
      else if (pwmHz > 0)
        this.pwmPhase = wrap1(this.pwmPhase + (pwmHz * timing) / this.sr)
      const shaped = cap === ENV_REVERSED || pwmOn || this.envSteps > 0
      const pinned = scanHz > 0 || this.shortAmt > 0 || this.xorAmt > 0
      if (hardSync > 0) {
        this.syncPhase +=
          (SYNC_LOW_HZ * octaves(SYNC_OCTAVES * hardSync) * timing) / this.sr
        if (this.syncPhase >= 1) {
          this.syncPhase -= Math.floor(this.syncPhase)
          this.phase = 0
          this.bassPhase = 0
          this.chordPhase.fill(0)
          this.sfxPhase = 0
          for (let k = 0; k < voices.length; k++) voices[k]!.phase = 0
        }
      }
      if (this.loadedStamp !== this.divStamp) {
        this.loadedStamp = this.divStamp
        this.melodyLoaded = NaN
        this.bassLoaded = NaN
        this.chordLoaded = undefined
        for (let k = 0; k < voices.length; k++) voices[k]!.loaded = NaN
      }

      let out = 0
      if (!rail.booting && !rail.dead) {
        const live = this.slotLive
        const val = this.slotVal
        if (pinned) live.fill(0)
        const note = this.transport.tune ? this.note : REST
        if (isNote(note) && this.env > ENV_FLOOR) {
          if (note !== this.melodyLoaded) {
            this.melodyLoaded = note
            this.melodyRatio = this.divRatio(note)
          }
          const hz = Math.min(
            A3_HZ *
              this.melodyRatio *
              clock *
              rail.pitchFactor *
              (envDiv > 0 ? octaves(-envDiv * (1 - this.env)) : 1),
            maxHz,
          )
          this.melodyHz = hz
          const inc = hz / this.sr
          this.phase = wrap1(this.phase + inc)
          const env = shaped ? this.level(this.env, pwmOn) : this.env
          const v =
            pulse(this.phase, width(duty, dutyEnv, this.env), inc) * env * amp
          if (pinned) {
            val[0] = v
            live[0] = 1
          } else out += v
        }
        let keys = 0
        if (accomp > 0) {
          if (this.bassEnv > ENV_FLOOR) {
            if (this.bassNote !== this.bassLoaded) {
              this.bassLoaded = this.bassNote
              this.bassRatio = this.divRatio(this.bassNote)
            }
            const hz = Math.min(
              A3_HZ *
                this.bassRatio *
                clock *
                rail.pitchFactorAt(BASS_TRIM) *
                (envDiv > 0 ? octaves(-envDiv * (1 - this.bassEnv)) : 1),
              maxHz,
            )
            const inc = hz / this.sr
            this.bassPhase = wrap1(this.bassPhase + inc)
            const env = shaped ? this.level(this.bassEnv, pwmOn) : this.bassEnv
            const v =
              pulse(this.bassPhase, width(duty, dutyEnv, this.bassEnv), inc) *
              env *
              rail.ampFactorAt(BASS_TRIM) *
              accomp
            if (pinned) {
              val[1] = v
              live[1] = 1
            } else keys += v
          }
          if (this.chordEnv > ENV_FLOOR) {
            if (this.chord !== this.chordLoaded) {
              this.chordLoaded = this.chord
              for (let c = 0; c < 3; c++)
                this.chordRatio[c] = this.divRatio(this.chord[c]!)
            }
            const env = shaped
              ? this.level(this.chordEnv, pwmOn)
              : this.chordEnv
            const fall = envDiv > 0 ? octaves(-envDiv * (1 - this.chordEnv)) : 1
            for (let c = 0; c < 3; c++) {
              const trim = CHORD_TRIM[c]!
              const hz = Math.min(
                A3_HZ *
                  this.chordRatio[c]! *
                  clock *
                  rail.pitchFactorAt(trim) *
                  fall,
                maxHz,
              )
              const inc = hz / this.sr
              this.chordPhase[c] = wrap1(this.chordPhase[c]! + inc)
              const v =
                pulse(
                  this.chordPhase[c]!,
                  width(duty, dutyEnv, this.chordEnv),
                  inc,
                ) *
                env *
                rail.ampFactorAt(trim) *
                CHORD_GAIN *
                accomp
              if (pinned) {
                val[2 + c] = v
                live[2 + c] = 1
              } else keys += v
            }
          }
        }
        for (let k = 0; k < this.voices.length; k++) {
          const v = this.voices[k]!
          if (v.env <= ENV_FLOOR) continue
          if (v.note !== v.loaded) {
            v.loaded = v.note
            v.ratio = this.divRatio(v.note)
          }
          const trim = trimAt(k, spread)
          const hz = Math.min(
            A3_HZ *
              v.ratio *
              clock *
              rail.pitchFactorAt(trim) *
              (envDiv > 0 ? octaves(-envDiv * (1 - v.env)) : 1),
            maxHz,
          )
          const inc = hz / this.sr
          v.phase = wrap1(v.phase + inc)
          const env = shaped ? this.level(v.env, pwmOn) : v.env
          const x =
            pulse(v.phase, width(duty, dutyEnv, v.env), inc) *
            env *
            rail.ampFactorAt(trim)
          if (pinned) {
            val[5 + k] = x
            live[5 + k] = 1
          } else keys += x
        }
        if (this.sfx >= 0) {
          const x = this.sfxSample(
            latched ? 0 : timing,
            clock * rail.pitchFactor,
            maxHz,
            duty,
            dutyEnv,
            shaped,
            pwmOn,
          )
          if (pinned) {
            val[SFX_SLOT] = x * amp
            live[SFX_SLOT] = 1
          } else keys += x * amp
        }
        if (scanHz > 0) out = this.scan((scanHz * timing) / this.sr)
        else if (pinned) out = this.ring(this.short(mixDrive))
        out = (out + mixVoices(keys, mixDrive)) * this.gateState
        if (spot === 3) out += pot * 0.4
      }

      const hold = modHold ? clamp01(holdBase + modHold[i]!) : holdBase
      if (hold > 0) {
        this.holdPhase += Math.min(
          (this.melodyHz * octaves(HOLD_TOP - HOLD_SPAN * hold)) / this.sr,
          1,
        )
        if (this.holdPhase >= 1) {
          this.holdPhase -= Math.floor(this.holdPhase)
          this.held = out
        }
        out = this.held
      }
      this.lastOut = out
      if (this.outAddr >= 0 || this.outData >= 0)
        this.driveBus(tune, out > 0 ? 1 : 0)
      if (this.outKeys >= 0) {
        this.scanPhase += (keyScan * timing) / this.sr
        if (this.scanPhase >= 1) {
          this.scanPhase -= Math.floor(this.scanPhase)
          if (out > 0 !== this.pinHigh) {
            this.pinHigh = out > 0
            if (this.pinHigh) this.pressPin()
            else this.releasePin()
          }
        }
      }
      out *= level * 0.4
      supplies.tick(rail, i, Math.abs(out))
      ctx.step[i] = this.stepClock
      ctx.trig.melodyHz[i] = rail.booting || rail.dead ? 0 : this.melodyHz
      // The chip's gate, brought out to the bus whether anything is soldered to
      // it or not: a note struck is a note struck, whether the ROM struck it,
      // your hand struck it or a drum hit came back round and struck it.
      if (this.keyPending) {
        ctx.trig.keyStruck(i, this.keyNote, this.keyHeldPending)
        this.keyPending = false
        if (sfxWire === WIRE_TOY) this.wirePress()
      }
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  // One sample of the effect button, at `timing` seconds of program per real
  // second. Past the end of a pass, a held button starts again and a released
  // one falls silent.
  private sfxSample(
    timing: number,
    pitch: number,
    maxHz: number,
    duty: number,
    dutyEnv: number,
    shaped: boolean,
    pwmOn: boolean,
  ): number {
    this.sfxT += timing / this.sr
    const len = sfxLength(this.sfx)
    if (this.sfxT >= len) {
      if (!this.sfxHeld) {
        this.sfx = -1
        return 0
      }
      this.sfxT -= len * Math.floor(this.sfxT / len)
      if (this.sfxWire === WIRE_STUCK && this.sfxPick >= PICK_RANDOM) {
        this.wirePress()
        return 0
      }
    }
    const f = this.frame
    sfxAt(this.sfx, this.sfxT, f)
    let x = 0
    if (f.tone > 0) {
      const word = Math.min(
        Math.max(Math.round(DIV_A3 / octaves(f.oct)), 1),
        DIV_MAX,
      )
      if (word !== this.sfxWord || this.sfxStamp !== this.divStamp) {
        this.sfxWord = word
        this.sfxStamp = this.divStamp
        const read =
          this.divLine < 0
            ? word
            : this.divBus.read(word, this.divLine, this.divFault, this.busCut)
        this.sfxRatio = 1 / Math.max(read, 1)
      }
      const hz = Math.min(MASTER_HZ * this.sfxRatio * pitch, maxHz)
      const inc = hz / this.sr
      this.sfxPhase = wrap1(this.sfxPhase + inc)
      const env = shaped ? this.level(f.tone, pwmOn) : f.tone
      x += pulse(this.sfxPhase, width(duty, dutyEnv, f.tone), inc) * env
    }
    if (f.noise > 0) {
      this.noiseClock += (A3_HZ * octaves(f.noiseOct) * pitch) / this.sr
      while (this.noiseClock >= 1) {
        this.noiseClock -= 1
        const bit = (this.lfsr ^ (this.lfsr >> 1)) & 1
        this.lfsr = (this.lfsr >> 1) | (bit << 14)
      }
      x += (this.lfsr & 1 ? 1 : -1) * f.noise
    }
    return x * SFX_GAIN
  }

  // The output pin bridged onto an address or a data line. Each time the pin
  // swings the other way the ROM serves the neighbouring step, or the note code
  // comes back with one bit moved, and the melody's divider loads that note
  // without restriking it. A note flips between two at a rate its own pitch
  // sets.
  private driveBus(tune: number[], bit: number) {
    if (bit === this.outBit) return
    this.outBit = bit
    this.reread(tune)
  }

  private pressPin() {
    const cols = this.ghostCols || MATRIX_COLS
    for (let k = this.outKeys % cols; k < MATRIX_KEYS; k += cols) {
      if (this.heldKeys.includes(k) || this.pinKeys.includes(k)) continue
      this.pinKeys.push(k)
      this.strike(k, 1).held = true
    }
  }

  private releasePin() {
    for (const k of this.pinKeys) {
      if (this.heldKeys.includes(k)) continue
      for (const v of this.voices) if (v.note === k) v.held = false
    }
    this.pinKeys.length = 0
  }

  private kitStrike(tune: number[]) {
    const addr = this.romAddr(this.pos)
    const step = this.readAt(tune, addr)
    if (step === REST) this.note = REST
    if (!isNote(step) || step === this.note) return
    this.note = step
    this.env = 1
    this.keyNote = step
    this.keyPending = true
    this.harmonize(step)
    this.strikeStacks(addr)
  }

  private micOnBus(tune: number[], x: number, jack: number) {
    const lines = jack === MIC.toyAddr ? ROM_ADDR_LINES : ROM_DATA_LINES
    const env = this.micEnv.process(x, this.micAttack, this.micRelease)
    const top = (1 << lines) - 1
    const word = Math.min(Math.floor(env * MIC_BUS_GAIN * top), top)
    const was = jack === MIC.toyAddr ? this.micAddr : this.micData
    if (word === was) return
    if (jack === MIC.toyAddr) this.micAddr = word
    else this.micData = word
    this.reread(tune)
  }

  // A line on either bus changed under a step already playing, so the step is
  // read again and the note jumps to whatever comes back.
  private reread(tune: number[]) {
    const step = this.readRom(tune, this.pos)
    if (isNote(step)) this.note = step
    else if (step === REST) this.note = REST
  }

  // The pin belongs to one slot at a time. The counter skips slots with nothing
  // sounding, so a lone note holds the pin and a chord takes turns on it.
  private scan(inc: number): number {
    const live = this.slotLive
    this.scanClock += inc
    let move = this.scanClock >= 1 || !live[this.slot]
    if (this.scanClock >= 1) this.scanClock -= Math.floor(this.scanClock)
    for (let tries = 0; move && tries < SLOTS; tries++) {
      this.slot = (this.slot + 1) % SLOTS
      move = !live[this.slot]
    }
    return live[this.slot] ? this.slotVal[this.slot]! : 0
  }

  // The volume the output stage sees: the envelope, upside down on a reversed
  // cap, and compared against the PWM carrier when that is in earshot.
  private level(env: number, pwm: boolean): number {
    let x = this.envCap === ENV_REVERSED ? 1 - env : env
    if (this.envSteps > 0) x = Math.round(x * this.envSteps) / this.envSteps
    return pwm ? (this.pwmPhase < x ? 1 : 0) : x
  }

  // Every voice output shorted onto one node, where the lowest driver wins.
  // Shorted harder, more of the node is the lowest voice and less the mix.
  private short(drive: number): number {
    const live = this.slotLive
    const val = this.slotVal
    let keys = 0
    let lo = Infinity
    for (let k = 1; k < SLOTS; k++) {
      if (!live[k]) continue
      keys += val[k]!
      lo = Math.min(lo, val[k]!)
    }
    if (live[0]) lo = Math.min(lo, val[0]!)
    if (lo === Infinity) return 0
    const mix = (live[0] ? val[0]! : 0) + mixVoices(keys, drive)
    return mix + (lo - mix) * this.shortAmt
  }

  // The mix multiplied by the sign of every sounding voice but the first, so
  // each extra voice flips it whenever that voice is low. A lone voice passes
  // unchanged; a chord turns into sum and difference tones.
  private ring(mix: number): number {
    if (this.xorAmt <= 0) return mix
    const live = this.slotLive
    const val = this.slotVal
    let flip = 1
    let seen = false
    for (let k = 0; k < SLOTS; k++) {
      if (!live[k]) continue
      if (seen && val[k]! < 0) flip = -flip
      seen = true
    }
    return mix * (1 + (flip - 1) * this.xorAmt)
  }

  panic() {
    this.micRate.reset()
    this.micEnv.reset()
    this.micAddr = 0
    this.micData = 0
    this.kitCount = 0
    this.pinKeys.length = 0
    this.pinHigh = false
    this.scanPhase = 0
    this.gndEdge.reset()
    this.dataBus.reset()
    this.addrBus.reset()
    this.bankBus.reset()
    this.divBus.reset()
    this.ghosts.length = 0
    this.note = REST
    this.phase = 0
    this.env = 0
    this.bassEnv = 0
    this.chordEnv = 0
    this.crossLp = 0
    this.crossHp = 0
    this.fmLp = 0
    this.fmHp = 0
    this.held = 0
    this.syncPhase = 0
    this.lastOut = 0
    this.sfx = -1
    this.sfxHeld = false
    this.sfxWire = 0
    this.sfxPhase = 0
    this.noiseClock = 0
    this.lfsr = LFSR_SEED
    for (const v of this.voices) {
      v.note = 0
      v.phase = 0
      v.env = 0
      v.held = false
    }
    this.bassPhase = 0
    this.chordPhase.fill(0)
    this.holdPhase = 0
    this.pwmPhase = 0
    this.drift.reset()
    this.slotVal.fill(0)
    this.heldKeys.length = 0
    this.arpUp.length = 0
    this.arpStep = 0
    this.arpClock = 0
  }
}
