import { wrap1 } from './pitch'

// The six square oscillators every metal voice on a drum machine of this kind
// is made out of, and the reason its cowbell and its cymbal are relatives.
//
// There is no noise source in the metal section. There are six cheap squares at
// frequencies chosen not to share harmonics, a stage that squares their sum off
// again, and a filter on each voice steep enough that what comes out the far
// end is a clatter rather than six tones. The cowbell taps two of the six ahead
// of that stage and puts a notch on the pair, which is why it is the one metal
// voice you can hear a pitch in.
//
// They free-run. Nothing on the board resets them — a trigger opens an
// amplifier and that is all it does — so every hit catches the bank wherever it
// happens to be, and no two hats on a real machine start on the same edge. That
// is the whole of why an 808 hat has a life to it that a sample of one doesn't,
// and it costs six adds a sample to have.
const METAL_HZ = [205.3, 254.3, 304.4, 369.6, 540, 800] as const
const N_METAL = METAL_HZ.length

// The two the cowbell taps: the top of the bank, where the pair beat slowly
// enough to read as one struck thing rather than two.
const BELL_FROM = N_METAL - 2

// How far the spread trimmer pulls the ends of the bank apart, in octaves. One
// resistor chain sets all six, so leaning on it moves the ends and leaves the
// middle: what the knob does is widen the bank rather than transpose it, and
// Tune is still the thing that transposes.
const SPREAD_OCT = 0.4

// Where the six come up. Any spread does; this one steps by the golden ratio,
// which divides a cycle less evenly than any other number does.
const START = Float64Array.from(
  { length: N_METAL },
  (_, k) => (k * 0.6180339887) % 1,
)

export class MetalBank {
  private phase = Float64Array.from(START)
  private inc = new Float64Array(N_METAL)
  /** What comes off the summing stage: which way the six are leaning, this
      sample. Six squares that share no harmonics lean back and forth at times
      that never come round, which is the clatter. */
  clash = 0
  /** The pair the cowbell is soldered to, summed. */
  bell = 0

  constructor(private sr: number) {
    this.tune(0)
  }

  /** Where the chain leaves each oscillator, read once a block. `spread` is the
      trimmer: 0 is the frequencies the machine shipped with. */
  tune(spread: number) {
    for (let k = 0; k < N_METAL; k++) {
      // −1 at the bottom of the chain, +1 at the top, so the middle of the bank
      // sits still whatever the trimmer is doing.
      const end = (2 * k) / (N_METAL - 1) - 1
      this.inc[k] =
        (METAL_HZ[k]! * Math.exp(spread * end * SPREAD_OCT * Math.LN2)) /
        this.sr
    }
  }

  /** One sample on, at `pf` times where the trimmer left them — the kit's own
      pitch factor, so the bank sags with the batteries like everything else.

      The summing stage has nothing like the headroom for six of them, so what
      leaves it is which way they are leaning and not by how much — and that is
      the difference between a clatter and six tones. Summed and left alone, the
      loudest harmonics in the pile all belong to the fastest oscillator and a
      hat comes out ringing on one note; squared off, the edges of all six land
      in it at times that never come round, which measures very nearly twice as
      flat across the top of the band.

      The squares themselves are the naive kind, so above a couple of kilohertz
      they are also a pile of harmonics folding back down the spectrum. On a
      board whose converter is seven bits wide that is the smaller of the two
      crimes, and what folds is inharmonic hash landing under filters that pass
      nothing else. */
  step(pf: number) {
    let sum = 0
    let bell = 0
    for (let k = 0; k < N_METAL; k++) {
      const ph = wrap1(this.phase[k]! + this.inc[k]! * pf)
      this.phase[k] = ph
      const sq = ph < 0.5 ? 1 : -1
      sum += sq
      if (k >= BELL_FROM) bell += sq
    }
    this.clash = sum > 0 ? 1 : sum < 0 ? -1 : 0
    this.bell = bell
  }

  reset() {
    this.phase.set(START)
    this.clash = 0
    this.bell = 0
  }
}
