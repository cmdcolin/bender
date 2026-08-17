import { N_PARAMS, SMOOTH_SEC } from '../engine/params'

// Per-block parameter smoothing from the classes declared in PARAM_DEFS.
// 'step' snaps, 'slew' eases over ~10 ms, 'ramp' over ~3 ms.
//
// Every param's per-block coefficient is worked out once, at the sample rate
// the worklet actually got, and then the block is a multiply-add down a pair of
// typed arrays.

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
      cur[i] = cur[i]! + coef[i]! * (target[i]! - cur[i]!)
    }
  }
}
