import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { flushDenormal } from '../util/softclip'

function shape(phase: number, mode: number): number {
  switch (mode) {
    case 1:
      return 2 * phase - 1
    case 2:
      return phase < 0.25 ? 1 : -1
    default:
      return phase < 0.5 ? 1 : -1
  }
}

// Two oscillators on one starving supply. B drags A's frequency around;
// output current drains the rail, the rail drags pitch and amplitude, and the
// stall/recover cycle motorboats on its own.
export class ChaosOsc implements Stage {
  label = 'chaosOsc'
  private phaseA = 0
  private phaseB = 0
  private rail = 1

  constructor(private readonly sr: number) {}

  // Also runs while the feedback bus is patched into the FM input, so the
  // loop stays alive even with the level down.
  when(p: Float32Array) {
    return p[IDX.oscLevel]! > 0 || (p[IDX.fbDest] === 1 && p[IDX.fbAmt]! > 0)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.oscLevel]!
    const aHz = p[IDX.oscAHz]!
    const bHz = p[IDX.oscBHz]!
    const xmod = p[IDX.oscXmod]!
    const mode = Math.round(p[IDX.oscShape]!)
    const starve = p[IDX.oscStarve]!
    const micFm = p[IDX.micPatch] === 2
    const fbFm = Math.round(p[IDX.fbDest]!) === 1

    for (let i = 0; i < io.n; i++) {
      const pitchF = 0.5 + 0.5 * this.rail
      this.phaseB = (this.phaseB + (bHz * pitchF) / this.sr) % 1
      const b = shape(this.phaseB, mode)

      let out = 0
      const stalled = starve > 0 && this.rail < 0.18
      if (!stalled) {
        let hz = aHz * pitchF + xmod * b
        if (micFm) hz += ctx.mic[i]! * 1500
        if (fbFm) hz += ctx.fb[i]! * 1800
        hz = Math.min(Math.max(hz, 0), this.sr * 0.45)
        this.phaseA = (this.phaseA + hz / this.sr) % 1
        const amp = Math.min(Math.max((this.rail - 0.12) / 0.6, 0), 1)
        out = shape(this.phaseA, mode) * amp
      }

      const charge = 70 / this.sr
      const drain = (starve * 800) / this.sr
      this.rail = flushDenormal(
        Math.min(
          Math.max(
            this.rail + charge * (1 - this.rail) - drain * Math.abs(out),
            0,
          ),
          1,
        ),
      )

      out *= level * 0.5
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.phaseA = 0
    this.phaseB = 0
    this.rail = 1
  }
}
