import { flushDenormal, softclip } from './softclip.ts'

const F_MARGIN = 0.98

// Chamberlin state-variable filter with a saturating band path, so negative
// damping holds a scream instead of blowing up. Mode 0 low, 1 band, 2 high.
// Positive damping is stable only while f² + 2·damp·f < 4, so process pulls f
// under that bound.
export class Svf {
  low = 0
  band = 0
  private dampWas = Number.NaN
  private fMax = 0
  process(x: number, fIn: number, damp: number, mode: number): number {
    if (damp !== this.dampWas) {
      this.dampWas = damp
      this.fMax = F_MARGIN * (Math.sqrt(damp * damp + 4) - damp)
    }
    const f = fIn < this.fMax ? fIn : this.fMax
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

/** The SVF's frequency coefficient, held under 0.22·sr for negative damping. */
export const svfF = (hz: number, sr: number) =>
  2 * Math.sin((Math.PI * Math.min(Math.max(hz, 10), sr * 0.22)) / sr)
