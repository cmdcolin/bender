import { N_DRUM_VOICES, voiceMask } from '../trigbus'
import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { Transient } from '../util/follower'

// Past the voices and the whole kit, the two lines that aren't the kit at all.
const KEY_CHOICE = N_DRUM_VOICES + 2
const MIC_CHOICE = N_DRUM_VOICES + 3

// A dropped audio file at bendable speed: looping through the chain, or waiting
// on a trigger line the way the kit's own voices do. Struck, it is a seventh
// drum voice — whatever you dropped, played from the top on every hit.
export class Sampler implements Stage {
  label = 'sampler'
  private buf: Float32Array | null = null
  private pos = 0
  private playing = true
  private micTrig: Transient

  constructor(sr: number) {
    this.micTrig = new Transient(sr)
  }

  setBuffer(mono: Float32Array) {
    this.buf = mono
    this.pos = 0
    this.playing = true
  }

  // True whenever there is a file and a level, playing or not: a stage skipped is
  // a stage that never sees the hit that would start it.
  when(p: Float32Array) {
    return p[IDX.sampleLevel]! > 0 && this.buf !== null
  }

  private struck(trig: number, ctx: Ctx, i: number): boolean {
    if (trig === MIC_CHOICE) return this.micTrig.process(ctx.mic[i]!, 0.05)
    if (trig === KEY_CHOICE) return ctx.trig.key[i]! > 0
    return (Math.round(ctx.trig.drumBits[i]!) & voiceMask(trig)) !== 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const buf = this.buf
    if (!buf || buf.length < 2) return
    const n = buf.length
    const level = p[IDX.sampleLevel]!
    const speed = p[IDX.sampleSpeed]!
    const trig = Math.round(p[IDX.sampleTrig]!)
    const oneShot = Math.round(p[IDX.sampleMode]!) === 1

    for (let i = 0; i < io.n; i++) {
      if (trig > 0 && this.struck(trig, ctx, i)) {
        // Backwards, a hit drops the needle at the other end of the file.
        this.pos = speed < 0 ? n - 1 : 0
        this.playing = true
      }
      if (!this.playing) continue

      const idx = Math.floor(this.pos)
      const frac = this.pos - idx
      const a = buf[idx % n]!
      const b = buf[(idx + 1) % n]!
      const out = (a + frac * (b - a)) * level

      // Off the end is where a loop comes round and a one-shot stops. A one-shot
      // with nothing wired to it is a file that plays once when you drop it.
      const next = this.pos + speed
      if (oneShot && (next >= n || next < 0)) this.playing = false
      this.pos = ((next % n) + n) % n

      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.pos = 0
    this.playing = true
    this.micTrig.reset()
  }
}
