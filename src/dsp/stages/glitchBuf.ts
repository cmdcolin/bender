import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { Burst } from '../util/burst'
import { Transient } from '../util/follower'
import { mulberry32, type Rng } from '../util/rng'

// Rolling record buffer with probabilistic stutter/reverse/repitch replay of
// the last slice — the broken CD player.
export class GlitchBuf implements Stage {
  label = 'glitchBuf'
  private bufL: Float32Array
  private bufR: Float32Array
  private writePos = 0
  private sliceCountdown = 0
  private glitching = false
  private repeatsLeft = 0
  private playPos = 0
  private sliceStart = 0
  private sliceLen = 0
  private reverse = false
  private rate = 1
  private rng: Rng
  private micTrig: Transient
  private fault: Burst

  constructor(
    private readonly sr: number,
    seed = 505,
  ) {
    const n = Math.ceil(2 * sr)
    this.bufL = new Float32Array(n)
    this.bufR = new Float32Array(n)
    this.rng = mulberry32(seed)
    this.micTrig = new Transient(sr)
    // A disc that has started skipping skips again on the next revolution.
    this.fault = new Burst(sr, 0.9, 7)
  }

  when(p: Float32Array) {
    return p[IDX.glitchMix]! > 0
  }

  private beginEvent(p: Float32Array, sliceSamples: number) {
    this.glitching = true
    this.repeatsLeft = 1 + Math.floor(this.rng() * p[IDX.glitchRepeat]!)
    this.sliceLen = sliceSamples
    const n = this.bufL.length
    this.sliceStart = (this.writePos - sliceSamples + n) % n
    this.reverse = this.rng() < p[IDX.glitchRevProb]!
    const pitchMode = Math.round(p[IDX.glitchPitch]!)
    const pick = pitchMode === 3 ? Math.floor(this.rng() * 3) : pitchMode
    this.rate = pick === 1 ? 0.5 : pick === 2 ? 2 : 1
    this.playPos = this.reverse ? sliceSamples - 1 : 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const mix = p[IDX.glitchMix]!
    const freeze = Math.round(p[IDX.glitchFreeze]!) === 1
    const sliceSamples = Math.max(
      Math.floor((p[IDX.glitchSliceMs]! / 1000) * this.sr),
      16,
    )
    const baseProb = p[IDX.glitchProb]!
    const mod = ctx.mod.read(DEST.glitch)
    const micTrig = p[IDX.micPatch] === 6
    const cluster = p[IDX.faultCluster]!
    const n = this.bufL.length

    for (let i = 0; i < io.n; i++) {
      this.fault.step()
      if (!freeze) {
        this.bufL[this.writePos] = io.l[i]!
        this.bufR[this.writePos] = io.r[i]!
        this.writePos = (this.writePos + 1) % n
      }

      this.sliceCountdown -= 1
      if (this.sliceCountdown <= 0) {
        this.sliceCountdown = sliceSamples
        const prob = mod
          ? Math.min(Math.max(baseProb + mod[i]!, 0), 1)
          : baseProb
        if (
          !this.glitching &&
          (freeze || this.fault.roll(prob, cluster, this.rng))
        ) {
          this.beginEvent(p, sliceSamples)
        }
      }
      // mic soldered onto the trigger line: a shout stutters the buffer
      if (
        micTrig &&
        !this.glitching &&
        this.micTrig.process(ctx.mic[i]!, 0.05)
      ) {
        this.beginEvent(p, sliceSamples)
      }

      let wetL = io.l[i]!
      let wetR = io.r[i]!
      if (this.glitching) {
        const idx = (this.sliceStart + Math.floor(this.playPos) + n) % n
        wetL = this.bufL[idx]!
        wetR = this.bufR[idx]!
        this.playPos += this.reverse ? -this.rate : this.rate
        const done = this.reverse
          ? this.playPos < 0
          : this.playPos >= this.sliceLen
        if (done) {
          this.repeatsLeft -= 1
          if (freeze) this.repeatsLeft = 1
          if (this.repeatsLeft <= 0) {
            this.glitching = false
          } else {
            this.playPos = this.reverse ? this.sliceLen - 1 : 0
          }
        }
      }

      io.l[i] = io.l[i]! * (1 - mix) + wetL * mix
      io.r[i] = io.r[i]! * (1 - mix) + wetR * mix
    }
  }

  panic() {
    this.bufL.fill(0)
    this.bufR.fill(0)
    this.glitching = false
    this.sliceCountdown = 0
    this.micTrig.reset()
    this.fault.reset()
  }
}
