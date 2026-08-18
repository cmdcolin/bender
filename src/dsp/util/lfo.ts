// Bring an advanced phase back into [0, 1).
//
// No increment on this board reaches a whole cycle — every one of them is a
// frequency divided by the sample rate, and the fastest is clamped under
// Nyquist — so one subtraction is the modulo. The `% 1` is what a phase moving
// faster than that would need, and it costs a compare that never fires to keep
// this the same function `% 1` is.
//
// Worth less than it looks. Ten phases a sample go through here and `% 1` is
// fmod, which costs 16.5 ns on a chain where each turn waits for the last one;
// but these ten are independent, the hardware overlaps them, and measured that
// way the compare saves 0.65 ns a turn. Six nanoseconds a sample against two
// thousand is inside the noise of a shared machine. It stays because it is
// exact and it reads no worse, not because it showed up.
export const wrap1 = (phase: number) =>
  phase < 1 ? phase : phase < 2 ? phase - 1 : phase % 1

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

// A sine and its cosine together, for four multiplies.
//
// The magic circle above carries a second state, but it sits half a sample
// behind the first — near enough for the amplitude to hold, nowhere near a
// quadrature pair. A single-sideband shifter cancels one sideband by summing
// two products, and it cancels exactly as well as its carrier is 90° apart, so
// that half sample is the difference between a shift and a ring modulator.
//
// So this rotates a unit vector by the whole angle instead: re and im come out
// as cos and sin of the same phase, and the pair costs a quarter of the two
// library calls it replaces. What it gives up is the exact invariant — rounding
// walks the amplitude by about 3e-12 over twenty seconds, and grows with the
// square root of that, so a board left running for a week is still ten thousand
// times inside the noise floor.
export class QuadOsc {
  re = 1
  im = 0
  private cw = 1
  private sw = 0

  /** The rate to turn at. Hoist it out of the sample loop where it holds. */
  setRate(hz: number, sr: number) {
    const w = (2 * Math.PI * Math.min(Math.max(hz, 0), sr * 0.49)) / sr
    this.cw = Math.cos(w)
    this.sw = Math.sin(w)
  }

  /** One turn. Read re and im after it, as cos and sin of the new phase. */
  step() {
    const re = this.re * this.cw - this.im * this.sw
    this.im = this.im * this.cw + this.re * this.sw
    this.re = re
  }

  reset() {
    this.re = 1
    this.im = 0
  }
}
