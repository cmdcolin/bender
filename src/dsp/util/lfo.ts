// A sine that costs two multiplies.
//
// The magic circle: a state pair rotated by k = 2 sin(πf/sr), the same
// substitution the filters here already make, and exact in frequency for it.
// Amplitude holds because the rotation conserves its own invariant, so it can
// run for hours without winding down or away.
//
// Worth having wherever a sine runs per sample at a frequency the block already
// knows — a transport wobble, a mains hum, a starved pedal's squeal. Math.sin
// is one of the more expensive things on the audio thread, and a tape machine
// was calling it four times a sample to move a delay by a fraction of a
// millisecond.
export class SineOsc {
  private s = 0
  private c = 1

  /** k for a given rate; hoist it out of the sample loop. */
  static rate(hz: number, sr: number): number {
    return 2 * Math.sin((Math.PI * Math.min(Math.max(hz, 0), sr * 0.49)) / sr)
  }

  /** One step, starting from zero and rising, as sin(2πft) does. */
  step(k: number): number {
    this.c -= k * this.s
    this.s += k * this.c
    return this.s
  }

  reset() {
    this.s = 0
    this.c = 1
  }
}
