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
//           so the bit goes stale rather than stuck. Cut most of the way rather
//           than all and it still conducts sometimes, which is what the knife
//           actually does to a trace: the bit is right on some reads and a word
//           old on others, and the melody flickers between two versions of
//           itself.
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

export class Bus {
  private held = 0
  private rng: Rng

  constructor(
    private readonly width: number,
    seed = 7,
  ) {
    this.rng = mulberry32(seed)
  }

  /**
   * One word across the bus. `line` counts wires from the least significant and
   * is negative for a bus nobody has touched; `cut` is how far through the
   * trace the knife went, which only the cut fault reads.
   */
  read(word: number, line: number, fault: number, cut: number): number {
    if (line < 0 || line >= this.width) {
      this.held = word
      return word
    }
    const bit = 1 << line
    let out: number
    switch (fault) {
      case FAULT.ground:
        out = word & ~bit
        break
      case FAULT.supply:
        out = word | bit
        break
      case FAULT.bridge: {
        // The neighbour above, or below at the top of the bus — the knife is
        // one blob of solder and there is always something on one side of it.
        const pair = bit | (line + 1 < this.width ? bit << 1 : bit >> 1)
        out = (word & pair) === pair ? word | pair : word & ~pair
        break
      }
      default:
        out = this.rng() < cut ? (word & ~bit) | (this.held & bit) : word
    }
    this.held = out
    return out
  }

  reset() {
    this.held = 0
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
