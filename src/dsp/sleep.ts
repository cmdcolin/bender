import type { Ctx, Stage } from './stage.ts'

const MAX_SLEEPERS = 64

export class Sleep {
  private readonly slot = new Map<Stage, number>()
  private readonly stages: Stage[] = []
  private readonly now = new Uint8Array(MAX_SLEEPERS)
  private readonly was = new Uint8Array(MAX_SLEEPERS)
  private readonly pending = new Uint8Array(MAX_SLEEPERS)
  private next = 0

  awake(s: Stage, p: Float32Array, ctx: Ctx) {
    const on = !s.when || s.when(p, ctx)
    if (on && s.sleep) {
      const k = this.indexOf(s)
      if (k >= 0) {
        this.now[k] = 1
        if (this.pending[k]) {
          this.pending[k] = 0
          s.sleep(p)
        }
      }
    }
    return on
  }

  hold(s: Stage) {
    if (s.sleep) {
      const k = this.indexOf(s)
      if (k >= 0) this.now[k] = 1
    }
  }

  settle(p: Float32Array) {
    const count = this.stages.length
    for (let k = 0; k < count; k++) {
      if (this.was[k] && !this.now[k]) this.pending[k] = 1
      this.was[k] = this.now[k]!
      this.now[k] = 0
    }
    for (let i = 0; i < count; i++) {
      const k = (this.next + i) % count
      if (this.pending[k]) {
        this.pending[k] = 0
        this.stages[k]!.sleep?.(p)
        this.next = (k + 1) % count
        break
      }
    }
  }

  reset() {
    this.now.fill(0)
    this.was.fill(0)
    this.pending.fill(0)
  }

  private indexOf(s: Stage) {
    const k = this.slot.get(s)
    if (k !== undefined) return k
    if (this.stages.length >= MAX_SLEEPERS) return -1
    const at = this.stages.length
    this.stages.push(s)
    this.slot.set(s, at)
    return at
  }
}
