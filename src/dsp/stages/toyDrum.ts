import { DEFAULT_CONTROLS } from '../../controls.ts'
import {
  ACCENT_GAIN,
  ADDR_LINES,
  asLen,
  DATA_LINES,
  DRUM_VOICES,
  GRID_ROWS,
  STEPS,
  VOICE_LABELS,
} from '../../drums.ts'
import { IDX, packParams } from '../../engine/params.ts'
import { Bus, FAULT_NAMES } from '../bus.ts'
import { DEST, hop, ModBus } from '../modbus.ts'
import { BLOCK } from '../stage.ts'
import { ToyRail } from '../toyRail.ts'
import { Transport } from '../transport.ts'
import {
  N_DRUM_VOICES,
  STEP_CHOICE,
  TriggerBus,
  voiceMask,
} from '../trigbus.ts'
import { BridgedT } from '../util/bridged.ts'
import { coef, Transient } from '../util/follower.ts'
import { MetalBank } from '../util/metal.ts'
import { Highpass, Lowpass, lpCoef, OnePoleLP } from '../util/onepole.ts'
import { octaves } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

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

/** What the converter's reference pin is wired to. Fixed is the kit as it
    shipped; anything else multiplies every code by that signal. */
export const DAC_REF_NAMES = [
  'fixed',
  'the toy chip',
  'the kit itself',
  'the mic',
  'the bus',
]
export const DAC_REF_TOY = 1
const DAC_REF_SELF = 2
const DAC_REF_MIC = 3
const DAC_REF_BUS = 4

// The op-amp in front of the reference pin: its gain, and the rails it clips
// at.
const DAC_REF_GAIN = 4
const DAC_REF_RAIL = 1.5

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

// The word the pattern memory hands back, as bits. The voices are the low end
// of it in the order of the rows, and the accent is the wire above them: one
// more line for the knife, and the only one that says how hard rather than
// whether.
const ACCENT_BIT = 1 << N_VOICES
const VOICE_BITS = ACCENT_BIT - 1

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

// There is one choke resistor on the board and it is across the hats' shared
// cap, which is what a hi-hat pedal is: a closed step does not silence a
// ringing open hat, it drains what is left of it through that resistor. Solder
// the wire somewhere else and any voice can do it to any other.
//
// One entry a voice: whose trigger line drains it, or nothing. The hats are
// wired that way in the metal rather than on the panel, so they are in every
// row of this table — a pedal is not a patch.
const chokeWiring = (...pairs: readonly (readonly [number, number])[]) => {
  const from = new Int8Array(N_VOICES).fill(-1)
  for (const [cut, by] of pairs) from[cut] = by
  // Last, so no row of the table can solder over the pedal.
  from[OHAT] = HAT
  return from
}

/** What the panel calls each place the choke wire can go. The order is the
    order of the table below it. */
export const CHOKE_NAMES = [
  'off',
  'hat cuts cymbal',
  'kick cuts tom',
  'snare cuts clap',
  'each cuts the next',
  'kick cuts the kit',
]

const CHOKE_WIRING: readonly Int8Array[] = [
  chokeWiring(),
  chokeWiring([CYM, HAT]),
  chokeWiring([TOM, KICK]),
  chokeWiring([CLAP, SNARE]),
  // Each voice across the next one's cap, all the way round.
  chokeWiring(
    ...Array.from(
      { length: N_VOICES },
      (_, v) => [v, (v + 1) % N_VOICES] as const,
    ),
  ),
  // Everything across the kick's trigger, which is a gate on the whole kit.
  chokeWiring(
    ...Array.from({ length: N_VOICES }, (_, v) => [v, KICK] as const).filter(
      ([v]) => v !== KICK,
    ),
  ),
]

// The step counter's clear pin, and the trigger line soldered to it. The clear
// is synchronous: a strike arms it, and the next clock edge loads step one. So
// the bar ends on whatever step the voice strikes, a maybe on that voice rolls
// the bar's length, and a reset voice on step one holds the machine there.
export const RESET_NAMES = ['off', ...VOICE_LABELS.map(l => `on the ${l}`)]

// A comparator on one tank's ring, soldered onto other voices' trigger lines.
// It strikes once a cycle while the ring is louder than its threshold, so what
// it strikes rattles at the tank's pitch and follows the tank's swoop down.
export const RING_TRIG_NAMES = [
  'off',
  'kick fires hat',
  'kick fires snare',
  'kick fires itself',
  'tom fires bell',
  'snare fires open hat',
  'kick fires the kit',
]

// Each entry is the voice the comparator listens to and the trigger lines it
// strikes.
const RING_TRIG_WIRING: readonly (readonly [number, number])[] = [
  [-1, 0],
  [KICK, 1 << HAT],
  [KICK, 1 << SNARE],
  [KICK, 1 << KICK],
  [TOM, 1 << BELL],
  [SNARE, 1 << OHAT],
  [KICK, VOICE_BITS & ~(1 << KICK)],
]

// The comparator's two trip points, in the units a voice adds to the kit's sum.
// The gap between them is the hysteresis that keeps one zero crossing from
// striking twice.
const RING_TRIG_HIGH = 0.05
const RING_TRIG_LOW = -0.05

// How far the metal bank's clash can push the tanks' tuning either way, in
// multiples of it, with Bank FM all the way up. Past one the tuning goes
// through zero and the network runs backwards for half of each swing.
const BANK_FM = 12

// How much of the kick tank's swing reaches the tom tank's drive per sample,
// with the coupling all the way up. Enough that a kick at rest pumps the tom
// into its rail.
const TANK_COUPLE = 0.05

/** What the kit's dice is a comparator on. Free, it rolls on every arrival;
    on the junction, it rolls only while the noise transistor conducts and
    holds its last answer while the junction is off. */
export const DICE_NAMES = ['free', 'on the junction']

/** Where a knife sits in the loop that circulates the bar. Off, the cells are
    the panel's grid; anything else plays a shadow of it that rewrites itself
    every lap, and turning it off loads the grid back. */
export const LOOP_NAMES = [
  'off',
  'return inverted',
  'return a step late',
  'each row into the next',
  'return through an XOR',
]
const LOOP_INVERT = 1
const LOOP_LATE = 2
const LOOP_NEXT = 3
const LOOP_XOR = 4

/** Which tank's rising zero crossings reset the metal bank's phases. */
export const BANK_SYNC_NAMES = ['off', 'to the kick', 'to the tom']
const BANK_SYNC_TANK = [-1, 0, 1]

// How far a resistor into the metal bank's supply drags its six oscillators,
// in octaves, with the starve trim all the way up. The tanks are not across
// that supply, so the kick and the tom stay where they are.
const BANK_STARVE_OCT = 3

/** Which voice's trigger line holds up the metal bank's supply. Off, the bank
    free-runs; wired, the six stand still whenever that voice is silent. */
export const BANK_GATE_NAMES = ['off', ...VOICE_LABELS.map(l => `on the ${l}`)]

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
//
// The cap has to be a cap, though, and for a long time this was two low-passes
// subtracted instead. That is a band rather than a cap: it peaks at four tenths
// somewhere between the two corners and falls away either side of it, and a
// one-shot's edge is nowhere near there — so what came through measured 60 dB
// under the kick's body, and zeroing the whole table changed the take by five
// thousandths of a decibel. A pulse whose height is the same whatever its width
// is what the tanks want, so the click takes its own read of the line at the
// height the one-shot actually reaches.
const CLICK_HI = 1200
const CLICK_LO = 4200

// How steep the cap is, and what the stage behind it is worth.
//
// One pole is a tilt, not a cap. At 6 dB an octave a corner at 1200 Hz still
// hands on most of a one-shot's body, and the body is the half the tank is
// already playing — so the click arrived a quarter-turn out of phase with the
// voice it was meant to sharpen and took 22% off the kit's own level on a
// hammered line. Three poles keep the path inside the band it is named for,
// where the tanks have nothing, and then the stage has to make up the level
// that steepness costs. Which is the right way round: a click is a small
// signal through a lot of gain, not a large one leaking past a filter.
const CLICK_POLES = 3
const CLICK_GAIN = 3.1

// How much of a one-shot's width its own edge takes. A one-shot is a cap
// charging through a resistor, so it has a rise as well as a fall, and the rise
// is the fast part rather than no part: nothing on a board goes anywhere in
// nought seconds. Modelled without one, a hit arrived as a step two samples
// wide, and the kit's seven-bit converter turned that edge into broadband hash
// — a kick that measured brighter at 6 kHz than the hat sitting on top of it.
const PULSE_EDGE = 2.5

// How much charge each one-shot loses to every other one fired with it, with
// the sharing all the way up: two together run a third as long, four a
// seventh.
const PULSE_SHARE = 2

// What a one-shot's charge does to the metal bank's supply on its way past,
// with the trigger load all the way up: how far a hit's worth drags the six,
// and how long the local cap takes to pay it back. A hit is half the octaves;
// a crowded step is most of them.
const TRIG_FLICK_OCT = 2
const TRIG_RECOVER = 0.02

