import { mulberry32, type Rng } from './util/rng.ts'
import { flushDenormal } from './util/softclip.ts'

// The wires between two parts of a chip, and what a fault does to one of them.
//
// Every other bend on this board attacks the analogue — the supply, the clock,
// the output stage. A bus fault leaves all of that working perfectly and
// changes what the chip is being told. The divider still divides, the counter
// still counts, the envelope still falls; the note that arrives is simply not
// the note the ROM holds, and it is the same wrong note every time that step
// comes round. That is the difference worth having: a chip malfunctioning
// wanders, and a chip reading a cut bus plays a different song, in time, for as
// long as you leave it.
//
// Seven things happen to a line, and they are seven sounds:
//
// cut       the trace is severed and the pin behind it floats. A CMOS input
//           with nothing driving it keeps the charge the last word left on it,
//           so the bit goes stale rather than stuck. Nothing holds it there,
//           though: the parted trace still runs the length of the board beside
//           the one next to it, and a few picofarads of that is enough to drag
//           a pin nobody is driving after its neighbour's edges. So the bit
//           holds for a word or two and then starts following the traffic next
//           door, a lap behind and never quite arriving — which is the sound
//           none of the others make.
//           Cut most of the way rather than all and it conducts as well, so
//           real writes keep slamming it back to the truth in between.
// ground    shorted low. That bit is gone from every word the chip reads.
// supply    shorted high, so every word gains it — and the codes that were not
//           notes become notes, which is how a cut data line fills in a song's
//           rests.
// bridge    two neighbouring lines soldered to each other. Neither is stuck;
//           they are no longer independent, and on parts like these whichever
//           driver pulls low wins. Words collapse onto a lattice, so the tune
//           comes out in clumps.
//
// The last four take every wire from the lowest up to the chosen one, and
// never fewer than two.
//
// along     the harness soldered one hole along, the end wire looped back
//           to the first hole: the low bits rotate up one.
// reversed  the harness soldered in reverse order.
// bounce    the driver's ground lifts when enough wires fall at once, so
//           every quiet wire in the harness reads high for that word.
// probe     a probe tip dragged along the harness by hand. It wanders on its
//           own, bridges the pair it rests between, touches one pin at a time
//           on the way, and now and then lifts off.
export const FAULT = {
  cut: 0,
  ground: 1,
  supply: 2,
  bridge: 3,
  along: 4,
  reversed: 5,
  bounce: 6,
  probe: 7,
} as const
export const FAULT_NAMES = [
  'cut',
  'to ground',
  'to +V',
  'bridged',
  'one hole along',
  'reversed',
  'bounce',
  'probe drag',
]

/** Whether a fault keeps state between words, so a lookahead would disturb it. */
export const drifts = (fault: number) =>
  fault === FAULT.cut || fault === FAULT.bounce

/** The top wire of a harness fault's run, which starts at wire 0. */
export const harnessTop = (line: number, width: number) =>
  Math.min(Math.max(line, 1), width - 1)

/** Whether a fault takes the run of wires from 0 up to its line. */
export const harnessed = (fault: number) =>
  fault === FAULT.along ||
  fault === FAULT.reversed ||
  fault === FAULT.bounce ||
  fault === FAULT.probe

const harness = (top: number) => (2 << top) - 1

function reverse(bits: number, width: number) {
  let out = 0
  for (let i = 0; i < width; i++) out |= ((bits >> i) & 1) << (width - 1 - i)
  return out
}

function falls(from: number, to: number) {
  let n = 0
  for (let x = from & ~to; x; x &= x - 1) n++
  return n
}

/** Line names for a bus of `width` wires, least significant first. */
export const lineNames = (prefix: string, width: number) => [
  'off',
  ...Array.from({ length: width }, (_, i) => `${prefix}${i}`),
]

/** How much of the neighbour's edge crosses into a parted trace, per word. */
const COUPLING = 0.12

/** The probe's fastest drag, in lengths of the harness a second. */
const PROBE_SPEED = 0.8
/** How often a second the hand changes direction, lifts off and lands. */
const PROBE_TURN = 2
const PROBE_LIFT = 0.7
const PROBE_LAND = 5
/** How far between two pins the tip must sit to touch both. */
const PROBE_REACH = 0.2

const bridged = (word: number, pair: number) =>
  (word & pair) === pair ? word | pair : word & ~pair

export class Bus {
  private rng: Rng
  /** The floating pin's charge, between the rails rather than on one of them. */
  private charge = 0
  /** Which pin that charge belongs to — move the fault and it is a new pin. */
  private floating = -1
  /** The last word an unbroken bus carried, which is what a new cut holds. */
  private last = -1
  /** The word the drivers put out last time, for counting falling wires. */
  private driven = -1
  private hand: Rng
  /** Where the probe tip is along the harness, 0 at wire 0 and 1 at its top. */
  private tip = 0.5
  private drag = 0
  private touching = true

  private readonly width: number
  private readonly seed
  private readonly bounceAt: number

  constructor(width: number, seed = 7) {
    this.width = width
    this.bounceAt = Math.max(2, Math.ceil(width / 3))
    this.seed = seed
    this.rng = mulberry32(seed)
    this.hand = mulberry32(seed ^ 0x9b0e)
  }

