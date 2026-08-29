import {
  ACCENT_GAIN,
  ADDR_LINES,
  asLen,
  DRUM_VOICES,
  GRID_ROWS,
  STEPS,
} from '../../drums'
import { IDX } from '../../engine/params'
import { Bus } from '../bus'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { N_DRUM_VOICES, STEP_CHOICE, voiceMask } from '../trigbus'
import { BridgedT } from '../util/bridged'
import { coef, Transient } from '../util/follower'
import { Highpass, Lowpass, lpCoef, OnePoleLP } from '../util/onepole'
import { MetalBank } from '../util/metal'
import { octaves } from '../util/pitch'
import { mulberry32, type Rng } from '../util/rng'

const TAU = 2 * Math.PI

// The envelope level a voice stops carrying anything at. It is where the output
// stops asking the oscillators for samples, and it is the far end of the trigger
// floor: a voice that has drained this far has stopped sounding.
const AUDIBLE = 0.002

// The widest word the converter has resistors for, and how far out the reel
// they came off was sold as. The grade is a knob and this is where it rests: it
// scales as a ratio against this number, so a kit nobody has re-graded renders
// the samples it always did.
//
// A ladder DAC halves the weight at every rung down the word, and it does that
// with resistors somebody bought by the reel. Each one is out by its tolerance,
// so the steps are uneven — and unevenly, because the error scales with the rung
// it sits on: the top resistor is worth half of full scale and half of its
// tolerance is an enormous number of counts. Which is why the sound of a cheap
// converter is not hiss. It is one lurch, at the code where every bit changes at
// once, and for a signal that code is the zero crossing.
const LADDER_BITS = 16
const LADDER_TOL = 0.15

// How close to nominal the best rung on the board can be.
//
// A part is not a coin toss around its marked value. Anything that came out of
// the press inside a tighter band was measured, sorted and sold as a tighter
// grade, so what is left in the cheap bin is the parts that missed — reliably
// out, by somewhere between most of the tolerance and all of it. Drawing flat
// through zero instead gave the board a rung or two that happened to be nearly
// right, and the stock word length landed on one of them: the knob did least at
// the setting the kit ships at.
const LADDER_FLOOR = 0.4

// Voice order is the bit order of a step, and the order of the rows in the
// panel's grid — both come off the one table in drums.ts. The pattern lives in
// one sixteen-bit mask per voice, step 1 in the high bit.
const KICK = 0
const SNARE = 1
const HAT = 2
const CLAP = 3
const TOM = 4
const BELL = 5
const OHAT = 6
const CYM = 7
const N_VOICES = N_DRUM_VOICES

const VOICE_PARAM = DRUM_VOICES.map(v => IDX[v.key])
const MAYBE_PARAM = DRUM_VOICES.map(v => IDX[v.maybe])
const LEN_PARAM = GRID_ROWS.map(r => IDX[r.len])
const ACCENT_ROW = GRID_ROWS.length - 1

// Every pattern length divides this, so the counter can wrap without a row
// jumping mid-bar: it is the least common multiple of 1 through 16. At the
// fastest tempo the panel offers, one lap of it is over an hour.
export const CYCLE = 720720

// Which envelope each amplifier leans across to, per drumCross choice. A voice
// wired to itself is a voice nobody bridged.
const CROSS_WIRING: readonly number[][] = [
  [KICK, SNARE, HAT, CLAP, TOM, BELL, OHAT, CYM],
  [SNARE, KICK, HAT, CLAP, TOM, BELL, OHAT, CYM],
  [KICK, HAT, SNARE, CLAP, TOM, BELL, OHAT, CYM],
  [HAT, SNARE, KICK, CLAP, TOM, BELL, OHAT, CYM],
  [SNARE, HAT, KICK, CLAP, TOM, BELL, OHAT, CYM],
  [SNARE, HAT, CLAP, TOM, BELL, OHAT, CYM, KICK],
]

// The bridged-T networks, and which trigger line shocks each one. Three voices
// have them: the kick and the tom are one tank apiece, and the snare is the two
// the 808 puts under its noise — 185 and 330 Hz, close enough to beat.
//
// `count` is the ring time in the units the rest of the kit counts envelopes
// in, so a tank runs down alongside the noise voices rather than to a clock of
// its own; `sweep` is how far a full swing carries the tuning; `gain` is what
// the voice is worth in the sum.
const TANKS = [
  { voice: KICK, hz: 48, sweep: 0.9, count: 9, gain: 1.54 },
  { voice: TOM, hz: 105, sweep: 0.7, count: 11, gain: 1.86 },
  { voice: SNARE, hz: 185, sweep: 0.25, count: 22, gain: 1.53 },
  { voice: SNARE, hz: 330, sweep: 0.25, count: 22, gain: 0.98 },
] as const
const N_TANKS = TANKS.length

// Which tank carries a voice's envelope, where the voice has one at all. The
// kick and the tom have no amplifier of their own — the tank is the sound and
// its swing is the whole of what the panel, the trigger floor and the
// cross-patch can read off them. The snare keeps its amplifier for the noise.
const VOICE_TANK = [0, -1, -1, -1, 1, -1, -1, -1]