// Where the ring knob crosses over. Below it the transistor hands back less
// than it took and the drum is a drum; at it the network never runs down; past
// it the loop makes up the difference and the tank grows into its own clipping.
// The crossing sits inside the travel rather than at the end of it, because a
// far side you cannot get to is not a far side.
const RING_LATCH = 0.9

// The gap between the clap's bursts as the board shipped.
const CLAP_GAP_MS = 9

// How long the accent cap takes to come back after a step has drawn on it,
// counted off the kit's own oscillator like everything else here.
const ACCENT_RECHARGE = 0.25

// What the choke resistor is worth, in the same count of the kit's own
// oscillator every envelope here is measured in. It is the closed hat's own
// rate, because on this board it is the closed hat's own resistor: the pedal
// came first and the patch is a wire onto the part that was already there.
const CHOKE_COUNT = 60

// What one voice takes off the accent cap with the sag knob all the way up, as
// a fraction of the charge on it. Six voices on one step empty it — the board
// carries more than six, and a step that strikes every one of them is a step
// the accent has nothing left to give, which is what a shared cap does. A
// number rather than a count of the voices: what a voice draws is what a voice
// draws, and soldering another one on does not make the rest thirstier.
const ACCENT_DRAW = 1 / 6

// How long the noise transistor holds a mind, at the two ends of its bias.
//
// The hiss on a board like this is one transistor's base-emitter junction run
// backwards until it avalanches, which is not something a designer specifies —
// it is a junction driven past where it breaks down. Given plenty of reverse
// bias it conducts steadily and the kit has noise. Back it toward the knee and
// it stops making its mind up: it latches into conducting and out again at
// random, holding each for between a third of a millisecond and a tenth of a
// second. That is a documented failure of marginal parts, and it is called
// popcorn noise for what it sounds like.
//
// These two are the only durations on this board not counted off the chip's
// oscillator, because nothing clocks an avalanche. Everything else here goes
// through perSample and drags when the rail does.
//
// The trimmer is also the only thing that moves the junction. A sagging supply
// is the obvious second hand on it and does not reach: a bias resistor is
// specified with margin, so by the time the rail is far enough down to walk the
// junction back to its knee the watchdog has the chip in reset and there is
// nothing hanging off the transistor to hear it.
const BURST_SHORT = 0.0003
const BURST_LONG = 0.08

// How fast the junction can change its mind, which is not instantly: there is a
// coupling cap between it and the four voices hanging off it, and what a cap
// hands on is an edge with a shape rather than a step. Low enough to take the
// worst off a full-scale switch and high enough to leave the pop in it.
const NOISE_EDGE = 2000

// Where the hats' filter sits, and how much of it there is. What comes off the
// bank's summing stage is broadband, but it is broadband with the bank's own
// rate all through it, and a hat is only the part of that above where a pitch
// can be heard. Forty-odd decibels down at the top of the bank is what it takes
// to be sure of that; one pole at this corner hands back a cowbell.
const HAT_HP = 5000
const HAT_POLES = 3

// And the lid over it. The cymbal has had one all along, and it is the same
// stage at the far end of the same bank, so it is the same corner — see CYM_LP
// below, which is where this number comes from. Left off, an eighth of a closed
// hat's power sat above 16 kHz: past where anyone hears, and still taking up the
// peak the mix bus has to find room for. HAT_METAL is what that steepness cost,
// put back.
const HAT_LP_POLES = 2

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
const HAT_LP = CYM_LP

// The cowbell's corner. A cowbell is the one metal voice with a pitch in it, so
// the filter under it has to leave that pitch alone — and this one was soldered
// up at 3.9 kHz, four octaves above the pair it taps. What came out was the
// harmonics of the pair rather than the pair: it measured 6 kHz bright, and it
// sat 11 dB under the kick in `bossa` and 20 under it in `electro`, which are
// the patterns that put the cowbell out front. Under the lower of the two
// instead, so both pass and only what the squares' own edges put above them
// does not.
//
// Two poles rather than one because a cowbell has no bottom end. At 6 dB an
// octave a corner here is still only 16 dB down where the kick lives, and the
// low end that leaked through was enough to read on a meter as a drum.
const BELL_HP = 500
const BELL_POLES = 2

// The cap between the noise transistor and the voices hung off it, and the
// corners of the two in the clap's own network. In hertz rather than as
// coefficients: a coefficient is a corner *at one sample rate*, and the rate
// here is whatever the browser opened the context at. Written the old way every
// one of these sat an octave high on a 96 kHz device.
const NOISE_LP = 2200
const CLAP_LP = 4600
const CLAP_HP = 390

// The lid on the transistor itself, and the snare's own corner under it.
//
// There is one junction on this board and one cap off it, so there is one band,
// and it belongs to the source rather than to each voice hung off it. A snare's
// hiss lives between the drum and the air and not above both, and one pole
// taken off the transistor is a 6 dB tilt rather than a band: it left the noise
// flat to Nyquist, with the loudest octave of a snare sitting above 8 kHz, so
// what arrived was air laid over the two networks instead of a crack between
// them.
//
// Lidding the source rather than the voices is also what keeps them one source.
// Two of them on a step sum coherently because they hear the same hiss, and a
// band soldered under one voice and not the others is exactly how that stops
// being true.
const NOISE_LID = 9500
const NOISE_POLES = 2
const SNARE_HP = 400
const SNARE_NOISE = 1.33

// What each metal voice is worth in the sum. The hat's two are measured against
// each other rather than chosen, so the pot between the transistor and the bank
// crossfades instead of stepping. The open hat has no numbers of its own: it is
// the same filter and the same amplifier, and the only thing that separates it
// from the closed hat is which resistor the cap drains through.
const BELL_GAIN = 0.3
const HAT_NOISE = 0.65
const HAT_METAL = 7.8
const CYM_CRASH_GAIN = 1.27
const CYM_SPLASH_GAIN = 11.0

// The kit sampling itself, which is the only way a box with no samples in it
// gets a sampled kit. On its way up it strikes each of its eight voices once,
// through the ordinary circuits at the settings the board shipped with, and
// files what came out as one slab a voice. In sampled mode a hit plays the slab
// back; the circuits behind it do nothing at all.
//
// The rate is the one the machines this mode is named for ran at. It is not a
// round number because nobody chose it — it is a crystal divided down, and the
// records made on those boxes are records of that divider.
export const ROM_RATE = 26040
export const ROM_BITS = 12

// How long each voice is given, in the order of the rows. Long enough to hold
// the tail at the stock decay and no longer: a slab is memory, and the cymbal
// on its own is a third of the kit.
export const ROM_SECS = [0.6, 0.35, 0.1, 0.3, 0.45, 0.35, 0.6, 1.4] as const

// The filter in front of the converter and the one behind it. Both were real
// parts and both are half of why these boxes sound the way they do: with
// nothing in front, everything the metal bank puts above half the rate folds
// back down as hash that playing slowly never gets rid of; with nothing behind,
// what leaves is the staircase rather than the recording.
const ROM_AA = 10000
const ROM_AA_POLES = 2
const ROM_LP = 10000
const ROM_LP_POLES = 2

// How long the truncation gate takes to shut. A slab cut off mid-swing is a
// click, and two milliseconds is under a step and over an edge.
const ROM_FADE = 0.002

// What the kit's own fader is worth. The cut divides it back out: what belongs
// in a slab is what the voices put on the summing junction, not what the fader
// did to it afterwards.
const KIT_GAIN = 0.6

// One stream for the whole ROM, fixed, because a ROM is a ROM. The hiss in the
// snare slab is the same hiss every boot, which is the whole difference between
// a recording of a circuit and the circuit.
const ROM_SEED = 0x50f7

/** The kit's recording of itself: one slab a voice, in the bit order of a
    step, at `ROM_RATE` and on a twelve-bit grid. */
export type DrumSlabs = readonly Float32Array[]

// The slabs sit end to end in one part, in the order of the rows, and every
// voice reads them over the same wires. So a knifed address line lands one
// voice's counter in another voice's slab, and a counter whose end stop has
// been cut carries on through every slab after its own.
const SLAB_LEN = ROM_SECS.map(s => Math.round(s * ROM_RATE))
const SLAB_BASE = SLAB_LEN.map((_, v) =>
  SLAB_LEN.slice(0, v).reduce((a, n) => a + n, 0),
)
const ROM_WORDS = SLAB_LEN.reduce((a, n) => a + n, 0)
export const KIT_ROM_ADDR_LINES = Math.ceil(Math.log2(ROM_WORDS))
export const KIT_ROM_DATA_LINES = ROM_BITS
const ROM_ZERO = 1 << (ROM_BITS - 1)

/** What the end stop and the up/down pin on the slab counter are wired to. */
export const ROM_COUNT_NAMES = [
  'stops at its slab’s end',
  'runs on through the ROM',
  'counts down',
  'counts down and runs on',
]

