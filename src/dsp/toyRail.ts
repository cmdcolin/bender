import { flushDenormal } from './util/softclip'

// The shared toy supply rail. Output current drains it in proportion to
// starve; when it droops past the watchdog threshold the chip browns out,
// reboots after a boot delay, and everything powered from it restarts.
export class ToyRail {
  v = 1
  bootRemaining = 0
  rebootCount = 0
  // block-average load reported by circuits that don't own the tick (toyDrum)
  reported = 0

  constructor(private readonly sr: number) {}

  // load: |output| this sample. extra: mic patched onto the rail.
  tick(load: number, starve: number, extra: number) {
    const charge = 60 / this.sr
    const drain = (starve * 900) / this.sr
    this.v += charge * (1 - this.v) - drain * (load + this.reported + extra)
    this.v = flushDenormal(Math.min(Math.max(this.v, 0), 1))
    if (this.bootRemaining > 0) {
      this.bootRemaining--
      return
    }
    if (starve > 0 && this.v < 0.12) {
      this.rebootCount++
      this.bootRemaining = Math.floor(0.07 * this.sr)
      this.v = 0.35
    }
  }

  get booting() {
    return this.bootRemaining > 0
  }

  // 1 at full rail; pitch sags toward half an octave down as it dies.
  get pitchFactor() {
    return 0.55 + 0.45 * this.v
  }

  get ampFactor() {
    return Math.min(Math.max((this.v - 0.15) / 0.55, 0), 1)
  }

  get stalled() {
    return this.v < 0.2
  }

  reset() {
    this.v = 1
    this.bootRemaining = 0
    this.reported = 0
  }
}
