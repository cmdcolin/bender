import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'

// A dropped audio file looping through the chain at bendable speed.
export class Sampler implements Stage {
  label = 'sampler'
  private buf: Float32Array | null = null
  private pos = 0

  setBuffer(mono: Float32Array) {
    this.buf = mono
    this.pos = 0
  }

  when(p: Float32Array) {
    return p[IDX.sampleLevel]! > 0 && this.buf !== null
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const buf = this.buf
    if (!buf || buf.length < 2) return
    const level = p[IDX.sampleLevel]!
    const speed = p[IDX.sampleSpeed]!

    for (let i = 0; i < io.n; i++) {
      const n = buf.length
      const idx = Math.floor(this.pos)
      const frac = this.pos - idx
      const a = buf[idx % n]!
      const b = buf[(idx + 1) % n]!
      const out = (a + frac * (b - a)) * level
      this.pos = (((this.pos + speed) % n) + n) % n
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.pos = 0
  }
}