  /** Moves the probe on by `seconds`, whether or not a probe is on the bus. */
  age(seconds: number) {
    const hand = this.hand
    if (hand() < PROBE_TURN * seconds)
      this.drag = (hand() * 2 - 1) * PROBE_SPEED
    if (hand() < (this.touching ? PROBE_LIFT : PROBE_LAND) * seconds)
      this.touching = !this.touching
    const tip = this.tip + this.drag * seconds
    this.tip = tip < 0 ? -tip : tip > 1 ? 2 - tip : tip
    if (tip < 0 || tip > 1) this.drag = -this.drag
  }

  private probe(word: number, top: number) {
    if (!this.touching) return word
    const along = this.tip * top
    const low = Math.min(Math.floor(along), top - 1)
    const off = along - low
    return off < PROBE_REACH || off > 1 - PROBE_REACH
      ? word
      : bridged(word, 0b11 << low)
  }

  /** Where a floating line sits after one more word has gone past next door. */
  private float(word: number, line: number, cut: number) {
    const bit = 1 << line
    // The pin floats from the moment the trace parts, so it starts on whatever
    // the bus was carrying when the cut went through. A board that comes up
    // with the fault already on it has no such word behind it, and a pin nobody
    // is driving is still charged to something rather than to nothing — so
    // there the seed decides which way it falls.
    if (line !== this.floating) {
      this.floating = line
      this.charge = (this.last < 0 ? this.seed : this.last) & bit ? 1 : 0
    }
    // A trace parted less than all the way still conducts sometimes, and every
    // time it does the driver wins outright: there is nothing gentle about a
    // pin that is connected.
    if (this.rng() >= cut) {
      this.charge = word & bit ? 1 : 0
      return this.charge
    }
    const near = line + 1 < this.width ? bit << 1 : bit >> 1
    this.charge = flushDenormal(
      this.charge + COUPLING * ((word & near ? 1 : 0) - this.charge),
    )
    return this.charge
  }

  /**
   * One word across the bus. `line` counts wires from the least significant and
   * is negative for a bus nobody has touched; `cut` is how far through the
   * trace the cut went, which only the cut fault reads.
   */
  read(word: number, line: number, fault: number, cut: number): number {
    if (line < 0 || line >= this.width) {
      this.last = word
      return word
    }
    const bit = 1 << line
    switch (fault) {
      case FAULT.ground:
        return word & ~bit
      case FAULT.supply:
        return word | bit
      case FAULT.bridge: {
        // The neighbour above, or below at the top of the bus — the fault is
        // one blob of solder and there is always something on one side of it.
        return bridged(
          word,
          bit | (line + 1 < this.width ? bit << 1 : bit >> 1),
        )
      }
      case FAULT.along: {
        const top = harnessTop(line, this.width)
        const mask = harness(top)
        const low = word & mask
        return (word & ~mask) | ((low << 1) & mask) | (low >> top)
      }
      case FAULT.reversed: {
        const top = harnessTop(line, this.width)
        const mask = harness(top)
        return (word & ~mask) | reverse(word & mask, top + 1)
      }
      case FAULT.bounce: {
        const before = this.driven
        this.driven = word
        return before >= 0 && falls(before, word) >= this.bounceAt
          ? word | harness(harnessTop(line, this.width))
          : word
      }
      case FAULT.probe:
        return this.probe(word, harnessTop(line, this.width))
      default:
        // Whatever the pin has drifted to, read through the input's threshold —
        // one wire's worth of analogue in the middle of a digital bus.
        return this.float(word, line, cut) > 0.5 ? word | bit : word & ~bit
    }
  }

  reset() {
    this.floating = -1
    this.last = -1
    this.driven = -1
    this.tip = 0.5
    this.drag = 0
    this.touching = true
    this.hand = mulberry32(this.seed ^ 0x9b0e)
    this.charge = 0
    this.rng = mulberry32(this.seed)
  }
}

// Two neighbouring lines crossed on their way between the chips, the way a
// hand-wired board comes out when two jumpers land in each other's holes. No
// bit is lost or stuck: every word arrives with those two bits traded, so an
// address walks its block out of order and a data word changes shape.

/** Names for the crossed pairs of a bus `width` wires wide, lowest pair first. */
export const crossNames = (prefix: string, width: number) => [
  'off',
  ...Array.from(
    { length: width - 1 },
    (_, i) => `${prefix}${i}↔${prefix}${i + 1}`,
  ),
]

/** `word` with lines `pair - 1` and `pair` traded; pair 0 leaves it alone. */
export function cross(word: number, pair: number): number {
  if (pair <= 0) return word
  const low = pair - 1
  return ((word >> low) & 1) === ((word >> pair) & 1)
    ? word
    : word ^ (0b11 << low)
}

// The strobe: the pulse that tells the address latch to take what is on the
// wires. It is not one of the four things above, because nothing here is a bit
// held anywhere — both bytes cross the bus intact and the latch simply does not
// clock, so a perfectly good value commits to whichever register the last pulse
// that landed had named. Every byte involved is right; they are paired one
// write late, which is a fault no cut wire can imitate.
//
// A latch that misses holds rather than skips, so a marginal strobe slips
// further the longer it stays marginal: two misses running is two writes of
// lag, and a strobe that never lands leaves every write in the run piling into
// whatever register was named first.
export class Strobe {
  private latched = 0
  private rng: Rng

  private readonly seed

  constructor(seed = 0xa3) {
    this.seed = seed
    this.rng = mulberry32(seed)
  }

  /** The register a write commits to. `slip` is how often the pulse is missed. */
  latch(addr: number, slip: number): number {
    if (this.rng() >= slip) this.latched = addr
    return this.latched
  }

  reset() {
    this.latched = 0
    this.rng = mulberry32(this.seed)
  }
}
