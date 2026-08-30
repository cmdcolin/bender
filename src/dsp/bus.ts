import { mulberry32, type Rng } from './util/rng'

// The wires between two parts of a chip, and what a knife does to one of them.
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
// Four things happen to a line, and they are four sounds:
//
// cut       the trace is severed and the pin behind it floats. A CMOS input
//           with nothing driving it keeps the charge the last word left on it,
//           so the bit goes stale rather than stuck. Nothing holds it there,
//           though: the parted trace still runs the length of the board beside
//           the one next to it, and a few picofarads of that is enough to drag
//           a pin nobody is driving after its neighbour's edges. So the bit
//           holds for a word or two and then starts following the traffic next
//           door, a lap behind and never quite arriving — which is the sound
//           the other three cannot make, because all three of them stand still.
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
export const FAULT = { cut: 0, ground: 1, supply: 2, bridge: 3 } as const
export const FAULT_NAMES = ['cut', 'to ground', 'to +V', 'bridged']

/** Line names for a bus of `width` wires, least significant first. */
export const lineNames = (prefix: string, width: number) => [
  'off',
  ...Array.from({ length: width }, (_, i) => `${prefix}${i}`),
]

/** How much of the neighbour's edge crosses into a parted trace, per word. */
const COUPLING = 0.12

export class Bus {
  private rng: Rng
  /** The floating pin's charge, between the rails rather than on one of them. */
  private charge = 0
  /** Which pin that charge belongs to — move the knife and it is a new pin. */
  private floating = -1
  /** The last word an unbroken bus carried, which is what a new cut holds. */
  private last = -1

  constructor(
    private readonly width: number,
    private readonly seed = 7,
  ) {
    this.rng = mulberry32(seed)
  }

  /** Where a floating line sits after one more word has gone past next door. */
  private float(word: number, line: number, cut: number) {
    const bit = 1 << line
    // The pin floats from the moment the trace parts, so it starts on whatever
    // the bus was carrying when the knife went through. A board that comes up
    // with the knife already in it has no such word behind it, and a pin nobody
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
    this.charge += COUPLING * ((word & near ? 1 : 0) - this.charge)
    return this.charge
  }

  /**
   * One word across the bus. `line` counts wires from the least significant and
   * is negative for a bus nobody has touched; `cut` is how far through the
   * trace the knife went, which only the cut fault reads.
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
        // The neighbour above, or below at the top of the bus — the knife is
        // one blob of solder and there is always something on one side of it.
        const pair = bit | (line + 1 < this.width ? bit << 1 : bit >> 1)
        return (word & pair) === pair ? word | pair : word & ~pair
      }
      default:
        // Whatever the pin has drifted to, read through the input's threshold —
        // one wire's worth of analogue in the middle of a digital bus.
        return this.float(word, line, cut) > 0.5 ? word | bit : word & ~bit
    }
  }

  reset() {
    this.floating = -1
    this.last = -1
    this.charge = 0
    this.rng = mulberry32(this.seed)
  }
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

  constructor(private readonly seed = 0xa3) {
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