// How much of the trigger pulse gets past the coupling cap and out, per voice.
// It is what survives of a kick on a small speaker, and it is only there while
// the pulse is narrow enough to be a spike: the charge is fixed, so a wide one
// arrives as a shove too low and too slow for the cap to pass.
const CLICK = [0.9, 0.45, 0, 0, 0.7, 0, 0, 0]

// And what the path does to it on the way, which is the whole of why it is a
// click and not a thud. The cap it comes through blocks the low end, so what
// reaches the mix is the pulse's edges rather than its body; the one small
// stage it lands in cannot swing arbitrarily fast, so those edges arrive with a
// shape. Left as the raw pulse it was neither — a lump with a needle on it,
// mostly energy under a hundred hertz, and a kick that came out of the kit's
// seven-bit converter carrying more hash at 6 kHz than the hat did.
const CLICK_HI = 1200
const CLICK_LO = 4200

// How much of a one-shot's width its own edge takes. A one-shot is a cap
// charging through a resistor, so it has a rise as well as a fall, and the rise
// is the fast part rather than no part: nothing on a board goes anywhere in
// nought seconds. Modelled without one, a hit arrived as a step two samples
// wide, and the kit's seven-bit converter turned that edge into broadband hash
// — a kick that measured brighter at 6 kHz than the hat sitting on top of it.
const PULSE_EDGE = 2.5

// Where the ring knob crosses over. Below it the transistor hands back less
// than it took and the drum is a drum; at it the network never runs down; past
// it the loop makes up the difference and the tank grows into its own clipping.
// The crossing sits inside the travel rather than at the end of it, because a
// far side you cannot get to is not a far side.
const RING_LATCH = 0.9

// How long the accent cap takes to come back after a step has drawn on it,
// counted off the kit's own oscillator like everything else here.
const ACCENT_RECHARGE = 0.25

// What one voice takes off the accent cap with the sag knob all the way up, as
// a fraction of the charge on it. Six voices on one step empty it — the board
// carries more than six, and a step that strikes every one of them is a step
// the accent has nothing left to give, which is what a shared cap does. A
// number rather than a count of the voices: what a voice draws is what a voice
// draws, and soldering another one on does not make the rest thirstier.
const ACCENT_DRAW = 1 / 6

// Where the hats' filter sits, and how much of it there is. What the bank hands
// over is six fundamentals under a kilohertz with a thin dust of harmonics
// above them, and a hat is only the dust — so the corner has to sit well above
// the top of the bank and the slope has to be steep enough to bury what is
// under it by forty decibels. One pole at this corner hands back a cowbell.
const HAT_HP = 5000
const HAT_POLES = 3

// The cymbal's two bands, and the pot between them. Cymbal tone is not a corner
// being swept: it is a wiper between two taps on the same filter chain, which
// is the only way a tone control on a board like this was ever built and the
// reason it is a tone control rather than a second volume. The crash tap keeps
// the body a hat throws away; the splash tap is most of the way to being a hat.
//
// Neither goes lower than this. Down where the fundamentals are, six
// oscillators stop being a clatter and go back to being six notes.
const CYM_CRASH = 2200
const CYM_SPLASH = 7000
const CYM_POLES = 3

// And the lid on both of them. A cymbal rolls off at the top; what is up there
// on this board is the bank's harmonics folding back off the sample rate, which
// is hash rather than air.
const CYM_LP = 9000
const CYM_LP_POLES = 2

// What each metal voice is worth in the sum, measured against the voices they
// stand beside rather than chosen: the hat matches the noise transistor it used
// to be, so the pot between them crossfades instead of stepping.
// What each metal voice is worth in the sum. The hat's two are measured against
// each other rather than chosen, so the pot between the transistor and the bank
// crossfades instead of stepping. The open hat has no numbers of its own: it is
// the same filter and the same amplifier, and the only thing that separates it
// from the closed hat is which resistor the cap drains through.
const BELL_GAIN = 0.3
const HAT_NOISE = 0.35
const HAT_METAL = 4.3
const CYM_CRASH_GAIN = 0.636
const CYM_SPLASH_GAIN = 5.52

