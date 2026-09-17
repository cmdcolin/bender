import { flushDenormal, softclip } from './softclip'

// Chamberlin state-variable filter with a saturating band path, so negative
// damping holds a scream instead of blowing up. Mode 0 low, 1 band, 2 high.
export class Svf {
  low = 0
  band = 0
  process(x: number, f: number, damp: number, mode: number): number {
    this.low = flushDenormal(this.low + f * this.band)
    const high = x - this.low - damp * this.band
    this.band = flushDenormal(softclip(this.band + f * high))
    switch (mode) {
      case 1:
        return this.band
      case 2:
        return high
      default:
        return this.low
    }
  }
  reset() {
    this.low = 0
    this.band = 0
  }
}

/** Damping for a resonance knob: 2 at nothing, 0 at 1, negative past it. */
export const dampAt = (res: number) =>
  2 * (1 - Math.min(res, 1)) + (res > 1 ? -(res - 1) * 1.5 : 0)

/** The SVF's frequency coefficient, clamped under the stable limit. */
export const svfF = (hz: number, sr: number) =>
  2 * Math.sin((Math.PI * Math.min(Math.max(hz, 10), sr * 0.22)) / sr)