// Cut once and shared by every kit ever built. The slabs are read-only and the
// cut is deterministic, so the second board costs nothing — and, because the
// cut runs at the ROM's own rate rather than the context's, every machine gets
// the same eight slabs. A link that sounds one way on a 44.1 kHz browser and
// another on a 48 kHz one is not a ROM, it is a recording of whoever pressed
// play first.
let ROM: DrumSlabs | null = null

// Whether a kit is being built to cut the ROM rather than to play it. The
// scratch kit runs this same constructor, and one that cut a ROM on its way to
// cutting a ROM would never finish.
let cutting = false

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
  // Each one-shot's width as a share of the knob's, and the fall and edge that
  // width comes to. A one-shot fired alone is the whole width.
  private pulseShare = 0
  private pulseS = 0
  private pulseW = new Float64Array(N_VOICES).fill(1)
  private pulseFallV = new Float64Array(N_VOICES)
  private pulseRiseV = new Float64Array(N_VOICES)
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
  private bellHp = new Highpass(BELL_POLES)
  private noiseLp = 0
  private noiseLid = new Lowpass(NOISE_POLES)
  private snareBand = new Highpass(NOISE_POLES)
  // Whether the noise transistor's junction is avalanching this instant, how
  // long it has left before it changes its mind, and what the cap between it
  // and the four voices hung off it has made of that. It runs whether or not
  // anything is listening — nothing on the board gates a junction — so a hit
  // catches it wherever it happens to be.
  private avalanche = 1
  private burstLeft = 0
  private noiseGate = 1
  private burstRng: Rng
  // The metal section: one bank of six oscillators, and the filters that make
  // the four voices hung off it different from each other.
  private metal: MetalBank
  private hatHp = new Highpass(HAT_POLES)
  private hatLp = new Lowpass(HAT_LP_POLES)
  private cymCrash = new Highpass(CYM_POLES)
  private cymSplash = new Highpass(CYM_POLES)
  private cymLp = new Lowpass(CYM_LP_POLES)
  // The one converter, and what it is holding between conversions. The chip
  // computes a voice, moves on to the next, and writes the ladder once it has
  // been round them all — so what reaches the output is a staircase whose step
  // is as wide as one pass, and a pass is as wide as the kit is busy.
  private muxHeld = 0
  private muxLeft = 0
  // How many voices the chip had to service on the pass before this one. Read a
  // sample late, because it is: the chip counts the work as it does it.
  private live = 1
  // Which voices are running down through the choke resistor rather than their
  // own, and which trigger line puts them there. A choked voice is not a
  // silenced one: what is left of it drains in a hurry, which is the difference
  // between a pedal and a mute.
  private chokedBits = 0
  private chokeFrom = CHOKE_WIRING[0]!
  // The voice whose strike arms the counter's clear, and whether it is armed.
  private resetBit = 0
  private clearing = false
  // The voice the ring comparator listens to, what it strikes, and whether the
  // ring has dipped under the low trip point since it last fired.
  private ringSrc = -1
  private ringBits = 0
  private ringArmed = true
  // The sync tank's last sample, for finding its rising zero crossings.
  private syncPrev = 0
  // The charge the one-shots have taken off the bank's local supply and not
  // yet had back.
  private trigSag = 0
  private clickCap = new Highpass(CLICK_POLES)
  private clickSlew = new OnePoleLP()
  private clapFast = 0
  private clapSlow = 0
  private clapsLeft = 0
  private clapTimer = 0
  private clapCount = 3
  private lastReboot = 0
  private rng: Rng
  private slipRng: Rng
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
  private diceOnJunction = false
  private diceHeld = 0
  // The bar as a circulating register: one row of cells a voice, what the panel
  // last wrote into each, the extra stage a late return passes through, and
  // the voices the register handed out at the counter's last arrival.
  private loop = 0
  private loopCells = new Uint16Array(N_VOICES)
  private loopSeen = new Int32Array(N_VOICES).fill(-1)
  private loopLate = 0
  private loopHeld = 0
  private loopAt = new Uint8Array(N_VOICES)
  // How far a voice has to have drained before its one-shot will answer again.
  // At 1 nothing is ever locked out, because an envelope leaves at 1 and only
  // falls: the board that touches this knob is the only one that divides.
  private trigFloor = 1
  // What this board's resistors came out at, in counts of the rung they sit on.
  // Drawn once: the knob says how bad the ladder is, not which parts are wrong.
  private trim = new Float32Array(LADDER_BITS)
  private words = new Float64Array(1 << LADDER_BITS)
  private wordsBits = 0
  // A hit from outside the box — a pad on a controller, struck by hand rather
  // than by the sequencer. It waits here for the top of the next block: the
  // trigger line is a wire the DSP reads, and nothing on the main thread can
  // reach into the middle of one.
  private struckBits = 0
  private struckGain = 0
  // The ROM this kit cut of itself, where each voice is reading in its own
  // slab, and what the choke resistor has left of it. A position past the end
  // is a voice that has finished. The gate is there because a recording has no
  // envelope to drain: everything else on this board chokes by running an
  // envelope down in a hurry, and a slab has none to run.
  private romPos = new Float64Array(N_VOICES).fill(Infinity)
  // Where each voice's counter starts and how far it runs this block, which the
  // counter wire decides.
  private romFrom = new Int32Array(N_VOICES)
  private romSpan = new Int32Array(N_VOICES)
  private romDown = false
  private romAddrBus: Bus
  private romDataBus: Bus
  private romAddrLine = -1
  private romAddrFault = 0
  private romDataLine = -1
  private romDataFault = 0
  private readonly image: RomImage | null
  private romGate = new Float32Array(N_VOICES).fill(1)
  private romLp = new Lowpass(ROM_LP_POLES)
  private playingRom = false
  // Voices that have fired since the panel last looked. Every hit stamps it —
  // the sequencer's, the retrigger bend's, the mic's, a bridged trigger line's,
  // a pad's — because the grid lights for whatever strikes the kit, and all but
  // the first of those land on steps nobody can see coming.
  private firedSince = 0
  // Voices whose ringing hit came off an echo step, and whether the step being
  // fired is one.
  private thrown = 0
  private throwing = false
  private throwLen = STEPS
  // Voices a slow scan has not reached yet on a crowded step.
  private scanBits = 0
  private scanLeft = new Int32Array(N_VOICES)
  private scanGain = new Float32Array(N_VOICES)
  private scanThrow = 0
  private scanSamples = 0

  private readonly sr: number
  private readonly rail: ToyRail
  private readonly transport: Transport

  constructor(sr: number, rail: ToyRail, transport: Transport, seed = 202) {
    this.sr = sr
    this.rail = rail
    this.transport = transport
    // Before anything else draws on the board: the scratch kit inside cutRom
    // runs this same constructor, and it has to find the flag rather than a
    // half-built instance.
    this.image = cutting ? null : romImage()
    this.romAddrBus = new Bus(KIT_ROM_ADDR_LINES, seed ^ 0x50ad)
    this.romDataBus = new Bus(KIT_ROM_DATA_LINES, seed ^ 0x50da)
    this.rng = mulberry32(seed)
    this.metal = new MetalBank(sr)
    this.micTrig = new Transient(sr)
    this.addrBus = new Bus(ADDR_LINES, seed ^ 0xadd4)
    this.dataBus = new Bus(DATA_LINES, seed ^ 0xda7a)
    // How long the junction holds a state is a different question from what it
    // puts out while it holds it, so it comes off a stream of its own: a kit
    // nobody has taken near the knee draws from this one not at all, and goes
    // on rendering the hiss it always did.
    this.burstRng = mulberry32(seed ^ 0xb0b)
    // And the clock's marginal edges off theirs, so a trace nobody has touched
    // draws nothing and the counter arrives where it always arrived.
    this.slipRng = mulberry32(seed ^ 0x5107)
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

  // How long the junction holds the state it has just fallen into, in samples.
  // `hold` runs from 0 for the state the bias is fighting to 1 for the one it
  // favours, and the mean is geometric between the two ends: an avalanche is a
  // race between the field and the lattice, and neither end of that is a time.
  // The draw itself is exponential, because a junction that has been conducting
  // for a while is no more likely to stop than one that just started.
  private burstFor(hold: number): number {
    const mean = BURST_SHORT * Math.pow(BURST_LONG / BURST_SHORT, hold)
    const life = -Math.log(1 - this.burstRng()) * mean * this.sr
    return Math.max(Math.round(life), 1)
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
    if (bits > LADDER_BITS) {
      let err = 0
      for (let k = 0; k < bits; k++) if ((word >> k) & 1) err += this.trim[k]!
      return err * amt * (tol / LADDER_TOL)
    }
    // Each word's sum, taken in the same order the first time the word comes
    // up, and read back after that. NaN marks a word not yet summed.
    if (bits !== this.wordsBits) {
      this.words.fill(Number.NaN, 0, 1 << bits)
      this.wordsBits = bits
    }
    const at = (word | 0) & ((1 << bits) - 1)
    let err = this.words[at]!
    if (err !== err) {
      err = 0
      for (let k = 0; k < bits; k++) if ((at >> k) & 1) err += this.trim[k]!
      this.words[at] = err
    }
    return err * amt * (tol / LADDER_TOL)
  }

  when(p: Float32Array) {
    const on = p[IDX.drumLevel]! > 0
    if (!on) {
      this.rail.reported = 0
      this.rail.spike = 0
    }
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

  // What this tick names. Each row reads its own column, so a row five steps
  // long is round again while the kick is still in the first bar — the pattern
  // drifts against itself for as long as the two lengths take to line back up,
  // which on a five against sixteen is eighty steps.
  //
  // The word that comes back is one bit a row, and it is the trigger line
  // rather than an amplifier: a data line held high strikes the voice for real,
  // stamping the bus and lighting the row, where the cross-patch only lends an
  // envelope. The accent is the wire above the voices and goes over the same
  // bus as them, which is the whole of why it can be knifed: forced high it is
  // an accent on every step the machine fetches, and bridged to the cymbal it
  // is an accent only where the cymbal crashes.
  private wordAt(p: Float32Array, tick: number): number {
    // Once a tick, and only for the voices that have a maybe step under the
    // counter — a kit nobody has wired through the dice draws nothing from the
    // noise source, so it renders the samples it always did.
    const roll = tick !== this.rolledAt
    if (roll) {
      this.rolledAt = tick
      this.open = 0
    }
    let bits = 0
    if (this.loop > 0 && !roll) bits = this.loopHeld
    else {
      for (let v = 0; v < N_VOICES; v++) {
        const step = this.stepAt(tick, v)
        const at = STEPS - 1 - step
        const bit = 1 << v
        const cells =
          this.loop > 0 ? this.loopCells[v]! : Math.round(p[VOICE_PARAM[v]!]!)
        if ((Math.round(p[MAYBE_PARAM[v]!]!) >> at) & 1) {
          if (roll) {
            const closed = this.rng() < this.chance
            if (!this.diceOnJunction || this.noiseGate > 0.5) {
              if (closed) this.open |= bit
              this.diceHeld = closed
                ? this.diceHeld | bit
                : this.diceHeld & ~bit
            } else this.open |= this.diceHeld & bit
          }
          if (this.open & bit) bits |= bit
          else if (this.loop > 0 && (cells >> at) & 1) bits |= bit
        } else if ((cells >> at) & 1) bits |= bit
        this.loopAt[v] = at
      }
      if (this.loop > 0) this.circulate(bits)
    }
    const accentStep = this.stepAt(tick, ACCENT_ROW)
    if ((Math.round(p[IDX.drumAccent]!) >> (STEPS - 1 - accentStep)) & 1)
      bits |= ACCENT_BIT
    return this.dataBus.read(bits, this.dataLine, this.dataFault, this.busCut)
  }

  // What comes back round into the cells the counter just read. The register
  // hands out a column, and each bit re-enters the loop through the knife: so a
  // pattern rewrites itself a lap at a time and nothing ever writes the panel.
  private circulate(played: number) {
    this.loopHeld = played
    const late = this.loopLate
    for (let v = 0; v < N_VOICES; v++) {
      const at = this.loopAt[v]!
      const cells = this.loopCells[v]!
      const out = (played >> v) & 1
      let back = out
      if (this.loop === LOOP_INVERT) back = out ^ 1
      else if (this.loop === LOOP_LATE) {
        back = (late >> v) & 1
        this.loopLate = (this.loopLate & ~(1 << v)) | (out << v)
      } else if (this.loop === LOOP_NEXT)
        back = (played >> ((v + N_VOICES - 1) % N_VOICES)) & 1
      else if (this.loop === LOOP_XOR) {
        const len = this.lens[v]!
        const next = STEPS - 1 - ((STEPS - 1 - at + 1) % len)
        back = out ^ ((cells >> next) & 1)
      }
      this.loopCells[v] = (cells & ~(1 << at)) | (back << at)
    }
  }

  // Loads the register from the panel the first time it is wired, and again
  // for any row the panel writes while it circulates.
  private wireLoop(p: Float32Array) {
    const knife = Math.round(p[IDX.drumLoop]!)
    const was = this.loop
    this.loop = knife > 0 && knife < LOOP_NAMES.length ? knife : 0
    if (this.loop === 0) return
    if (was === 0) {
      this.loopSeen.fill(-1)
      this.loopLate = 0
    }
    for (let v = 0; v < N_VOICES; v++) {
      const row = Math.round(p[VOICE_PARAM[v]!]!)
      if (row === this.loopSeen[v]) continue
      this.loopSeen[v] = row
      this.loopCells[v] = row
    }
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
        this.clapsLeft = this.clapCount
        this.clapTimer = 0
      } else {
        if (this.env[v]! > this.trigFloor) continue
        this.gain[v] = gain
        this.env[v] = 1
      }
      // A voice that has just been struck is not being drained, whatever was
      // across it a moment ago; and its own trigger line drains whatever the
      // choke wire is soldered to.
      this.chokedBits &= ~(1 << v)
      for (let w = 0; w < N_VOICES; w++)
        if (this.chokeFrom[w] === v) this.chokedBits |= 1 << w
      // Same charge whatever the one-shot's width: the pulse is where it goes,
      // not how much of it there is.
      this.pulse[v] = gain * (1 - this.pulseFall)
      // And the needle goes back to the top of the slab. Unconditionally: the
      // mode is a switch on the output stage, not on the trigger line, so the
      // line does the same thing either way and only what listens to it moves.
      this.romPos[v] = 0
      this.romGate[v] = 1
      struck |= 1 << v
    }
    if (!struck) return 0
    let n = 0
    for (let v = 0; v < N_VOICES; v++) if (struck & (1 << v)) n++
    const w = 1 / (1 + PULSE_SHARE * this.pulseShare * (n - 1))
    for (let v = 0; v < N_VOICES; v++) if (struck & (1 << v)) this.narrow(v, w)
    if (struck & this.resetBit) this.clearing = true
    this.firedSince |= struck
    this.thrown = this.throwing ? this.thrown | struck : this.thrown & ~struck
    ctx.trig.drumFired(i, struck, gain)
    return struck
  }

  private narrow(v: number, w: number) {
    this.pulseW[v] = w
    this.pulseFallV[v] = w === 1 ? this.pulseFall : this.pulseFall ** (1 / w)
    this.pulseRiseV[v] =
      w === 1
        ? this.pulseRise
        : lpCoef(PULSE_EDGE / (TAU * this.pulseS * w), this.sr)
  }

  private ringCompare(heard: number, ctx: Ctx, i: number) {
    if (!this.ringArmed) {
      if (heard < RING_TRIG_LOW) this.ringArmed = true
      return
    }
    if (heard <= RING_TRIG_HIGH) return
    this.ringArmed = false
    this.hit(this.ringBits, this.gain[this.ringSrc]!, ctx, i)
  }

  /** Holds back every voice after the first, one scan apart; returns the first. */
  private scan(bits: number, gain: number): number {
    let first = 0
    let k = 0
    for (let v = 0; v < N_VOICES; v++) {
      const bit = 1 << v
      if (!(bits & bit)) continue
      if (k === 0) first = bit
      else {
        this.scanBits |= bit
        this.scanLeft[v] = k * this.scanSamples
        this.scanGain[v] = gain
        if (this.throwing) this.scanThrow |= bit
        else this.scanThrow &= ~bit
      }
      k++
    }
    return first
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
    const word = this.wordAt(p, this.tick)
    const at = STEPS - 1 - (this.tick % this.throwLen)
    this.throwing = ((Math.round(p[IDX.drumThrow]!) >> at) & 1) === 1
    const named = word & VOICE_BITS
    let bits = fallback ? named || 1 : named
    const accent = (word & ACCENT_BIT) !== 0
    const gain = accent ? 1 + (this.accentAmt - 1) * this.accentV : 1
    if (this.scanSamples > 0 && bits & (bits - 1)) bits = this.scan(bits, gain)
    const struck = this.hit(bits, gain, ctx, i)
    this.throwing = false
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
    const modTempo = ctx.mod.read(DEST.drumBpm)
    const baseSwing = p[IDX.drumSwing]!
    const modSwing = ctx.mod.read(DEST.drumSwing)
    const slip = Math.min(Math.max(p[IDX.drumSlip]!, 0), 1)
    const baseTune = p[IDX.drumTune]!
    const modTune = ctx.mod.read(DEST.drumTune)
    // Decay and Ring set per-block constants, so their lanes are read once a
    // block: 2.7 ms is finer than any envelope they reach.
    const modDecay = ctx.mod.read(DEST.drumDecay)
    const decay = Math.min(
      Math.max(
        p[IDX.drumDecay]! * (modDecay ? octaves(2 * modDecay[0]!) : 1),
        0.05,
      ),
      64,
    )
    const modRing = ctx.mod.read(DEST.drumRing)
    const ring = modRing
      ? Math.min(Math.max(p[IDX.drumRing]! + modRing[0]!, 0), 1)
      : p[IDX.drumRing]!
    // The two halves of the snare are a transistor's hiss and a pair of tuned
    // networks, and nothing in one is in the other. So the pot between them has
    // to fade on power rather than on amplitude, or the middle of its travel —
    // which is where a snare wants to sit — comes out three decibels down on
    // both ends of it.
    const snappy = Math.min(Math.max(p[IDX.drumSnappy]!, 0), 1)
    const hiss = Math.sqrt(snappy)
    const tone = Math.sqrt(1 - snappy)
    // How far past the knee the noise transistor is biased, 1 being a junction
    // that has all the reverse voltage it wants.
    const noiseBias = Math.min(Math.max(p[IDX.drumNoiseBias]!, 0), 1)
    const noiseEdge = lpCoef(NOISE_EDGE, this.sr)
    // The same pot on the hats' amplifier, between the same transistor and the
    // metal bank, and equal-power for the same reason: the two sources have
    // nothing in common, so an amplitude fade would dip in the middle.
    const metal = Math.min(Math.max(p[IDX.drumMetal]!, 0), 1)
    const bank = Math.sqrt(metal)
    const trans = Math.sqrt(1 - metal)
    this.metal.tune(
      Math.min(Math.max(p[IDX.drumSpread]!, 0), 1),
      Math.min(Math.max(p[IDX.drumSquare]!, 0), 1),
    )
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
    const ref = Math.round(p[IDX.drumRef]!)
    const refBus =
      ref === DAC_REF_TOY ? ctx.toy : ref === DAC_REF_MIC ? ctx.mic : null
    const baseRefDepth = p[IDX.drumRefDepth]!
    const modRefDepth = ref > 0 ? ctx.mod.read(DEST.drumRefDepth) : null
    this.addrLine =
      hop(
        p[IDX.drumAddrLine]!,
        ADDR_LINES + 1,
        ctx.mod.read(DEST.drumAddrLine),
      ) - 1
    this.addrFault = hop(
      p[IDX.drumAddrFault]!,
      FAULT_NAMES.length,
      ctx.mod.read(DEST.drumAddrFault),
    )
    this.dataLine =
      hop(
        p[IDX.drumDataLine]!,
        DATA_LINES + 1,
        ctx.mod.read(DEST.drumDataLine),
      ) - 1
    this.dataFault = hop(
      p[IDX.drumDataFault]!,
      FAULT_NAMES.length,
      ctx.mod.read(DEST.drumDataFault),
    )
    this.busCut = p[IDX.drumBusCut]!
    const reset = Math.round(p[IDX.drumReset]!)
    this.resetBit = reset > 0 && reset <= N_VOICES ? 1 << (reset - 1) : 0
    if (!this.resetBit) this.clearing = false
    const [ringSrc, ringBits] =
      RING_TRIG_WIRING[Math.round(p[IDX.drumRingTrig]!)] ?? RING_TRIG_WIRING[0]!
    this.ringSrc = ringSrc
    this.ringBits = ringBits
    this.chokeFrom =
      CHOKE_WIRING[Math.round(p[IDX.drumChoke]!)] ?? CHOKE_WIRING[0]!
    // How long the chip spends on one voice, counted off its own oscillator
    // like every other duration on this board: a sagging rail slows the pass
    // as well as the tempo, so a flat kit is a coarse kit.
    const slotS = Math.max(p[IDX.drumSlot]!, 0) / 1e6 / clock
    const baseChance = p[IDX.drumChance]!
    const modChance = ctx.mod.read(DEST.drumChance)
    this.chance = Math.min(Math.max(baseChance, 0), 1)
    this.diceOnJunction = Math.round(p[IDX.drumDice]!) === 1
    // All the way up is a voice that will not answer again until it has stopped
    // sounding; at nothing the floor sits above where an envelope starts, so
    // nothing is ever locked out.
    this.trigFloor = 1 - (1 - AUDIBLE) * p[IDX.drumTrigFloor]!
    const wrap = Math.round(p[IDX.drumOverflow]!) === 1
    // Which kit is on the output this block. The scratch kit that cut the ROM
    // has no image to read, so it always plays the circuits.
    const sampled = Math.round(p[IDX.drumRom]!) === 1 && this.image !== null
    if (sampled !== this.playingRom) {
      this.playingRom = sampled
      this.swapKit()
    }
    // The clock the slabs are read off, which is the whole of the mode: pitch
    // and brightness move together because they are one fact about a recording
    // — a slab cut at 26 k and read at 13 k is an octave down and half as
    // bright.
    const romHz = Math.max(p[IDX.drumRomHz]!, 1)
    const romRate = romHz / this.sr
    const romLpCoef = lpCoef(ROM_LP, this.sr)
    // Decay is truncation on a recording rather than a time constant: under 1x
    // the gate shuts part way in, and over it the slab plays whole.
    const romCut = Math.min(decay, 1)
    const romFade = Math.max(ROM_FADE * romHz, 1)
    if (sampled) this.wireRom(p)
    this.accentAmt = p[IDX.drumAccentAmt]!
    this.accentSag = p[IDX.drumAccentSag]!
    this.accentPull = coef(ACCENT_RECHARGE / clock, this.sr)

    // Every row's length, read once a block: a length that moved mid-block would
    // move a playhead the panel has already drawn.
    for (let r = 0; r < this.lens.length; r++) {
      this.lens[r] = asLen(p[LEN_PARAM[r]!]!)
    }
    this.throwLen = asLen(p[IDX.drumThrowLen]!)
    this.wireLoop(p)
    this.scanSamples = Math.round(
      (Math.max(p[IDX.drumScan]!, 0) / 1000 / clock) * this.sr,
    )

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.tick = 0
      this.stepClock = 0
      this.rolledAt = -1
      this.clearing = false
      this.loop = 0
    }

    // There is one oscillator in the chip and the envelopes are counted off it,
    // the same as the tempo and the pitch. So a rail that drags the pattern slow
    // drags every tail out with it, and a kit going down with the batteries goes
    // low, late and long rather than only low and late. Decay is a divisor on
    // that count, not a time: the knob keeps saying what it always said.
    const perSample = -clock / (this.sr * decay)
    // The clap's burst oscillator is counted off the same oscillator, so on a
    // sagging rail its bursts spread into a flam. A burst runs down at its own
    // rate or within its gap, whichever is sooner, so a fast oscillator still
    // cuts each burst short and buzzes.
    const clapGapMs = Math.max(p[IDX.drumClapGap]!, 0.1)
    const clapGap = clapGapMs / 1000 / clock
    const clapBurstFall = Math.exp(
      70 * Math.max(CLAP_GAP_MS / clapGapMs, 1) * perSample,
    )
    this.clapCount = Math.max(Math.round(p[IDX.drumClapCount]!), 1)
    const falls = this.falls
    falls[KICK] = Math.exp(9 * perSample)
    falls[SNARE] = Math.exp(22 * perSample)
    falls[HAT] = Math.exp(CHOKE_COUNT * perSample)
    falls[CLAP] = Math.exp(13 * perSample)
    falls[TOM] = Math.exp(11 * perSample)
    falls[BELL] = Math.exp(16 * perSample)
    falls[OHAT] = Math.exp(8 * perSample)
    falls[CYM] = Math.exp(4 * perSample)

    const chokeFall = Math.exp(CHOKE_COUNT * perSample)

    const clickCapCoef = lpCoef(CLICK_HI, this.sr)
    const clickSlewCoef = lpCoef(CLICK_LO, this.sr)
    const bellHpCoef = lpCoef(BELL_HP, this.sr)
    const noiseLpCoef = lpCoef(NOISE_LP, this.sr)
    const noiseLidCoef = lpCoef(NOISE_LID, this.sr)
    const snareHpCoef = lpCoef(SNARE_HP, this.sr)
    const clapLpCoef = lpCoef(CLAP_LP, this.sr)
    const clapHpCoef = lpCoef(CLAP_HP, this.sr)
    const hatHpCoef = lpCoef(HAT_HP, this.sr)
    const hatLpCoef = lpCoef(HAT_LP, this.sr)
    const cymCrashCoef = lpCoef(CYM_CRASH, this.sr)
    const cymSplashCoef = lpCoef(CYM_SPLASH, this.sr)
    const cymLpCoef = lpCoef(CYM_LP, this.sr)
    // Equal power across the wiper, for the same reason the other two pots on
    // this board are: the two taps share the bank and not much else.
    const crashMix = Math.sqrt(1 - cymTone) * CYM_CRASH_GAIN
    const splashMix = Math.sqrt(cymTone) * CYM_SPLASH_GAIN
    // The one-shot on the trigger line is a resistor and a cap, and like the
    // clap's bursts it is counted off the chip's own oscillator: a
    // sagging rail widens the pulse along with everything else.
    const pulseS = (Math.max(p[IDX.drumPulse]!, 0.01) / 1000) * clock
    this.pulseFall = Math.exp(-1 / (pulseS * this.sr))
    this.pulseRise = lpCoef(PULSE_EDGE / (TAU * pulseS), this.sr)
    // The line carries a fixed charge, so a wide one-shot is a low one. The
    // tanks integrate it and do not care; the cap onto the output does not, so
    // it reads the same line back at the height the one-shot reaches.
    const clickHeight = 1 / (1 - this.pulseFall)
    // One-shots fired together share one timing rail, so each runs short at
    // the same height: less charge into the network and less edge for the cap.
    this.pulseShare = Math.min(Math.max(p[IDX.drumPulseShare]!, 0), 1)
    this.pulseS = pulseS
    for (let v = 0; v < N_VOICES; v++) this.narrow(v, this.pulseW[v]!)

    // What each tank loses per sample, off the same count and the same divisor
    // the noise voices' envelopes come off — so a network runs down alongside
    // them rather than to a clock of its own. Ring is what the feedback knob
    // leaves of that: past the crossing the loss goes negative and the tank
    // stops being something that runs down at all.
    const ringScale = 1 - ring / RING_LATCH
    const sweep = p[IDX.drumSweep]!
    const fmDepth = BANK_FM * Math.min(Math.max(p[IDX.drumBankFm]!, 0), 1)
    const syncTank = BANK_SYNC_TANK[Math.round(p[IDX.drumBankSync]!)] ?? -1
    const couple =
      TANK_COUPLE * Math.min(Math.max(p[IDX.drumTankCouple]!, 0), 1)
    const bankPf = octaves(
      -BANK_STARVE_OCT * Math.min(Math.max(p[IDX.drumBankStarve]!, 0), 1),
    )
    const bankGate = Math.round(p[IDX.drumBankGate]!) - 1
    for (let t = 0; t < N_TANKS; t++) {
      const spec = TANKS[t]!
      this.tankF[t] = (TAU * spec.hz) / this.sr
      this.tankRate[t] = (ringScale * spec.count * clock) / (this.sr * decay)
      this.tankGain[t] = spec.voice === SNARE ? spec.gain * tone : spec.gain
    }

    const trigLoad = Math.min(Math.max(p[IDX.drumTrigLoad]!, 0), 1)
    const trigRecover = Math.exp(-1 / (TRIG_RECOVER * this.sr))
    let loadSum = 0
    let spikeSum = 0
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
      if (modChance)
        this.chance = Math.min(Math.max(baseChance + modChance[i]!, 0), 1)
      if (this.scanBits) this.scanStep(ctx, i)
      if (this.transport.drums) {
        // Swing holds the offbeat back and takes it off the step after, so a
        // pair still spans two steps and the tempo is what the knob says.
        const swing = Math.min(
          Math.max(modSwing ? baseSwing + 0.9 * modSwing[i]! : baseSwing, 0),
          0.9,
        )
        const span = this.tick % 2 === 0 ? 1 + swing * 0.5 : 1 - swing * 0.5
        this.stepClock +=
          (modTempo ? stepHz * octaves(modTempo[i]!) : stepHz) / this.sr
        if (this.stepClock >= span) {
          this.stepClock -= span
          // A knife on the counter's clock, which is the one wire on this
          // board whose fault accumulates. The strobe still lands and the
          // memory still answers, so the step fires either way — but the
          // counter only moves if the edge got over the threshold, and an edge
          // it missed leaves the bar a step longer than the one before it. The
          // phase never comes back: the kit plays the pattern you wrote, in
          // order, at the tempo you set, arriving somewhere else every bar.
          //
          // The playhead stalls with it, because the playhead is the counter —
          // which is what separates this from the bus faults, where the
          // counter is right and the cell is wrong. All the way up nothing
          // gets over the threshold at all and the machine stands on one step.
          const missed = slip > 0 && this.slipRng() < slip
          if (!missed) {
            this.tick = this.clearing ? 0 : (this.tick + 1) % CYCLE
            if (this.clearing) {
              this.clearing = false
              this.rolledAt = -1
            }
          }
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
      let send = 0
      let heard = 0
      const th = this.thrown
      if (!rail.booting) {
        // One trimmer for the whole kit, so a wire on it moves every struck
        // voice together — two octaves either way at full depth.
        const tune = modTune ? baseTune * octaves(2 * modTune[i]!) : baseTune
        const pf = rail.pitchFactor * tune
        if (!sampled) {
          // The metal bank turns whether or not the pattern is asking it for
          // anything, because nothing on the board stops it: it is six RC
          // oscillators across the supply, and the only thing that ever silenced
          // one was the supply going away. Which is why it is here, under the
          // boot check, and why two hats in a row are two different hats.
          // Solder a trigger line onto that supply and the six hold their
          // phases while the voice on it is silent.
          const powered = bankGate < 0 || env[bankGate]! > AUDIBLE
          const flick =
            trigLoad > 0
              ? octaves(
                  (-TRIG_FLICK_OCT * trigLoad * this.trigSag) /
                    (1 + this.trigSag),
                )
              : 1
          this.metal.step(powered ? pf * bankPf * flick : 0)
          // And the noise transistor, for the same reason and in the same place:
          // nothing on the board gates a junction either. Biased past the knee it
          // avalanches steadily and there is hiss; near the knee it latches in and
          // out at random instead, and the snare, both hats and the clap all hang
          // off it, so they break up together and mid-hit rather than a voice at
          // a time.
          if (noiseBias < 1) {
            if (--this.burstLeft <= 0) {
              this.avalanche = this.avalanche ? 0 : 1
              this.burstLeft = this.burstFor(
                this.avalanche ? noiseBias : 1 - noiseBias,
              )
            }
            this.noiseGate += noiseEdge * (this.avalanche - this.noiseGate)
          } else {
            this.avalanche = 1
            this.noiseGate = 1
          }
          // The bridged-T voices. Nothing here has an amplifier: the trigger
          // pulse charges the network, the network rings, and how loud the drum
          // is and how long it lasts are the same fact about the same part. What
          // the panel calls Ring is how much of that the transistor hands back,
          // so past the crossing these three stop running down and the pattern
          // starts retuning a note instead of restriking a drum.
          const bankFm = fmDepth > 0 ? 1 + fmDepth * this.metal.clash : 1
          let synced = 0
          let kickRing = 0
          for (let t = 0; t < N_TANKS; t++) {
            const v = TANKS[t]!.voice
            // The kick's ring wired into the tom's drive.
            const drive =
              couple > 0 && v === TOM
                ? shock[v]! + couple * kickRing
                : shock[v]!
            const tank = this.tanks[t]!
            if (drive === 0 && tank.level <= AUDIBLE) continue
            const ringing = tank.process(
              drive,
              this.tankF[t]! * pf * bankFm,
              this.tankRate[t]!,
              TANKS[t]!.sweep * sweep,
            )
            if (v === KICK) kickRing = ringing
            const y = ringing * this.tankGain[t]!
            if (t === syncTank) synced = y
            out += y
            if (v === this.ringSrc) heard += y
            if (th & (1 << v)) send += y
          }
          if (syncTank >= 0) {
            if (this.syncPrev <= 0 && synced > 0) this.metal.sync()
            this.syncPrev = synced
          }
          // What gets past the coupling cap on the way to the output rather than
          // into a network: the click at the front of a kick, and the only part
          // of it that survives a small speaker.
          let click = 0
          let clickThrown = 0
          for (let v = 0; v < N_VOICES; v++) {
            if (CLICK[v] === 0) continue
            const c = shock[v]! * CLICK[v]!
            click += c
            if (th & (1 << v)) clickThrown += c
          }
          const clicked =
            this.clickSlew.process(
              this.clickCap.process(click * clickHeight, clickCapCoef),
              clickSlewCoef,
            ) * CLICK_GAIN
          out += clicked
          if (clickThrown !== 0) send += (clicked * clickThrown) / click
        }
        // The clap is a run of bursts off a small oscillator and then the room:
        // one noise source, retriggered, with the last hit left to ring on.
        // Outside the branch, because it is the clap's one-shot rather than its
        // sound: it is what lets the trigger line answer again, and the
        // sampled kit needs that as much as the circuits do.
        if (this.clapsLeft > 0) {
          this.clapTimer -= 1 / this.sr
          if (this.clapTimer <= 0) {
            this.clapTimer = clapGap
            this.clapsLeft--
            env[CLAP] = 1
            amp[CLAP] = 1
          }
        }
        if (sampled) {
          // Zero-order hold, deliberately. The steps a slab read slowly comes
          // out in are the images of its own clock, and those images are what
          // this mode is for — interpolate them away and what is left is a dull
          // recording of a drum machine.
          const step = romRate * pf
          for (let v = 0; v < N_VOICES; v++) {
            const pos = this.romPos[v]!
            const len = this.romSpan[v]!
            if (pos >= len) continue
            // Where the truncation gate stands. Counted off the slab's own
            // length rather than off a clock, so winding Decay down shortens
            // every voice by the same fraction of itself.
            const left = romCut * len - pos
            if (left <= 0) {
              this.romPos[v] = Infinity
              continue
            }
            const gate = this.romGate[v]!
            const at = this.romDown
              ? this.romFrom[v]! - (pos | 0)
              : this.romFrom[v]! + (pos | 0)
            const y =
              this.romWord(at) *
              this.gain[v]! *
              gate *
              (left < romFade ? left / romFade : 1)
            out += y
            if (v === this.ringSrc) heard += y
            if (th & (1 << v)) send += y
            this.romPos[v] = pos + step
            if (this.chokedBits & (1 << v)) this.romGate[v] = gate * chokeFall
          }
          out = this.romLp.process(out, romLpCoef)
        } else {
          // There is one noise transistor on the board, and the snare, both hats
          // and the clap are all hung off it. Two of them on the same step hear
          // the same hiss, so they sum coherently into one crack instead of
          // standing beside each other as two — and the hats are a high-pass
          // rather than a second noise minus a first one, because what they
          // subtract is the filtered version of the sample being held.
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
            // Drawn either way, and gated after: the transistor is making noise
            // or it is not, and a knob that reseeded the whole kit on its way past
            // the knee would be a knob nobody could get back off.
            const noise = this.noiseLid.process(
              (this.rng() * 2 - 1) * this.noiseGate,
              noiseLidCoef,
            )
            this.noiseLp += noiseLpCoef * (noise - this.noiseLp)
            if (amp[SNARE]! > AUDIBLE) {
              const band = this.snareBand.process(noise, snareHpCoef)
              const y = band * amp[SNARE]! * weight[SNARE]! * SNARE_NOISE * hiss
              out += y
              if (th & (1 << SNARE)) send += y
            }
            // One tap for both hats, because there is one amplifier: what
            // separates them is the cap under it, not what is fed into it.
            const hatHiss = noise - this.noiseLp
            if (amp[HAT]! > AUDIBLE) {
              const y = hatHiss * amp[HAT]! * weight[HAT]! * HAT_NOISE * trans
              out += y
              if (th & (1 << HAT)) send += y
            }
            if (amp[OHAT]! > AUDIBLE) {
              const y = hatHiss * amp[OHAT]! * weight[OHAT]! * HAT_NOISE * trans
              out += y
              if (th & (1 << OHAT)) send += y
            }
            if (amp[CLAP]! > AUDIBLE) {
              this.clapFast += clapLpCoef * (noise - this.clapFast)
              this.clapSlow += clapHpCoef * (noise - this.clapSlow)
              const y =
                (this.clapFast - this.clapSlow) *
                amp[CLAP]! *
                weight[CLAP]! *
                1.6
              out += y
              if (th & (1 << CLAP)) send += y
            }
          }
          // Four voices off the one bank, and what separates them is the filter
          // each is soldered behind. The cowbell taps the top pair ahead of the
          // summing stage and takes them through a corner just under the lower of
          // the two, which is what leaves a pitch in it; the hats take what comes
          // off that stage through a corner high enough that only the clatter
          // survives; the cymbal takes the same through a lower band with a lid on
          // it, which is the body a hat throws away.
          if (amp[BELL]! > AUDIBLE) {
            const hp = this.bellHp.process(this.metal.bell, bellHpCoef)
            const y = hp * amp[BELL]! * weight[BELL]! * BELL_GAIN
            out += y
            if (th & (1 << BELL)) send += y
          }
          if (amp[HAT]! > AUDIBLE || amp[OHAT]! > AUDIBLE) {
            const hp = this.hatLp.process(
              this.hatHp.process(this.metal.clash, hatHpCoef),
              hatLpCoef,
            )
            if (amp[HAT]! > AUDIBLE) {
              const y = hp * amp[HAT]! * weight[HAT]! * HAT_METAL * bank
              out += y
              if (th & (1 << HAT)) send += y
            }
            if (amp[OHAT]! > AUDIBLE) {
              const y = hp * amp[OHAT]! * weight[OHAT]! * HAT_METAL * bank
              out += y
              if (th & (1 << OHAT)) send += y
            }
          }
          if (amp[CYM]! > AUDIBLE) {
            const sq = this.metal.clash
            const band = this.cymLp.process(
              this.cymCrash.process(sq, cymCrashCoef) * crashMix +
                this.cymSplash.process(sq, cymSplashCoef) * splashMix,
              cymLpCoef,
            )
            const y = band * amp[CYM]! * weight[CYM]!
            out += y
            if (th & (1 << CYM)) send += y
          }
        }
        // Every voice's envelope falls on its own, whatever its amplifier is
        // hearing. Decaying the envelope inside the output test instead left a
        // bridged voice stuck at full: a kick leaning all the way over to a
        // snare that never fires has nothing to open its own amplifier with, so
        // nothing was left to run its envelope down, and unpatching the bridge
        // dropped a hit that had been waiting there for minutes.
        let live = 0
        const pulse = this.pulse
        const pulseOut = this.pulseOut
        const pulseFall = this.pulseFallV
        const pulseRise = this.pulseRiseV
        const choked = this.chokedBits
        const clapping = this.clapsLeft > 0
        for (let v = 0; v < N_VOICES; v++) {
          env[v]! *=
            v === CLAP && clapping
              ? clapBurstFall
              : choked & (1 << v)
                ? chokeFall
                : falls[v]!
          // A voice built on a network has no envelope to run down, so what the
          // panel lights, what the trigger floor measures and what a bridged
          // amplifier leans on is the swing of the network itself. Which is why
          // a latched tank cannot be restruck: nothing about it ever drains.
          const t = VOICE_TANK[v]!
          if (t >= 0 && !sampled)
            env[v] = Math.max(env[v]!, this.tanks[t]!.level)
          // The one-shot runs down, and what the networks and the output see
          // is that shape with its own edge on it rather than the step the
          // counter made.
          const was = pulse[v]!
          pulse[v] = was > 1e-7 ? was * pulseFall[v]! : 0
          const lp = pulseOut[v]! + pulseRise[v]! * (pulse[v]! - pulseOut[v]!)
          pulseOut[v] = lp > 1e-7 ? lp : 0
          if (env[v]! > AUDIBLE) live++
        }
        // The one-shots draw their charge off the supply, ahead of the sound
        // they start: the bank's local cap dips at once, and the shared rail
        // hears it a block later.
        if (trigLoad > 0) {
          let charge = 0
          for (let v = 0; v < N_VOICES; v++) charge += pulseOut[v]!
          this.trigSag = this.trigSag * trigRecover + charge
          spikeSum += charge
        }
        // What the next pass has to get through. One, at the least: a chip with
        // nothing to do still goes round.
        this.live = live > 0 ? live : 1
        if (this.ringSrc >= 0) this.ringCompare(heard, ctx, i)
        // There is one converter and there are eight voices, and the chip in
        // front of it is not fast enough to pretend otherwise. It works through
        // whatever is sounding a voice at a time and writes the ladder when it
        // has been round them all, so the kit's own sample rate is not a
        // constant: it is the slot divided into a pass, and a pass is as long
        // as the step is busy. Stack the kit on one step and the kick coming
        // out of it is coarser than the same kick on its own — which is the
        // second thing on this board that a crowded step does to a voice, and
        // it comes off the same fact as the first.
        //
        // The accumulator behind the ladder is as wide as the word and no
        // wider. A cheap one rolls over rather than stopping at the top, so a
        // step stacking four voices under an accent comes out inside-out while
        // the quiet steps either side of it are untouched — the fold is the
        // pattern's own dynamics rather than a setting. Left alone, the sum
        // leaves the kit past full scale and the limiter at the end of the
        // chain is what deals with it.
        if (this.muxLeft > 0) this.muxLeft--
        else {
          // Nought is a chip that keeps up, which is the kit as it shipped:
          // every sample is its own conversion and nothing is ever held.
          this.muxLeft =
            slotS > 0
              ? Math.max(Math.round(slotS * this.live * this.sr), 1) - 1
              : 0
          let code = Math.round(out * q)
          if (wrap) code = ((((code + q) % (2 * q)) + 2 * q) % (2 * q)) - q
          // Sixteen rungs walked to add nothing is the shape of the stock
          // board: the knob rests at zero and the error scales by it.
          this.muxHeld =
            (ladder > 0
              ? code + this.ladderErr(code, bits, ladder, ladderTol)
              : code) / q
        }
        out = this.muxHeld * rail.ampFactor
        send *= rail.ampFactor
        // A multiplying converter: the reference pin scales every code, and
        // with audio on the pin the kit comes out as a product. Read ahead of
        // this sample's own write, so the bus is everything upstream of the kit.
        if (ref > 0) {
          const pin =
            ref === DAC_REF_SELF
              ? this.muxHeld
              : ref === DAC_REF_BUS
                ? io.l[i]!
                : refBus![i]!
          const r = Math.min(
            Math.max(DAC_REF_GAIN * pin, -DAC_REF_RAIL),
            DAC_REF_RAIL,
          )
          const depth = modRefDepth
            ? Math.min(Math.max(baseRefDepth + modRefDepth[i]!, 0), 1)
            : baseRefDepth
          const g = 1 + depth * (r - 1)
          out *= g
          send *= g
        }
      }

      out *= level * KIT_GAIN
      if (send !== 0) ctx.send[i]! += send * level * KIT_GAIN
      loadSum += Math.abs(out)
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.reported = loadSum / io.n
    rail.spike = (trigLoad * spikeSum) / io.n
  }

  // Crossing between the two kits, and whatever the other one was holding stops
  // being anybody's. A tank left ringing pins a voice's envelope with nothing
  // running it down, and a slab left half read resumes mid-hit — both of which
  // are the last board's sound arriving under this one's.
  private swapKit() {
    for (const tank of this.tanks) tank.reset()
    this.romLp.reset()
    this.romGate.fill(1)
    this.romPos.fill(Infinity)
  }

  // The counter wire and the knives on the ROM's own bus, read once a block.
  private wireRom(p: Float32Array) {
    const count = Math.round(p[IDX.drumRomCount]!)
    const runOn = count === 1 || count === 3
    this.romDown = count >= 2
    for (let v = 0; v < N_VOICES; v++) {
      const base = SLAB_BASE[v]!
      const len = SLAB_LEN[v]!
      this.romFrom[v] = this.romDown ? base + len - 1 : base
      this.romSpan[v] = !runOn
        ? len
        : this.romDown
          ? base + len
          : ROM_WORDS - base
    }
    this.romAddrLine = Math.round(p[IDX.drumRomAddrLine]!) - 1
    this.romAddrFault = Math.round(p[IDX.drumRomAddrFault]!)
    this.romDataLine = Math.round(p[IDX.drumRomDataLine]!) - 1
    this.romDataFault = Math.round(p[IDX.drumRomDataFault]!)
  }

  // The word at one address of the ROM, as a sample. An address held past the
  // top of the part folds back onto it, because the counter is wider than the
  // memory it walks.
  private romWord(at: number): number {
    const image = this.image!
    let a = at
    if (this.romAddrLine >= 0) {
      a =
        this.romAddrBus.read(
          a,
          this.romAddrLine,
          this.romAddrFault,
          this.busCut,
        ) % ROM_WORDS
    }
    if (this.romDataLine < 0) return image.flat[a]!
    const d = this.romDataBus.read(
      image.codes[a]!,
      this.romDataLine,
      this.romDataFault,
      this.busCut,
    )
    return ((d & ((1 << ROM_BITS) - 1)) - ROM_ZERO) / ROM_ZERO
  }

  private scanStep(ctx: Ctx, i: number) {
    for (let v = 0; v < N_VOICES; v++) {
      const bit = 1 << v
      if (!(this.scanBits & bit) || --this.scanLeft[v]! > 0) continue
      this.scanBits &= ~bit
      this.throwing = (this.scanThrow & bit) !== 0
      this.hit(bit, this.scanGain[v]!, ctx, i)
      this.throwing = false
    }
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
    this.thrown = 0
    this.scanBits = 0
    this.open = 0
    this.diceHeld = 0
    this.loop = 0
    this.rolledAt = -1
    this.clearing = false
    this.ringArmed = true
    this.syncPrev = 0
    this.trigSag = 0
    this.env.fill(0)
    this.amp.fill(0)
    this.gain.fill(1)
    this.weight.fill(1)
    this.pulse.fill(0)
    this.pulseOut.fill(0)
    this.pulseX.fill(0)
    this.pulseW.fill(1)
    this.accentV = 1
    this.bellHp.reset()
    this.noiseLp = 0
    this.noiseLid.reset()
    this.snareBand.reset()
    this.avalanche = 1
    this.burstLeft = 0
    this.noiseGate = 1
    this.metal.reset()
    this.hatHp.reset()
    this.hatLp.reset()
    this.cymCrash.reset()
    this.cymSplash.reset()
    this.cymLp.reset()
    this.swapKit()
    this.chokedBits = 0
    this.muxHeld = 0
    this.muxLeft = 0
    this.live = 1
    this.clickCap.reset()
    this.clickSlew.reset()
    this.clapFast = 0
    this.clapSlow = 0
    this.clapsLeft = 0
    this.micTrig.reset()
    this.addrBus.reset()
    this.dataBus.reset()
  }
}

