import { DelayLine } from './util/delayline.ts'
import { DcBlocker } from './util/onepole.ts'
import { softclip } from './util/softclip.ts'

export const MIC_DELAY_MAX_S = 2

export const MIC_DELAY_ON = ['both wires', 'first wire', 'second wire']
export const DELAY_ON_FIRST = 1
export const DELAY_ON_SECOND = 2

const GLIDE_S = 0.12
const FADE_S = 0.01
const DC_COEF = 0.999

/** How long the line holds the mic, in seconds: the knob as set, or with sync
    on, the nearest whole number of kit steps and never fewer than one. */
export function micDelaySeconds(seconds: number, stepS: number) {
  return Math.min(
    stepS > 0 ? Math.max(Math.round(seconds / stepS), 1) * stepS : seconds,
    MIC_DELAY_MAX_S,
  )
}

export class MicLine {
  private readonly line: DelayLine
  private readonly loopDc = new DcBlocker()
  private readonly glide: number
  private readonly fade: number
  private delay = 0
  private wet = 0

  private readonly sr: number

  constructor(sr: number) {
    this.sr = sr
    this.line = new DelayLine(MIC_DELAY_MAX_S * sr + 4)
    this.glide = 1 - Math.exp(-1 / (GLIDE_S * sr))
    this.fade = 1 - Math.exp(-1 / (FADE_S * sr))
  }

  /** Writes into `late` what the jack hears through the line. Frozen, the
      line stops taking the mic and plays what it holds round and round. */
  process(
    dry: Float32Array,
    late: Float32Array,
    n: number,
    seconds: number,
    repeats: number,
    stepS: number,
    frozen: boolean,
  ) {
    const on = seconds > 0
    const target = on ? micDelaySeconds(seconds, stepS) * this.sr : this.delay
    if (on && this.wet === 0) this.delay = target
    if (!on && this.wet < 1e-4) {
      this.wet = 0
      for (let i = 0; i < n; i++) {
        this.line.write(dry[i]!)
        late[i] = dry[i]!
      }
    } else {
      const wetTo = on ? 1 : 0
      for (let i = 0; i < n; i++) {
        this.delay += this.glide * (target - this.delay)
        this.wet += this.fade * (wetTo - this.wet)
        const out = this.line.readHermite(this.delay - 1)
        const x = dry[i]!
        this.line.write(
          frozen && on
            ? out
            : x + this.loopDc.process(softclip(repeats * out), DC_COEF),
        )
        late[i] = x + this.wet * (out - x)
      }
    }
  }

  reset() {
    this.line.reset()
    this.loopDc.reset()
    this.delay = 0
    this.wet = 0
  }
}
