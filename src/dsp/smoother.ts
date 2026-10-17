import { N_PARAMS, SMOOTH_SEC } from '../engine/params.ts'

// Per-block parameter smoothing from the classes declared in PARAM_DEFS.
// 'step' snaps, 'slew' eases over ~10 ms, 'ramp' over ~3 ms. A float32 one-pole
// stalls one rounding step short of its target, so the last gap snaps shut and
// an "off" check downstream sees exactly 0.

const SNAP = 1e-6

export class Smoother {
  readonly cur = new Float32Array(N_PARAMS)
  private readonly coef = new Float32Array(N_PARAMS)
  private started = false

  constructor(sr: number, block: number) {
    const blockSec = block / sr
    for (let i = 0; i < N_PARAMS; i++) {
      const sec = SMOOTH_SEC[i]!
      this.coef[i] = sec > 0 ? 1 - Math.exp(-blockSec / sec) : 1
    }
  }

  step(target: Float32Array) {
    if (!this.started) {
      this.cur.set(target)
      this.started = true
      return
    }
    const cur = this.cur
    const coef = this.coef
    for (let i = 0; i < N_PARAMS; i++) {
      const t = target[i]!
      const gap = t - cur[i]!
      cur[i] =
        Math.abs(gap) < SNAP * Math.max(1, Math.abs(t))
          ? t
          : cur[i]! + coef[i]! * gap
    }
  }
}
