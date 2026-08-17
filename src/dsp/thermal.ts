// Heat, which has no knob of its own on the board because a real one doesn't
// either.
//
// Dissipation accumulates over tens of seconds and drifts the thresholds it
// feeds — the rail's open-circuit voltage, where the watchdog trips, how fast a
// starving oscillator recovers, how far the capstan wanders. The consequence is
// that the board three minutes in is not the instrument it was thirty seconds
// in, and it never settles anywhere, because how hard it runs depends on what
// you played. Two takes of one patch are two takes.
//
// Rises faster than it falls: a minute of screaming is still in the parts a
// couple of minutes later.
export class Thermal {
  private t = 0
  private readonly rise: number
  private readonly fall: number

  constructor(sr: number, riseS = 40, fallS = 110) {
    this.rise = 1 / (riseS * sr)
    this.fall = 1 / (fallS * sr)
  }

  /** work: how hard the board is running this block, nominally 0 to 1. */
  tick(work: number, samples: number) {
    const target = Math.min(Math.max(work, 0), 1)
    const rate = (target > this.t ? this.rise : this.fall) * samples
    this.t += Math.min(rate, 1) * (target - this.t)
  }

  get value() {
    return this.t
  }

  reset() {
    this.t = 0
  }
}
