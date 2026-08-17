import { Drunk } from './util/drift'
import { mulberry32, type Rng } from './util/rng'
import { flushDenormal } from './util/softclip'

// Where a jammed die and its supply come to rest against each other, and how
// fast they get there. Low enough that the chip can't run and the pitch has
// dived most of an octave; not low enough to let the latch go.
const LATCH_HOLD = 0.06
const LATCH_PULL = 12

// The voltage the chip stops running at, and where the watchdog trips.
//
// The watchdog has to sit at or above the point the chip gives up, and it used to
// sit well below. That inverted the whole bend: the amplitude collapse silenced
// the chip at 0.2, silence meant no load, no load meant the rail was paid back,
// and the supply parked itself on a knife edge a thousandth of a volt above 0.2
// and stayed there for as long as you held the knob. What came out was a steady
// gate — the chip switching off and on at one voltage — and the reboot the bend
// is named after could not physically happen, because the current that would
// have carried the rail down there had already been cut off by the chip going
// quiet. A watchdog watches for the chip failing; it cannot be set below it.
const DEAD_V = 0.2
const WATCHDOG_V = 0.21

// The pot doing the starving is a resistor to ground, and it draws whether or
// not the chip is singing — so a starve deep enough keeps pulling after the chip
// has stopped, rather than being paid back by its silence.
const STARVE_SHUNT = 12

// The shared toy supply rail. Output current drains it in proportion to starve
// and to how flat the cells are; when it droops past the watchdog threshold the
// chip browns out, reboots after a boot delay, and everything powered from it
// restarts.
//
// Where it trips, how long it takes to come back and how far it comes back are
// all a little different every time. A watchdog built to one threshold, one
// delay and one recovery voltage reboots metronomically, which is the one thing
// a dying toy never does — and the reboot is this instrument's headline bend, so
// a metronome is the worst place for one.
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
  private heat = 0
  private latch = 0
  private cluster = 0
  private latchRemaining = 0
  private thresholdWalk = new Drunk()
  private rng: Rng

  constructor(
    private readonly sr: number,
    seed = 909,
  ) {
    this.rng = mulberry32(seed)
  }

  // Flat cells lose open-circuit voltage and gain internal resistance, so the
  // rail never recovers to full, recovers slower, and sags under load with
  // nothing starving it. Starve is the collapse; this is the floor it collapses
  // from. Heat takes the same floor down again, and the chip's own clock tracks
  // it, so a hot board runs flat as well as low. Whoever owns the tick sets it
  // once a block.
  setBattery(battery: number, heat = 0, latch = 0, cluster = 0) {
    this.battery = battery
    this.heat = heat
    this.latch = latch
    this.cluster = cluster
    this.open = Math.max(1 - 0.45 * battery - 0.12 * heat, 0.2)
  }

  // load: |output| this sample. extra: mic patched onto the rail.
  tick(load: number, starve: number, extra: number) {
    this.stress = starve + this.battery
    const charge = (60 * (1 - 0.35 * this.battery)) / this.sr
    const drain = (starve * 900 + this.battery * 80) / this.sr
    const walk = this.thresholdWalk.step(0.15, this.sr, this.rng) * 0.025

    // A latched die is a short across the supply that no longer cares what the
    // output is doing. It doesn't crash the rail to nothing, though — the latch
    // needs some rail to hold itself in, so the two settle against each other
    // and sit there: a low, steady voltage the chip can neither run on nor
    // escape from, which is why the note screams rather than stopping.
    if (this.latchRemaining > 0) {
      this.v = flushDenormal(
        this.v + (LATCH_PULL / this.sr) * (LATCH_HOLD - this.v),
      )
      this.latchRemaining--
      // Then the current gives out, and the watchdog finally gets the power
      // cycle it has been locked out of.
      if (this.latchRemaining === 0) this.reboot()
      return
    }

    // The pot doing the starving is a resistor to ground, and it draws whether
    // or not the chip is singing. Without that the loop closed the wrong way:
    // the amplitude collapse cut the load, no load meant the rail was paid back,
    // and the supply parked itself a whisker above the watchdog threshold and
    // stayed there. A hard starve came out as a steady gate — the chip switching
    // off and on at one voltage — and the watchdog never tripped at all, so the
    // reboot the whole bend is named after was unreachable from this knob.
    const shunt = (starve * STARVE_SHUNT) / this.sr
    this.v +=
      charge * (this.open - this.v) -
      drain * (load + this.reported + extra) -
      shunt
    this.v = flushDenormal(Math.min(Math.max(this.v, 0), 1))

    if (this.bootRemaining > 0) {
      this.bootRemaining--
      return
    }
    if (this.stress > 0 && this.v < WATCHDOG_V + 0.05 * this.heat + walk) {
      // Sometimes it doesn't reboot cleanly. CMOS on a collapsing rail can
      // latch instead: the die jams, holds whatever it was doing and keeps
      // drawing current, so one note screams down into the floor and the
      // watchdog is locked out until the supply gives up under it. Hot parts
      // latch more readily, which is why it happens to a toy that has been
      // running a while and not to one just switched on.
      if (this.rng() < this.latch * (0.35 + 0.65 * this.heat)) {
        const held = 1 + this.cluster * 2
        this.latchRemaining = Math.floor(
          (0.1 + this.rng() * 1.1 * held) * this.sr,
        )
      } else {
        this.reboot()
      }
    }
  }

  private reboot() {
    this.rebootCount++
    // How long the reset line holds, and how far the rail has climbed by the
    // time it lets go. Flat cells take longer to get there and arrive lower, so
    // a dying toy reboots into a worse state than it left.
    this.bootRemaining = Math.floor(
      (0.04 + this.rng() * 0.09) * (1 + 0.6 * this.battery) * this.sr,
    )
    this.v = Math.min(0.22 + this.rng() * 0.24, this.open)
  }

  get booting() {
    return this.bootRemaining > 0
  }

  /** Jammed rather than rebooting: still powered, still sounding, stuck. */
  get latched() {
    return this.latchRemaining > 0
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
  // there — a rail nobody is straining sits at rest, not dead. A latched die is
  // not dead either: it is the loudest the chip ever gets.
  get dead() {
    return !this.latched && this.stress > 0 && this.v < DEAD_V
  }

  reset() {
    this.v = 1
    this.bootRemaining = 0
    this.latchRemaining = 0
    this.reported = 0
    this.stress = 0
    this.thresholdWalk.reset()
  }
}
