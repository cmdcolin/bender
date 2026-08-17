import { BLOCK } from './stage'

/** The kit's voices, in the bit order of a step — the order of the rows in the
    grid, and of the choices on anything that names one. */
export const N_DRUM_VOICES = 6

/** What a bridged trigger line is clipped to: nothing, one voice, or any hit at
    all. The choices run off, kick…bell, any — so the last one is the whole kit. */
export const voiceMask = (choice: number) =>
  choice <= 0
    ? 0
    : choice > N_DRUM_VOICES
      ? (1 << N_DRUM_VOICES) - 1
      : 1 << (choice - 1)

/** The choice past the voices and the whole kit: whatever the step names. */
export const STEP_CHOICE = N_DRUM_VOICES + 2

// The two boxes' trigger lines, brought out to a bus so a wire can bridge them.
// The kit stamps which voices fired and how hard; the keyboard stamps the note
// its gate struck.
//
// One direction arrives a block late. The chip is wired ahead of the kit in the
// source order — it owns the supply tick, so it has to be — which means the
// kit's own hits are only readable next block. That is 2.7 ms, under the
// resolution of a trigger line and well under the resolution of a plastic
// keyboard's gate, and it is also what keeps a trigger loop soldered both ways
// from running away: the lap closes once a block rather than once a sample.
export class TriggerBus {
  /** Voices the kit fired last block, as the bit order of a step. */
  drumBits = new Float32Array(BLOCK)
  /** How hard, so an accented step strikes a harder note. */
  drumGain = new Float32Array(BLOCK)
  /** A note the keyboard struck this block: semitone + 1, or 0 for nothing. */
  readonly key = new Float32Array(BLOCK)

  private pendBits = new Float32Array(BLOCK)
  private pendGain = new Float32Array(BLOCK)

  drumFired(i: number, bits: number, gain: number) {
    this.pendBits[i] = bits
    this.pendGain[i] = gain
  }

  keyStruck(i: number, semitone: number) {
    this.key[i] = semitone + 1
  }

  // Once a block, from the chain: last block's kit hits become the readable
  // ones and both directions start the block clean.
  swap(n: number) {
    const bits = this.drumBits
    const gain = this.drumGain
    this.drumBits = this.pendBits
    this.drumGain = this.pendGain
    this.pendBits = bits
    this.pendGain = gain
    this.pendBits.fill(0, 0, n)
    this.pendGain.fill(0, 0, n)
    this.key.fill(0, 0, n)
  }

  panic() {
    this.drumBits.fill(0)
    this.drumGain.fill(0)
    this.pendBits.fill(0)
    this.pendGain.fill(0)
    this.key.fill(0)
  }
}
