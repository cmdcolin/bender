import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { wrap1 } from '../util/pitch'
import { flushDenormal } from '../util/softclip'

// The rail A gives up at, and the rail it will start again on.
//
// Two voltages rather than one, and that gap is the whole of the motorboat.
// With a single threshold the amplitude collapse cuts its own load the instant
// the rail crosses it, the supply is paid back, and it crosses straight back —
// so the rail parks a thousandth of a volt from the threshold and chatters
// there at audio rate. A dying toy does not do that, and it was not what this
// stage claimed to do either. An oscillator that has stopped needs headroom to
// start again, not the voltage it died at, which is true of every relaxation
// oscillator ever built and is one comparison here.
//
// ToyRail has the same failure and escapes it a different way — a watchdog
// that trips and hard-resets the rail. That fix does not transplant: a
// watchdog is a part this circuit has not got, and a starve pot drawing
// through the stall the way that one does would take the rail to nothing with
// nothing on the board to bring it back.
const DEAD_V = 0.18
const RESTART_V = 0.42

// The starve pot is a resistor in the supply lead, so winding it up feeds the
// rail less current as well as pulling more out of it. The rail therefore takes
// longer to climb back the harder it is starved, and the motorboat slows down
// as you turn the knob up rather than speeding up: around 25 Hz a third of the
// way round to about 10 Hz at the stop.
const LEAD_R = 20

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
//
// Its own supply rather than the toy's: ToyRail is a chip supply with a
// watchdog on it, and a watchdog is the wrong thing to put behind an
// oscillator that is supposed to stall and come back. The two rails still hang
// off the one wall-wart, though, which is what ctx.droop is for below.
export class ChaosOsc implements Stage {
  label = 'chaosOsc'
  private phaseA = 0
  private phaseB = 0
  private rail = 1
  private stalled = false

  constructor(private readonly sr: number) {}

  // Also runs while the feedback bus is patched into the FM input, so the
  // loop stays alive even with the level down.
  when(p: Float32Array, ctx: Ctx) {
    return p[IDX.oscLevel]! > 0 || (ctx.fbDest === 1 && p[IDX.fbAmt]! > 0)
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.oscLevel]!
    const aHz = p[IDX.oscAHz]!
    const bHz = p[IDX.oscBHz]!
    const xmod = p[IDX.oscXmod]!
    const mode = Math.round(p[IDX.oscShape]!)
    const baseStarve = p[IDX.oscStarve]!
    const modStarve = ctx.mod.read(DEST.oscStarve)
    const micFm = Math.round(p[IDX.micPatch]!) === 2
    const fbFm = ctx.fbDest === 1

    for (let i = 0; i < io.n; i++) {
      const starve = modStarve
        ? Math.min(Math.max(baseStarve + modStarve[i]!, 0), 1)
        : baseStarve
      const pitchF = 0.5 + 0.5 * this.rail
      this.phaseB = wrap1(this.phaseB + (bHz * pitchF) / this.sr)
      const b = shape(this.phaseB, mode)

      this.stalled =
        starve > 0 &&
        (this.stalled ? this.rail < RESTART_V : this.rail < DEAD_V)

      let out = 0
      if (!this.stalled) {
        let hz = aHz * pitchF + xmod * b
        if (micFm) hz += ctx.mic[i]! * 1500
        if (fbFm) hz += ctx.fb[i]! * 1800
        hz = Math.min(Math.max(hz, 0), this.sr * 0.45)
        this.phaseA = wrap1(this.phaseA + hz / this.sr)
        const amp = Math.min(Math.max((this.rail - 0.12) / 0.6, 0), 1)
        out = shape(this.phaseA, mode) * amp
      }

      // A hot part takes longer to come back after each stall, so the
      // motorboating slows down over minutes without anything being turned.
      const charge =
        (70 * (1 - 0.4 * ctx.heat)) / (1 + starve * LEAD_R) / this.sr
      const drain = (starve * 800) / this.sr
      // One wall-wart feeds the whole board, so the voltage this rail is
      // charging toward is whatever the supply is managing this sample rather
      // than a fixed one. A starved toy or a browning-out desk takes the
      // oscillator down with it — which is what everything else on the board
      // already did, and what this stage, alone among the sources, did not.
      // Nothing is pulling on the supply on a stock board, so droop is zero
      // there and the arithmetic is the arithmetic it always was.
      const open = 1 - ctx.droop[i]!
      this.rail = flushDenormal(
        Math.min(
          Math.max(
            this.rail + charge * (open - this.rail) - drain * Math.abs(out),
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
    this.stalled = false
  }
}
