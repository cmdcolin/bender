import { N_PARAMS, SMOOTH } from '../engine/params'

// Per-block parameter smoothing from the classes declared in PARAM_DEFS.
// 'step' snaps, 'slew' eases over ~10 ms, 'ramp' over ~3 ms.

export class Smoother {
  readonly cur = new Float32Array(N_PARAMS)
  private started = false

  constructor(
    private readonly sr: number,
    private readonly block: number,
  ) {}

  step(target: Float32Array) {
    if (!this.started) {
      this.cur.set(target)
      this.started = true
      return
    }
    const blockSec = this.block / this.sr
    const slew = 1 - Math.exp(-blockSec / 0.01)
    const ramp = 1 - Math.exp(-blockSec / 0.003)
    for (let i = 0; i < N_PARAMS; i++) {
      const t = target[i]!
      switch (SMOOTH[i]!) {
        case 'step':
          this.cur[i] = t
          break
        case 'slew':
          this.cur[i] = this.cur[i]! + slew * (t - this.cur[i]!)
          break
        case 'ramp':
          this.cur[i] = this.cur[i]! + ramp * (t - this.cur[i]!)
          break
      }
    }
  }
}
