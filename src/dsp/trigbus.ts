import { N_DRUM_VOICES } from '../drums'
import { BLOCK } from './stage'

export { N_DRUM_VOICES }

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

// A note rides the key line as semitone + this, so an empty sample stays 0
// whatever the octave switch is doing to the numbers — the keys reach an octave
// under the toy's own bottom, and semitone −1 is a note somebody pressed.
const KEY_BIAS = 128

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
  /** A note the keyboard struck this block, biased; 0 where it struck nothing. */
  readonly key = new Float32Array(BLOCK)
  /** Whether a hand is still on that key. A gate line carries a level and not
      just an edge, so the one thing it can say that a trigger line cannot is
      that the note has not been let go of yet — which is the difference between
      a key and a drum hit, and what tells the chip on the other end of the wire
      whether to decide the length of the note itself. */
  readonly keyHeld = new Float32Array(BLOCK)

  private pendBits = new Float32Array(BLOCK)
  private pendGain = new Float32Array(BLOCK)

  drumFired(i: number, bits: number, gain: number) {
    this.pendBits[i] = bits
    this.pendGain[i] = gain
  }

  keyStruck(i: number, semitone: number, held = false) {
    this.key[i] = semitone + KEY_BIAS
    this.keyHeld[i] = held ? 1 : 0
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
    this.keyHeld.fill(0, 0, n)
  }

  panic() {
    this.drumBits.fill(0)
    this.drumGain.fill(0)
    this.pendBits.fill(0)
    this.pendGain.fill(0)
    this.key.fill(0)
    this.keyHeld.fill(0)
  }
}
