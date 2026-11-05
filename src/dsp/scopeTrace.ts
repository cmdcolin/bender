export const SCOPE_LEN = 512
export const SCOPE_RING_MASK = SCOPE_LEN * 2 - 1

const ARM = 0.25

export class ScopeTrace {
  readonly ring = new Float32Array(SCOPE_LEN * 2)
  readonly out = new Float32Array(SCOPE_LEN)
  pos = 0

  unroll(peak: number) {
    const ring = this.ring
    const oldest = this.pos
    const arm = -ARM * peak
    let armed = false
    let start = SCOPE_LEN
    for (let i = 0; i <= SCOPE_LEN; i++) {
      const v = ring[(oldest + i) & SCOPE_RING_MASK]!
      if (v < arm) armed = true
      else if (armed && v >= 0) {
        start = i
        armed = false
      }
    }
    for (let i = 0; i < SCOPE_LEN; i++)
      this.out[i] = ring[(oldest + start + i) & SCOPE_RING_MASK]!
  }
}