// Striking the kit once a voice and filing what came out.
//
// The scratch kit is the real one: same class, same circuits, same constructor,
// with the sequencer stopped and a rail nobody is starving, so what lands in a
// slab is the voice as the board shipped it.
//
// It runs at the ROM's own rate rather than at the context's, which is what
// makes this a ROM rather than a recording. Every browser opens its context at
// whatever rate the hardware hands it, and a slab cut at 44.1 kHz and one cut
// at 48 kHz are two different chips: the same link would arrive as two
// different kits. Cut once, at the rate it is read back at, and the chip in
// every unit is the same chip.
//
// Ahead of the converter, two poles at 10 kHz. It is the part that was there —
// a sampler on one of these boxes had a real filter in front of it, and it is
// half of why they sound the way they do. What it takes off is the top of the
// metal bank, which is where this kit keeps the energy a converter this narrow
// has nothing to do with.
//
// The converter itself is left wide open and dead straight, because the kit's
// own seven-bit ladder is downstream of both kits: a slab that had already been
// through it would go through it twice.
function cutRom(): DrumSlabs {
  const sr = ROM_RATE
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const ctx: Ctx = {
    sr,
    mic: new Float32Array(BLOCK),
    fb: new Float32Array(BLOCK),
    railV: new Float32Array(BLOCK).fill(1),
    sag: new Float32Array(BLOCK),
    droop: new Float32Array(BLOCK),
    env: new Float32Array(BLOCK),
    out: new Float32Array(BLOCK),
    step: new Float32Array(BLOCK),
    carrier: new Float32Array(BLOCK),
    toy: new Float32Array(BLOCK),
    bright: new Float32Array(BLOCK),
    send: new Float32Array(BLOCK),
    heat: 0,
    fbDest: 0,
    mod: new ModBus(sr, ROM_SEED),
    trig: new TriggerBus(),
  }
  const p = packParams({
    ...DEFAULT_CONTROLS,
    drumLevel: 1,
    drumBits: LADDER_BITS,
    drumLadder: 0,
    drumSlot: 0,
    drumOverflow: 0,
    drumRom: 0,
  })
  cutting = true
  let drum
  try {
    drum = new ToyDrum(sr, new ToyRail(sr, ROM_SEED), new Transport(), ROM_SEED)
  } finally {
    cutting = false
  }
  const lp = new Lowpass(ROM_AA_POLES)
  const aa = lpCoef(ROM_AA, sr)
  const q = 1 << (ROM_BITS - 1)
  const slabs: Float32Array[] = []
  for (let v = 0; v < N_VOICES; v++) {
    const slab = new Float32Array(SLAB_LEN[v]!)
    drum.panic()
    lp.reset()
    drum.strike(1 << v, 1)
    let k = 0
    while (k < slab.length) {
      io.l.fill(0)
      io.r.fill(0)
      drum.process(io, p, ctx)
      for (let i = 0; i < BLOCK && k < slab.length; i++) {
        slab[k++] = Math.round(lp.process(io.l[i]! / KIT_GAIN, aa) * q) / q
      }
    }
    slabs.push(slab)
  }
  return slabs
}

/** The kit's ROM, cut on the first kit built and shared by every one after. */
export function kitRom(): DrumSlabs {
  ROM ??= cutRom()
  return ROM
}

interface RomImage {
  /** Every slab end to end, as samples. */
  flat: Float32Array
  /** The same words as the part stores them: offset binary, twelve bits. */
  codes: Uint16Array
}

let IMAGE: RomImage | null = null

function romImage(): RomImage {
  if (IMAGE) return IMAGE
  const flat = new Float32Array(ROM_WORDS)
  const codes = new Uint16Array(ROM_WORDS)
  const top = (1 << ROM_BITS) - 1
  for (const [v, slab] of kitRom().entries()) {
    const base = SLAB_BASE[v]!
    flat.set(slab, base)
    for (let k = 0; k < slab.length; k++) {
      const code = Math.round(slab[k]! * ROM_ZERO) + ROM_ZERO
      codes[base + k] = Math.min(Math.max(code, 0), top)
    }
  }
  IMAGE = { flat, codes }
  return IMAGE
}
