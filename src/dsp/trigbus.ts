import { N_DRUM_VOICES } from '../drums.ts'
import { BLOCK } from './stage.ts'

export { N_DRUM_VOICES }

/** What a bridged trigger line is clipped to: nothing, one voice, or any hit at
    all. The choices run off, kick…bell, any — so the last one is the whole kit. */
export const voiceMask = (choice: number) =>
  choice <= 0
    ? 0
    : choice > N_DRUM_VOICES
      ? (1 << N_DRUM_VOICES) - 1
      : 1 << (choice - 1)

/** The choice past the last voice: any hit at all, which is the whole kit. */
export const ANY_CHOICE = N_DRUM_VOICES + 1

/** The choice past the voices and the whole kit: whatever the step names. */
export const STEP_CHOICE = N_DRUM_VOICES + 2

/** The choices of the control that says which machine has the melody memory's
    line soldered to its key input. */
export const SEQ_TO_MONO = 0
export const SEQ_TO_FM = 1
export const SEQ_TO_PCM = 2

// A note rides the key line as semitone + this, so an empty sample stays 0
// whatever the octave switch is doing to the numbers — the keys reach an octave
// under the toy's own bottom, and semitone −1 is a note somebody pressed.
export const KEY_BIAS = 128

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
  /** The kit's counter plus one where it stepped, else 0. */
  drumStep = new Float32Array(BLOCK)
  /** How many samples the last step the kit clocked lasts, swing included. */
  drumStepLen = 0
  /** The kit's unswung step rate last block, or 0 while its clock is stopped. */
  kitStepHz = 0
  /** A note the keyboard struck this block, biased; 0 where it struck nothing. */
  readonly key = new Float32Array(BLOCK)
  /** Whether a hand is still on that key. A gate line carries a level and not
      just an edge, so the one thing it can say that a trigger line cannot is
      that the note has not been let go of yet — which is the difference between
      a key and a drum hit, and what tells the chip on the other end of the wire
      whether to decide the length of the note itself. */
  readonly keyHeld = new Float32Array(BLOCK)
  /** A note the melody memory struck this block, biased; 0 where it struck
      nothing. Its own line, so the memory plays one machine while the toy's
      tune plays the others. */
  readonly seqKey = new Float32Array(BLOCK)
  /** How many samples that step lasts, plus the holds that follow it. */
  readonly seqSpan = new Float32Array(BLOCK)
  /** 1 where that step is accented. */
  readonly seqAccent = new Float32Array(BLOCK)
  /** 1 where that step slides into the next note. */
  readonly seqSlide = new Float32Array(BLOCK)

  private pendBits = new Float32Array(BLOCK)
  private pendGain = new Float32Array(BLOCK)
  private pendStep = new Float32Array(BLOCK)
  private pendStepHz = 0
  private pendStepLen = 0

  drumFired(i: number, bits: number, gain: number) {
    this.pendBits[i] = bits
    this.pendGain[i] = gain
  }

  stepClocked(i: number, tick: number, samples = 0) {
    this.pendStep[i] = tick + 1
    if (samples > 0) this.pendStepLen = samples
  }

  /** This block's strobes, so a stage that runs after the kit hears a step on
      the sample it lands. */
  get stepNow(): Float32Array {
    return this.pendStep
  }

  get stepLenNow() {
    return this.pendStepLen
  }

  kitClocking(stepHz: number) {
    this.pendStepHz = stepHz
  }

  keyStruck(i: number, semitone: number, held = false) {
    this.key[i] = semitone + KEY_BIAS
    this.keyHeld[i] = held ? 1 : 0
  }

  seqStruck(
    i: number,
    semitone: number,
    span: number,
    accent = false,
    slide = false,
  ) {
    this.seqKey[i] = semitone + KEY_BIAS
    this.seqSpan[i] = span
    this.seqAccent[i] = accent ? 1 : 0
    this.seqSlide[i] = slide ? 1 : 0
  }

  // Once a block, from the chain: last block's kit hits become the readable
  // ones and both directions start the block clean.
  swap(n: number) {
    const bits = this.drumBits
    const gain = this.drumGain
    const step = this.drumStep
    this.drumBits = this.pendBits
    this.drumGain = this.pendGain
    this.drumStep = this.pendStep
    this.pendBits = bits
    this.pendGain = gain
    this.pendStep = step
    this.pendBits.fill(0, 0, n)
    this.pendGain.fill(0, 0, n)
    this.pendStep.fill(0, 0, n)
    this.kitStepHz = this.pendStepHz
    this.pendStepHz = 0
    this.drumStepLen = this.pendStepLen
    this.key.fill(0, 0, n)
    this.keyHeld.fill(0, 0, n)
    this.seqKey.fill(0, 0, n)
    this.seqSpan.fill(0, 0, n)
    this.seqAccent.fill(0, 0, n)
    this.seqSlide.fill(0, 0, n)
  }

  panic() {
    this.drumBits.fill(0)
    this.drumGain.fill(0)
    this.pendBits.fill(0)
    this.pendGain.fill(0)
    this.drumStep.fill(0)
    this.pendStep.fill(0)
    this.kitStepHz = 0
    this.pendStepHz = 0
    this.drumStepLen = 0
    this.pendStepLen = 0
    this.key.fill(0)
    this.keyHeld.fill(0)
    this.seqKey.fill(0)
    this.seqSpan.fill(0)
    this.seqAccent.fill(0)
    this.seqSlide.fill(0)
  }
}
