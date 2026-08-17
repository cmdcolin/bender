import { flushDenormal } from './util/softclip'

// The shared toy supply rail. Output current drains it in proportion to starve
// and to how flat the cells are; when it droops past the watchdog threshold the
// chip browns out, reboots after a boot delay, and everything powered from it
// restarts.
export class ToyRail {
  v = 1
  bootRemaining = 0
  rebootCount = 0
  // block-average load reported by circuits that don't own the tick (toyDrum)
  reported = 0
  // Open-circuit voltage: what the rail comes back to between notes.
  private open = 1
  private battery = 0
  private stress = 0

  constructor(private readonly sr: number) {}

  // Flat cells lose open-circuit voltage and gain internal resistance, so the
  // rail never recovers to full, recovers slower, and sags under load with
  // nothing starving it. Starve is the collapse; this is the floor it collapses
  // from. Whoever owns the tick sets it once a block.
  setBattery(battery: number) {
    this.battery = battery
    this.open = 1 - 0.45 * battery
  }

  // load: |output| this sample. extra: mic patched onto the rail.
  tick(load: number, starve: number, extra: number) {
    this.stress = starve + this.battery
    const charge = (60 * (1 - 0.35 * this.battery)) / this.sr
    const drain = (starve * 900 + this.battery * 80) / this.sr
    this.v +=
      charge * (this.open - this.v) - drain * (load + this.reported + extra)
    this.v = flushDenormal(Math.min(Math.max(this.v, 0), 1))
    if (this.bootRemaining > 0) {
      this.bootRemaining--
      return
    }
    if (this.stress > 0 && this.v < 0.12) {
      this.rebootCount++
      this.bootRemaining = Math.floor(0.07 * this.sr)
      this.v = Math.min(0.35, this.open)
    }
  }

  get booting() {
    return this.bootRemaining > 0
  }

  // 1 at full rail; pitch sags toward half an octave down as it dies.
  get pitchFactor() {
    return 0.55 + 0.45 * this.v
  }

  // The chip's RC clock tracks the cells rather than the instantaneous sag, so
  // a note's own current shows up as pitch and flat batteries show up as tempo:
  // the sequencer, the envelopes and the drum machine all crawl together.
  get clockFactor() {
    return 0.35 + 0.65 * this.open
  }

  get ampFactor() {
    return this.ampFactorAt(1)
  }

  // Part tolerance. Every voice shares one rail but has its own output stage,
  // so each browns out at its own voltage and sags by its own amount: a chord
  // on a starving chip detunes against itself and dies a voice at a time.
  ampFactorAt(trim: number) {
    return Math.min(Math.max((this.v - 0.15 * trim) / 0.55, 0), 1)
  }

  pitchFactorAt(trim: number) {
    return 1 - (1 - this.pitchFactor) * trim
  }

  // Down at the voltage the chip stops running at, with something holding it
  // there — a rail nobody is straining sits at rest, not dead.
  get dead() {
    return this.stress > 0 && this.v < 0.2
  }

  reset() {
    this.v = 1
    this.bootRemaining = 0
    this.reported = 0
    this.stress = 0
  }
}