export class ToyDrum implements Stage {
  label = 'toyDrum'
  /**
   * Steps clocked since the machine started, not the column it is on: with a
   * length per row there is no one column. Each row's playhead is this counter
   * modulo its own length, which is how the panel draws them and how the
   * sequencer reads them.
   */
  tick = 0
  private stepClock = 0
  /** Each row's length this block, clamped to something a modulo can use. */
  private lens = new Uint8Array(GRID_ROWS.length).fill(STEPS)
  private retrigPhase = 0
  private env = new Float32Array(N_VOICES)
  private amp = new Float32Array(N_VOICES)
  // How hard the last trigger hit each voice, and what its amplifier is
  // hearing once the cross-patch has leaned it across. A voice that has never
  // fired still has an amplifier at unity, so a borrowed envelope drives it.
  private gain = new Float32Array(N_VOICES).fill(1)
  private weight = new Float32Array(N_VOICES).fill(1)
  private falls = new Float32Array(N_VOICES)
  // The trigger pulse on each voice's line, and what is left of it this sample.
  // Every voice has one — the noise voices use theirs to open a gate and the
  // tanked ones to charge a network — so a bridged pair swaps what shocks the
  // network as well as what opens the amplifier.
  private pulse = new Float32Array(N_VOICES)
  private pulseOut = new Float32Array(N_VOICES)
  private pulseX = new Float32Array(N_VOICES)
  private pulseFall = 0
  private pulseRise = 0
  private tanks = Array.from({ length: N_TANKS }, () => new BridgedT())
  private tankF = new Float32Array(N_TANKS)
  private tankRate = new Float32Array(N_TANKS)
  private tankGain = new Float32Array(N_TANKS)
  // The accent cap, as the fraction of its rested charge still on it. One cap
  // feeds every voice on the board, so what a step takes off it is what the
  // next step does not get.
  private accentV = 1
  private accentAmt = ACCENT_GAIN
  private accentSag = 0
  private accentPull = 0
  private bellLp = 0
  private noiseLp = 0
  // The metal section: one bank of six oscillators, and the filters that make
  // the four voices hung off it different from each other.
  private metal: MetalBank
  private hatHp = new Highpass(HAT_POLES)
  private cymCrash = new Highpass(CYM_POLES)
  private cymSplash = new Highpass(CYM_POLES)
  private cymLp = new Lowpass(CYM_LP_POLES)
  // Whether the open hat is running down through the closed hat's resistor.
  // The two share one cap — that is what a hi-hat pedal is — so a closed step
  // does not silence an open one, it drains what is left of it in a hurry.
  private ohatChoked = false
  private clickHi = new OnePoleLP()
  private clickLo = new OnePoleLP()
  private clapFast = 0
  private clapSlow = 0
  private clapsLeft = 0
  private clapTimer = 0
  private lastReboot = 0
  private rng: Rng
  private micTrig: Transient
  // The wires between the step counter and the pattern memory, and what a knife
  // has done to one of them. Read once a block: which trace you cut is not a
  // thing that moves inside one.
  private addrBus: Bus
  private dataBus: Bus
  private addrLine = -1
  private addrFault = 0
  private dataLine = -1
  private dataFault = 0
  private busCut = 1
  // How often a maybe step closes, and which of them closed on the step the
  // counter is standing on. The roll happens once, when the counter arrives:
  // the retrigger bend hammers the same step thousands of times a second and
  // the mic and the keyboard reach across to whatever step is standing, and a
  // contact that answered differently every time something touched it would be
  // a rattle rather than a step that sometimes plays.
  private chance = 0.5
  private open = 0
  private rolledAt = -1
  // How far a voice has to have drained before its one-shot will answer again.
  // At 1 nothing is ever locked out, because an envelope leaves at 1 and only
  // falls: the board that touches this knob is the only one that divides.
  private trigFloor = 1
  // What this board's resistors came out at, in counts of the rung they sit on.
  // Drawn once: the knob says how bad the ladder is, not which parts are wrong.
  private trim = new Float32Array(LADDER_BITS)
  // A hit from outside the box — a pad on a controller, struck by hand rather
  // than by the sequencer. It waits here for the top of the next block: the
  // trigger line is a wire the DSP reads, and nothing on the main thread can
  // reach into the middle of one.
  private struckBits = 0
  private struckGain = 0
  // Voices that have fired since the panel last looked. Every hit stamps it —
  // the sequencer's, the retrigger bend's, the mic's, a bridged trigger line's,
  // a pad's — because the grid lights for whatever strikes the kit, and all but
  // the first of those land on steps nobody can see coming.
  private firedSince = 0

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
    seed = 202,
  ) {
    this.rng = mulberry32(seed)
    this.metal = new MetalBank(sr)
    this.micTrig = new Transient(sr)
    this.addrBus = new Bus(ADDR_LINES, seed ^ 0xadd4)
    this.dataBus = new Bus(N_VOICES, seed ^ 0xda7a)
    // Off its own stream: the resistors were soldered on before the kit made a
    // sound, and drawing them out of the noise source would move every hit.
    const parts = mulberry32(seed ^ 0x1adde4)
    // At the stock grade. Re-grading scales these rather than redrawing them, so
    // which rungs are long and which are short stays soldered in and only how
    // far out they are moves.
    for (let k = 0; k < LADDER_BITS; k++) {
      const off =
        (LADDER_FLOOR + (1 - LADDER_FLOOR) * parts()) * LADDER_TOL * (1 << k)
      this.trim[k] = parts() < 0.5 ? -off : off
    }
  }

  // What the converter puts out instead of the code it was handed, in counts.
  // Bit depth is where the word is tapped off the ladder, so shortening it hands
  // the top of the scale to a different resistor and the error changes character
  // as well as size.
  private ladderErr(
    code: number,
    bits: number,
    amt: number,
    tol: number,
  ): number {
    const word = code + (1 << (bits - 1))
    let err = 0
    for (let k = 0; k < bits; k++) if ((word >> k) & 1) err += this.trim[k]!
    return err * amt * (tol / LADDER_TOL)
  }

  when(p: Float32Array) {
    const on = p[IDX.drumLevel]! > 0
    if (!on) this.rail.reported = 0
    return on
  }

  /** Strike voices by hand. `bits` is the bit order of a step, so one message
      can land a whole kit's worth; two hits inside one block fold together and
      the harder one sets the weight. */
  strike(bits: number, gain: number) {
    this.struckBits |= bits
    this.struckGain = Math.max(this.struckGain, gain)
  }

  // Which cell of the pattern memory answers for a row this tick. The counter
  // is one thing and the wires out of it are another: a fault here leaves the
  // counting alone — the grid's playhead goes on chasing the step it always did
  // — and a different cell comes back. A row's length lives in the counter, so
  // an address that has been leaned on reaches cells a five-step row would
  // never have played, and the memory has sixteen of them whatever the row says.
  private stepAt(tick: number, row: number): number {
    const step = tick % this.lens[row]!
    return (
      this.addrBus.read(step, this.addrLine, this.addrFault, this.busCut) %
      STEPS
    )
  }

  // Which voices this tick names. Each row reads its own column, so a row five
  // steps long is round again while the kick is still in the first bar — the
  // pattern drifts against itself for as long as the two lengths take to line
  // back up, which on a five against sixteen is eighty steps.
  //
  // The word that comes back is one bit a voice, and it is the trigger line
  // rather than an amplifier: a data line held high strikes the voice for real,
  // stamping the bus and lighting the row, where the cross-patch only lends an
  // envelope. The accent rides a line of its own and is not in this word.
  private bitsAt(p: Float32Array, tick: number): number {
    // Once a tick, and only for the voices that have a maybe step under the
    // counter — a kit nobody has wired through the dice draws nothing from the
    // noise source, so it renders the samples it always did.
    const roll = tick !== this.rolledAt
    if (roll) {
      this.rolledAt = tick
      this.open = 0
    }
    let bits = 0
    for (let v = 0; v < N_VOICES; v++) {
      const step = this.stepAt(tick, v)
      const at = STEPS - 1 - step
      const bit = 1 << v
      if ((Math.round(p[MAYBE_PARAM[v]!]!) >> at) & 1) {
        if (roll && this.rng() < this.chance) this.open |= bit
        if (this.open & bit) bits |= bit
      } else if ((Math.round(p[VOICE_PARAM[v]!]!) >> at) & 1) bits |= bit
    }
    return this.dataBus.read(bits, this.dataLine, this.dataFault, this.busCut)
  }

  private accentAt(p: Float32Array, tick: number): boolean {
    const step = this.stepAt(tick, ACCENT_ROW)
    return ((Math.round(p[IDX.drumAccent]!) >> (STEPS - 1 - step)) & 1) === 1
  }

  // The trigger line: every voice the step names fires at once, at the step's
  // own weight. The clap is the odd one out — it doesn't strike, it claps.
  //
  // What strikes is not always what was named. Each voice sits behind a one-shot
  // that will not answer again until its envelope has drained past the floor, so
  // a line hammered faster than a voice can empty comes out divided — and only
  // what actually struck is stamped, because the grid lights for hits rather
  // than for pulses.
  //
  // Every hit is stamped on the bus as it goes, whether the sequencer struck it,
  // the retrigger bend hammered it, a shout came in the mic or the keyboard's
  // gate reached across. The line is one node; what is soldered to it decides.
  private hit(bits: number, gain: number, ctx: Ctx, i: number): number {
    if (!bits) return 0
    let struck = 0
    for (let v = 0; v < N_VOICES; v++) {
      if (!(bits & (1 << v))) continue
      if (v === CLAP) {
        if (this.clapsLeft > 0 || this.env[CLAP]! > this.trigFloor) continue
        this.gain[v] = gain
        this.clapsLeft = 3
        this.clapTimer = 0
      } else {
        if (this.env[v]! > this.trigFloor) continue
        this.gain[v] = gain
        this.env[v] = 1
      }
      // Which resistor the hats' shared cap drains through. A closed step
      // clamps whatever the open one had left; an open step lets it run.
      if (v === HAT) this.ohatChoked = true
      else if (v === OHAT) this.ohatChoked = false
      // Same charge whatever the one-shot's width: the pulse is where it goes,
      // not how much of it there is.
      this.pulse[v] = gain * (1 - this.pulseFall)
      struck |= 1 << v
    }
    if (!struck) return 0
    this.firedSince |= struck
    ctx.trig.drumFired(i, struck, gain)
    return struck
  }

  // The accent row says how hard whatever plays on this step lands, and a maybe
  // step that came up plays at the weight it asked for. Nothing rolls for the
  // weight — an accent nobody can predict on a hit nobody can predict is two
  // dice on one step, and what comes back off that is a kit playing at random
  // rather than a pattern with a loose contact in it.
  //
  // What the row names is not a flag, though. It is a voltage on a bus every
  // voice hangs off — one cap, charged between steps and drawn on by whatever
  // the step strikes — so an accent stacking four voices is a weaker accent
  // than one striking a single drum, and a second accent arriving before the
  // cap has caught up lands softer than the first. Left stiff, none of that
  // happens and the accent is the flag it always was.
  private fire(p: Float32Array, ctx: Ctx, i: number, fallback = false) {
    const named = this.bitsAt(p, this.tick)
    const bits = fallback ? named || 1 : named
    const accent = this.accentAt(p, this.tick)
    const gain = accent ? 1 + (this.accentAmt - 1) * this.accentV : 1
    const struck = this.hit(bits, gain, ctx, i)
    if (!accent || !struck || this.accentSag <= 0) return
    let load = 0
    for (let v = 0; v < N_VOICES; v++) if (struck & (1 << v)) load++
    this.accentV = Math.max(
      0,
      this.accentV - this.accentSag * load * ACCENT_DRAW,
    )
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.drumLevel]!
    const rail = this.rail
    // Same divider, same cells as the keyboard: flat batteries drag the tempo,
    // and everything else this chip counts — see perSample below.
    const clock = rail.clockFactor
    const stepHz = (p[IDX.drumBpm]! / 60) * 4 * clock
    const swing = Math.min(Math.max(p[IDX.drumSwing]!, 0), 0.9)
    const baseTune = p[IDX.drumTune]!
    const modTune = ctx.mod.read(DEST.drumTune)
    const decay = Math.max(p[IDX.drumDecay]!, 0.05)
    const ring = p[IDX.drumRing]!
    // The two halves of the snare are a transistor's hiss and a pair of tuned
    // networks, and nothing in one is in the other. So the pot between them has
    // to fade on power rather than on amplitude, or the middle of its travel —
    // which is where a snare wants to sit — comes out three decibels down on
    // both ends of it.
    const snappy = Math.min(Math.max(p[IDX.drumSnappy]!, 0), 1)
    const hiss = Math.sqrt(snappy)
    const tone = Math.sqrt(1 - snappy)
    // The same pot on the hats' amplifier, between the same transistor and the
    // metal bank, and equal-power for the same reason: the two sources have
    // nothing in common, so an amplitude fade would dip in the middle.
    const metal = Math.min(Math.max(p[IDX.drumMetal]!, 0), 1)
    const bank = Math.sqrt(metal)
    const trans = Math.sqrt(1 - metal)
    this.metal.tune(Math.min(Math.max(p[IDX.drumSpread]!, 0), 1))
    const cymTone = Math.min(Math.max(p[IDX.drumCymTone]!, 0), 1)
    const baseRetrig = p[IDX.drumRetrigHz]!
    const mod = ctx.mod.read(DEST.retrig)
    const micTrig = Math.round(p[IDX.micPatch]!) === 5
    const keyTrig = Math.round(p[IDX.trigToDrum]!)
    const cross = Math.round(p[IDX.drumCross]!)
    const baseBleed = cross === 0 ? 0 : p[IDX.drumCrossAmt]!
    const modCross = cross === 0 ? null : ctx.mod.read(DEST.drumCross)
    // The kit shares one cheap DAC; the panel's Bit depth is its word length.
    const bits = Math.max(Math.round(p[IDX.drumBits]!), 1)
    const q = Math.pow(2, bits - 1)
    const ladder = p[IDX.drumLadder]!
    const ladderTol = p[IDX.drumLadderTol]!
    this.addrLine = Math.round(p[IDX.drumAddrLine]!) - 1
    this.addrFault = Math.round(p[IDX.drumAddrFault]!)
    this.dataLine = Math.round(p[IDX.drumDataLine]!) - 1
    this.dataFault = Math.round(p[IDX.drumDataFault]!)
    this.busCut = p[IDX.drumBusCut]!
    this.chance = Math.min(Math.max(p[IDX.drumChance]!, 0), 1)
    // All the way up is a voice that will not answer again until it has stopped
    // sounding; at nothing the floor sits above where an envelope starts, so
    // nothing is ever locked out.
    this.trigFloor = 1 - (1 - AUDIBLE) * p[IDX.drumTrigFloor]!
    const wrap = Math.round(p[IDX.drumOverflow]!) === 1
    this.accentAmt = p[IDX.drumAccentAmt]!
    this.accentSag = p[IDX.drumAccentSag]!
    this.accentPull = coef(ACCENT_RECHARGE / clock, this.sr)

    // Every row's length, read once a block: a length that moved mid-block would
    // move a playhead the panel has already drawn.
    for (let r = 0; r < this.lens.length; r++) {
      this.lens[r] = asLen(p[LEN_PARAM[r]!]!)
    }

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.tick = 0
      this.stepClock = 0
      this.rolledAt = -1
    }

    // There is one oscillator in the chip and the envelopes are counted off it,
    // the same as the tempo and the pitch. So a rail that drags the pattern slow
    // drags every tail out with it, and a kit going down with the batteries goes
    // low, late and long rather than only low and late. Decay is a divisor on
    // that count, not a time: the knob keeps saying what it always said.
    const perSample = -clock / (this.sr * decay)
    const clapBurstFall = Math.exp(70 * perSample)
    // The clap's nine milliseconds are counted off the same oscillator, so on a
    // sagging rail the three bursts spread into a flam.
    const clapGap = 0.009 / clock
    const falls = this.falls
    falls[KICK] = Math.exp(9 * perSample)
    falls[SNARE] = Math.exp(22 * perSample)
    falls[HAT] = Math.exp(60 * perSample)
    falls[CLAP] = Math.exp(13 * perSample)
    falls[TOM] = Math.exp(11 * perSample)
    falls[BELL] = Math.exp(16 * perSample)
    falls[OHAT] = Math.exp(8 * perSample)
    falls[CYM] = Math.exp(4 * perSample)

    const clickHiCoef = lpCoef(CLICK_HI, this.sr)
    const clickLoCoef = lpCoef(CLICK_LO, this.sr)
    const hatHpCoef = lpCoef(HAT_HP, this.sr)
    const cymCrashCoef = lpCoef(CYM_CRASH, this.sr)
    const cymSplashCoef = lpCoef(CYM_SPLASH, this.sr)
    const cymLpCoef = lpCoef(CYM_LP, this.sr)
    // Equal power across the wiper, for the same reason the other two pots on
    // this board are: the two taps share the bank and not much else.
    const crashMix = Math.sqrt(1 - cymTone) * CYM_CRASH_GAIN
    const splashMix = Math.sqrt(cymTone) * CYM_SPLASH_GAIN
    // The one-shot on the trigger line is a resistor and a cap, and like the
    // clap's nine milliseconds it is counted off the chip's own oscillator: a
    // sagging rail widens the pulse along with everything else.
    const pulseS = (Math.max(p[IDX.drumPulse]!, 0.01) / 1000) * clock
    this.pulseFall = Math.exp(-1 / (pulseS * this.sr))
    this.pulseRise = lpCoef(PULSE_EDGE / (TAU * pulseS), this.sr)

    // What each tank loses per sample, off the same count and the same divisor
    // the noise voices' envelopes come off — so a network runs down alongside
    // them rather than to a clock of its own. Ring is what the feedback knob
    // leaves of that: past the crossing the loss goes negative and the tank
    // stops being something that runs down at all.
    const ringScale = 1 - ring / RING_LATCH
    for (let t = 0; t < N_TANKS; t++) {
      const spec = TANKS[t]!
      this.tankF[t] = (TAU * spec.hz) / this.sr
      this.tankRate[t] = (ringScale * spec.count * clock) / (this.sr * decay)
      this.tankGain[t] = spec.voice === SNARE ? spec.gain * tone : spec.gain
    }

    let loadSum = 0
    for (let i = 0; i < io.n; i++) {
      // Hands first, and whether or not the pattern is running: a pad is a
      // finger on the trigger line, and the kit answers a finger with the
      // machine stopped the way it answers the mic.
      this.accentV += this.accentPull * (1 - this.accentV)
      if (i === 0 && this.struckBits !== 0) {
        this.hit(this.struckBits, this.struckGain, ctx, i)
        this.struckBits = 0
        this.struckGain = 0
      }
      if (this.transport.drums) {
        // Swing holds the offbeat back and takes it off the step after, so a
        // pair still spans two steps and the tempo is what the knob says.
        const span = this.tick % 2 === 0 ? 1 + swing * 0.5 : 1 - swing * 0.5
        this.stepClock += stepHz / this.sr
        if (this.stepClock >= span) {
          this.stepClock -= span
          this.tick = (this.tick + 1) % CYCLE
          this.fire(p, ctx, i)
        }
      }
      // the bend: hammer the current step's trigger line at audio rate
      const retrigHz = mod
        ? Math.min(baseRetrig * octaves(mod[i]! * 4), 8000)
        : baseRetrig
      if (this.transport.drums && retrigHz > 0.5) {
        this.retrigPhase += retrigHz / this.sr
        if (this.retrigPhase >= 1) {
          this.retrigPhase -= 1
          this.fire(p, ctx, i, true)
        }
      }
      // mic soldered onto the trigger line: clap at it and the kit fires
      if (micTrig && this.micTrig.process(ctx.mic[i]!, 0.05)) {
        this.fire(p, ctx, i, true)
      }
      // The keyboard's gate, reaching across: every note the chip strikes hits
      // the kit, whether the pattern is running or not. 'the step' hands the
      // grid to your hands — a key plays whatever column the sequencer is on.
      if (keyTrig > 0 && ctx.trig.key[i]! > 0) {
        if (keyTrig === STEP_CHOICE) this.fire(p, ctx, i, true)
        else this.hit(voiceMask(keyTrig), 1, ctx, i)
      }

      // Bridged envelope pins: each amplifier leans across to a neighbour's
      // envelope instead of its own. All the way over is a full swap, so the
      // kick fires on snare steps and the noise swells on kicks.
      //
      // With nothing bridged an amplifier hears its own envelope, so it reads
      // that array rather than a copy of it: the leaned-across pair only exists
      // while something is leaning, and copying twelve floats a sample to say
      // nothing was bridged is the kit's whole idle cost.
      const env = this.env
      const bleed = modCross
        ? Math.min(Math.max(baseBleed + modCross[i]!, 0), 1)
        : baseBleed
      let amp = env
      let weight = this.gain
      let shock = this.pulseOut
      if (bleed > 0) {
        amp = this.amp
        weight = this.weight
        shock = this.pulseX
        const wiring = CROSS_WIRING[cross] ?? CROSS_WIRING[0]!
        for (let v = 0; v < N_VOICES; v++) {
          const from = wiring[v]!
          amp[v] = env[v]! + bleed * (env[from]! - env[v]!)
          weight[v] = this.gain[v]! + bleed * (this.gain[from]! - this.gain[v]!)
          shock[v] =
            this.pulseOut[v]! +
            bleed * (this.pulseOut[from]! - this.pulseOut[v]!)
        }
      }

      let out = 0
      if (!rail.booting) {
        // One trimmer for the whole kit, so a wire on it moves every struck
        // voice together — two octaves either way at full depth.
        const tune = modTune ? baseTune * octaves(2 * modTune[i]!) : baseTune
        const pf = rail.pitchFactor * tune
        // The metal bank turns whether or not the pattern is asking it for
        // anything, because nothing on the board stops it: it is six RC
        // oscillators across the supply, and the only thing that ever silenced
        // one was the supply going away. Which is why it is here, under the
        // boot check, and why two hats in a row are two different hats.
        this.metal.step(pf)
        // The bridged-T voices. Nothing here has an amplifier: the trigger
        // pulse charges the network, the network rings, and how loud the drum
        // is and how long it lasts are the same fact about the same part. What
        // the panel calls Ring is how much of that the transistor hands back,
        // so past the crossing these three stop running down and the pattern
        // starts retuning a note instead of restriking a drum.
        for (let t = 0; t < N_TANKS; t++) {
          const v = TANKS[t]!.voice
          const drive = shock[v]!
          const tank = this.tanks[t]!
          if (drive === 0 && tank.level <= AUDIBLE) continue
          out +=
            tank.process(
              drive,
              this.tankF[t]! * pf,
              this.tankRate[t]!,
              TANKS[t]!.sweep,
            ) * this.tankGain[t]!
        }
        // What gets past the coupling cap on the way to the output rather than
        // into a network: the click at the front of a kick, and the only part
        // of it that survives a small speaker.
        let click = 0
        for (let v = 0; v < N_VOICES; v++) {
          if (CLICK[v]! > 0) click += shock[v]! * CLICK[v]!
        }
        out +=
          this.clickLo.process(click, clickLoCoef) -
          this.clickHi.process(click, clickHiCoef)
        // The clap is three bursts nine milliseconds apart and then the room:
        // one noise source, retriggered, with the last hit left to ring on.
        if (this.clapsLeft > 0) {
          this.clapTimer -= 1 / this.sr
          if (this.clapTimer <= 0) {
            this.clapTimer = clapGap
            this.clapsLeft--
            env[CLAP] = 1
            amp[CLAP] = 1
          }
        }
        // There is one noise transistor on the board, and the snare, the hat and
        // the clap are all hung off it. Two of them on the same step hear the
        // same hiss, so they sum coherently into one crack instead of standing
        // beside each other as two — and the hat is a high-pass rather than a
        // second noise minus a first one, because what it subtracts is the
        // filtered version of the sample it is holding.
        //
        // The filter is a cap on the board and it keeps its charge between hits,
        // so it runs when anything is drawing on the transistor and stops when
        // nothing is: the kit's idle cost is one branch, not one draw.
        if (
          amp[SNARE]! > AUDIBLE ||
          amp[HAT]! > AUDIBLE ||
          amp[OHAT]! > AUDIBLE ||
          amp[CLAP]! > AUDIBLE
        ) {
          const noise = this.rng() * 2 - 1
          this.noiseLp += 0.25 * (noise - this.noiseLp)
          if (amp[SNARE]! > AUDIBLE)
            out +=
              (noise - this.noiseLp * 0.5) *
              amp[SNARE]! *
              weight[SNARE]! *
              0.8 *
              hiss
          if (amp[HAT]! > AUDIBLE)
            out +=
              (noise - this.noiseLp) *
              amp[HAT]! *
              weight[HAT]! *
              HAT_NOISE *
              trans
          if (amp[OHAT]! > AUDIBLE)
            out +=
              (noise - this.noiseLp) *
              amp[OHAT]! *
              weight[OHAT]! *
              HAT_NOISE *
              trans
          if (amp[CLAP]! > AUDIBLE) {
            this.clapFast += 0.45 * (noise - this.clapFast)
            this.clapSlow += 0.05 * (noise - this.clapSlow)
            out +=
              (this.clapFast - this.clapSlow) * amp[CLAP]! * weight[CLAP]! * 1.6
          }
        }
        // Four voices off the one bank, and what separates them is the filter
        // each is soldered behind. The cowbell takes the top pair through a
        // notch, which is what leaves a pitch in it; the hats take all six
        // through a corner high enough that only the edges survive; the cymbal
        // takes all six through a shallower band that keeps the body.
        if (amp[BELL]! > AUDIBLE) {
          const sq = this.metal.bell
          this.bellLp += 0.4 * (sq - this.bellLp)
          out += (sq - this.bellLp) * amp[BELL]! * weight[BELL]! * BELL_GAIN
        }
        if (amp[HAT]! > AUDIBLE || amp[OHAT]! > AUDIBLE) {
          const hp = this.hatHp.process(this.metal.clash, hatHpCoef)
          if (amp[HAT]! > AUDIBLE)
            out += hp * amp[HAT]! * weight[HAT]! * HAT_METAL * bank
          if (amp[OHAT]! > AUDIBLE)
            out += hp * amp[OHAT]! * weight[OHAT]! * HAT_METAL * bank
        }
        if (amp[CYM]! > AUDIBLE) {
          const sq = this.metal.clash
          const band = this.cymLp.process(
            this.cymCrash.process(sq, cymCrashCoef) * crashMix +
              this.cymSplash.process(sq, cymSplashCoef) * splashMix,
            cymLpCoef,
          )
          out += band * amp[CYM]! * weight[CYM]!
        }
        // Every voice's envelope falls on its own, whatever its amplifier is
        // hearing. Decaying the envelope inside the output test instead left a
        // bridged voice stuck at full: a kick leaning all the way over to a
        // snare that never fires has nothing to open its own amplifier with, so
        // nothing was left to run its envelope down, and unpatching the bridge
        // dropped a hit that had been waiting there for minutes.
        for (let v = 0; v < N_VOICES; v++) {
          env[v]! *=
            v === CLAP && this.clapsLeft > 0
              ? clapBurstFall
              : v === OHAT && this.ohatChoked
                ? falls[HAT]!
                : falls[v]!
          // A voice built on a network has no envelope to run down, so what the
          // panel lights, what the trigger floor measures and what a bridged
          // amplifier leans on is the swing of the network itself. Which is why
          // a latched tank cannot be restruck: nothing about it ever drains.
          const t = VOICE_TANK[v]!
          if (t >= 0) env[v] = Math.max(env[v]!, this.tanks[t]!.level)
          // The one-shot runs down, and what the networks and the output see
          // is that shape with its own edge on it rather than the step the
          // counter made.
          this.pulse[v] =
            this.pulse[v]! > 1e-7 ? this.pulse[v]! * this.pulseFall : 0
          const lp =
            this.pulseOut[v]! +
            this.pulseRise * (this.pulse[v]! - this.pulseOut[v]!)
          this.pulseOut[v] = lp > 1e-7 ? lp : 0
        }
        // The accumulator behind the ladder is as wide as the word and no
        // wider. A cheap one rolls over rather than stopping at the top, so a
        // step stacking four voices under an accent comes out inside-out while
        // the quiet steps either side of it are untouched — the fold is the
        // pattern's own dynamics rather than a setting. Left alone, the sum
        // leaves the kit past full scale and the limiter at the end of the
        // chain is what deals with it.
        let code = Math.round(out * q)
        if (wrap) code = ((((code + q) % (2 * q)) + 2 * q) % (2 * q)) - q
        out = (code + this.ladderErr(code, bits, ladder, ladderTol)) / q
        out *= rail.ampFactor
      }

      out *= level * 0.6
      loadSum += Math.abs(out)
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.reported = loadSum / io.n
  }

  /** Voices that have fired since the last read, as the bit order of a step.
      Reading takes them: the panel is drawing one report per frame and a hit it
      has already lit is a hit that has been seen. */
  takeFired(): number {
    const bits = this.firedSince
    this.firedSince = 0
    return bits
  }

  panic() {
    this.struckBits = 0
    this.struckGain = 0
    this.firedSince = 0
    this.open = 0
    this.rolledAt = -1
    this.env.fill(0)
    this.amp.fill(0)
    this.gain.fill(1)
    this.weight.fill(1)
    this.pulse.fill(0)
    this.pulseOut.fill(0)
    this.pulseX.fill(0)
    for (const tank of this.tanks) tank.reset()
    this.accentV = 1
    this.bellLp = 0
    this.noiseLp = 0
    this.metal.reset()
    this.hatHp.reset()
    this.cymCrash.reset()
    this.cymSplash.reset()
    this.cymLp.reset()
    this.ohatChoked = false
    this.clickHi.reset()
    this.clickLo.reset()
    this.clapFast = 0
    this.clapSlow = 0
    this.clapsLeft = 0
    this.micTrig.reset()
    this.addrBus.reset()
    this.dataBus.reset()
  }
}
