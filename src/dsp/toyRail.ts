import { Burst } from './util/burst'
import { Drunk } from './util/drift'
import { mulberry32, type Rng } from './util/rng'
import { flushDenormal } from './util/softclip'

// How fast a jammed die and its supply come to rest against each other. Where
// they come to rest is a part value now — see PARTS.latchHold.
const LATCH_PULL = 12

// The voltage the chip stops running at.
//
// The watchdog has to sit at or above the point the chip gives up, and it used to
// sit well below. That inverted the whole bend: the amplitude collapse silenced
// the chip at 0.2, silence meant no load, no load meant the rail was paid back,
// and the supply parked itself on a knife edge a thousandth of a volt above 0.2
// and stayed there for as long as you held the knob. What came out was a steady
// gate — the chip switching off and on at one voltage — and the reboot the bend
// is named after could not physically happen, because the current that would
// have carried the rail down there had already been cut off by the chip going
// quiet. A watchdog watches for the chip failing; it cannot be set below it —
// which is the floor on the knob that moves it, not a thing the knob can undo.
export const DEAD_V = 0.2

// The pot doing the starving is a resistor to ground, and it draws whether or
// not the chip is singing — so a starve deep enough keeps pulling after the chip
// has stopped, rather than being paid back by its silence.
const STARVE_SHUNT = 12

// How much of the board's own capacitance the contact found, as a slowing
// factor on everything the supply does.
//
// This is the difference between a starve you set and a starve you hear travel.
// Straight across the supply pins there is a tenth of a microfarad and the rail
// follows its load inside a millisecond: wind the pot down and the pitch arrives
// at its new place rather than going there. Land on a pad with the smoothing can
// behind it and the same starve acquires a shape — a third of a second to fall,
// decelerating the whole way as the cap and the pot come into balance. Nobody
// adds that cap. It is already on the board; the knob is which point you found.
//
// Charge, drain, shunt and the latch pull all scale by the one factor, so the
// voltage the rail settles at is the voltage it always settled at. Only the time
// it takes to get there moves, and a cap of zero is the stock board with its
// arithmetic unchanged.
//
// The knob is which cap you found, and the caps on a board are decades apart —
// a 1 µF, a 47 µF and a 1000 µF sitting within an inch of each other. So it
// spans its range geometrically: linear here would bury everything worth
// hearing in the first tenth of the travel and leave the rest one long smear.
// End to end that is 17 ms to two seconds, with the swoop most of the way up
// through the middle where a hand is most likely to land on it.
const CAP_DECADES = 120

// A paperclip is not a switch, and it is not a short either. It bounces, it is
// held in fingers that move, and it lands on pads through skin and oxide and its
// own scratchy contact — so what it does to the supply is choke it, hard and
// briefly, rather than crash it to ground.
//
// The difference is the whole sound. Crash the rail and the pitch is simply gone
// and then simply back: two steps, and the only thing left to hear is the climb,
// which is the wrong way round. Choke it instead and the rail leaves at whatever
// rate the capacitance behind the point allows — so the note dives, decelerating,
// for as long as the metal is down, and the dive is what the bend is for.
//
// How long one touch lasts is a hand's worth, and never twice the same. A floor
// and a span rather than one duration, and the knob scales both together, as a
// ratio against this pair: shortening the mean shortens the shortest touch by as
// much, so the spread stays a hand's spread at every setting rather than
// collapsing to a metronome at one end. A ratio rather than two scaled numbers
// because a ratio of one is exactly one, and the board that touches nothing here
// has to render the same samples it always did.
const CLIP_HOLD_MIN = 0.02
const CLIP_HOLD_SPAN = 0.18

// What the board is made of, as opposed to what it is being asked to do.
//
// These were fixed for as long as there was one board. Every one of them is a
// part somebody chose — a decoupling cap, a resistor in the supply lead, the
// grade of the die — and a bent toy is a board whose parts are not the ones on
// the schematic, so each is a knob now. The defaults are the numbers that were
// compiled in, so a board that touches none of them is the board that shipped.
export interface Parts {
  /** Resistance in series with the cells, as a fraction of the whole knob.
      Flat cells lose open-circuit voltage AND gain resistance; a resistor you
      added in the lead gains only the resistance, so the rail rests where it
      always rested and sags further the harder anything pulls on it. That
      difference is the whole reason this is not the battery knob: fresh cells
      behind a resistor whoosh, and never run out of voltage to whoosh from. */
  lead: number
  /** Where a jammed die and its supply come to rest. Low enough that the chip
      can't run and the pitch has dived most of an octave; not low enough to let
      the latch go. Down near nothing the scream is a growl; up near the point
      the chip gives up it is a shriek that nearly resolves. */
  latchHold: number
  /** Where the watchdog trips, which cannot be under the voltage the chip gives
      up at — see DEAD_V. Sitting right on it, the reboot is the last thing that
      happens on the way down; well above it, the chip is reset while it is still
      perfectly able to run and the tune never gets a chance to sag at all. */
  watchdog: number
  /** How hard bare metal chokes the supply. */
  clipStarve: number
  /** How long one touch lasts on average, in seconds. */
  clipHold: number
  /** How fast the found cap charges through the contact: the rate the clock
      leaves at while the metal is down. */
  dragPull: number
  /** And the rate it comes back at when the metal lifts, which is not a
      discharge but a disconnection.

      Pressing down couples whatever cap the clip found onto the timing node,
      and that cap has to charge through the contact before the clock has
      finished moving — slow, and slower the bigger the cap. Lifting off takes
      the cap out of the circuit altogether, and the node is left with nothing
      but its own resistor and the few picofarads inside the die. So the clock
      leaves slowly and comes back at once.

      That asymmetry is the whole reason the bend reads as a dive rather than a
      wobble, and it is the one part here whose stock value is a tenfold ratio
      rather than a number. Bring the release down onto the pull and the two ends
      take the same time: the ear stops hearing dives and starts hearing a
      warble. */
  dragDrop: number
  /** The decoupling on the oscillator, as a time constant.

      One RC oscillator clocks the whole chip. The pitch is that oscillator
      divided; the tempo is the same oscillator divided further; the envelopes
      are counted off it too. They cannot come apart — drop the pitch a fifth and
      the tune slows by a fifth, because there is nothing else in there keeping
      time.

      What can differ is how fast each end sees the rail move. The timing node
      has its own decoupling, so a single note's current is averaged away before
      it reaches the timebase — which is why a chord does not make the tempo
      stutter. A sag that lasts longer than this is not averaged away by
      anything, and the whole toy slows down with it. Take the cap off and
      nothing is averaged: every note in a chord stumbles the beat. */
  decouple: number
}

export const PARTS: Parts = {
  lead: 0,
  latchHold: 0.06,
  watchdog: 0.21,
  clipStarve: 1.2,
  clipHold: 0.11,
  dragPull: 40,
  dragDrop: 400,
  decouple: 0.12,
}

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
  private cap = 0
  // How much slower the cap makes every move the supply can make. Worked out
  // once a block rather than per sample: it is a Math.pow, and the rail is
  // ticked forty-eight thousand times a second.
  private slow = 1
  private clipRemaining = 0
  private drag = 0
  // The rail as the timebase sees it, behind its own decoupling.
  private clockV = 1
  private decouple: number
  private parts: Parts = { ...PARTS }
  private thresholdWalk = new Drunk()
  private clipFault: Burst
  private rng: Rng

  constructor(
    private readonly sr: number,
    seed = 909,
  ) {
    this.rng = mulberry32(seed)
    this.clipFault = new Burst(sr, 0.8)
    this.decouple = 1 - Math.exp(-1 / (PARTS.decouple * sr))
  }

  // The parts, from whoever owns the tick, once a block alongside setBoard. The
  // one-pole coefficient off the timing node's cap is worked out here rather
  // than per sample for the same reason the reservoir factor is: it is an
  // exp() on a path that runs forty-eight thousand times a second.
  setParts(parts: Parts) {
    this.parts = parts
    this.decouple =
      1 - Math.exp(-1 / (Math.max(parts.decouple, 1e-4) * this.sr))
  }

  // What the board is being asked to do. Flat cells lose open-circuit voltage
  // and gain internal resistance, so the rail never recovers to full, recovers
  // slower, and sags under load with nothing starving it. Starve is the
  // collapse; this is the floor it collapses from. Heat takes the same floor
  // down again, and the chip's own clock tracks it, so a hot board runs flat as
  // well as low. The reservoir doesn't change any of those resting places —
  // only how long the rail takes to reach them. Whoever owns the tick sets all
  // of it once a block.
  setBoard(battery: number, heat = 0, latch = 0, cluster = 0, cap = 0) {
    this.battery = battery
    this.heat = heat
    this.latch = latch
    this.cluster = cluster
    this.cap = cap
    this.slow = Math.pow(CAP_DECADES, cap)
    this.open = Math.max(1 - 0.45 * battery - 0.12 * heat, 0.2)
  }

  // load: |output| this sample. extra: mic patched onto the rail. clipHz: how
  // often bare metal finds a pad. clipClock: which pad it found — 0 is the
  // supply and 1 is the timing pin, and it is a trade rather than two knobs
  // because the clip is one piece of metal in one place. A supply pad is a low
  // impedance that draws current when you bridge it; the oscillator pin is the
  // highest impedance on the board and draws essentially none. So the further
  // the clip moves onto the clock, the less of a choke it is.
  tick(load: number, starve: number, extra: number, clipHz = 0, clipClock = 0) {
    // First, because the timebase reads the rail through its own decoupling and
    // every path out of this method leaves the voltage somewhere different — a
    // latch, a boot, an ordinary sample. A tick is a tick as far as the
    // oscillator is concerned.
    this.clockV = flushDenormal(
      this.clockV + this.decouple * (this.v - this.clockV),
    )

    this.clipFault.step()
    if (
      clipHz > 0 &&
      this.clipRemaining <= 0 &&
      this.clipFault.roll(clipHz / this.sr, this.cluster, this.rng)
    ) {
      const hold = this.parts.clipHold / PARTS.clipHold
      this.clipRemaining = Math.floor(
        (CLIP_HOLD_MIN + this.rng() * CLIP_HOLD_SPAN) * hold * this.sr,
      )
    }
    // A touch is a starve nobody turned the knob for, so it arrives on the same
    // wire as the knob and everything downstream treats it the same way.
    let choked = starve
    const touching = this.clipRemaining > 0
    if (touching) {
      this.clipRemaining--
      choked += this.parts.clipStarve * (1 - clipClock)
    }

    // The same contact, read by the timebase instead of the supply. Down is the
    // found cap charging through the clip; up is the clip leaving, which is not
    // a discharge but a disconnection.
    const pull = touching
      ? this.parts.dragPull / this.sr / this.slow
      : this.parts.dragDrop / this.sr
    this.drag = flushDenormal(
      this.drag + pull * ((touching ? 1 : 0) - this.drag),
    )

    this.stress = choked + this.battery
    // Everything the supply does, slowed by whatever capacitance is behind the
    // point in question. One factor for all of it, so the cap buys time without
    // moving any resting place: a rail that used to settle in 17 ms settles in a
    // second instead, at the voltage it always settled at.
    // Resistance in the lead is the half of flat cells that isn't the voltage:
    // it pays the rail back slower, and it puts a drop in front of every load.
    // That second half is a term of its own rather than a factor on the others,
    // because on a fresh unstarved board those others are zero — the toy is
    // asked for current and the rail does not move. A resistor is what makes
    // current cost voltage, so it has to be what carries the load here, and it
    // is the reason this knob whoops on every note where Batteries only ever
    // runs down. What it does not touch is where the rail rests: with nothing
    // drawing, no current flows, and a resistor carrying nothing drops nothing.
    const lead = this.parts.lead
    const slow = this.slow
    const charge =
      (60 * Math.max(1 - 0.35 * this.battery - 0.55 * lead, 0.06)) /
      this.sr /
      slow
    const drain =
      (choked * 900 + this.battery * 80 + lead * 220) / this.sr / slow
    const walk = this.thresholdWalk.step(0.15, this.sr, this.rng) * 0.025

    // A latched die is a short across the supply that no longer cares what the
    // output is doing. It doesn't crash the rail to nothing, though — the latch
    // needs some rail to hold itself in, so the two settle against each other
    // and sit there: a low, steady voltage the chip can neither run on nor
    // escape from, which is why the note screams rather than stopping.
    if (this.latchRemaining > 0) {
      this.v = flushDenormal(
        this.v +
          (LATCH_PULL / this.sr / slow) * (this.parts.latchHold - this.v),
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
    const shunt = (choked * STARVE_SHUNT) / this.sr / slow
    this.v +=
      charge * (this.open - this.v) -
      drain * (load + this.reported + extra) -
      shunt
    this.v = flushDenormal(Math.min(Math.max(this.v, 0), 1))

    if (this.bootRemaining > 0) {
      this.bootRemaining--
      return
    }
    const trip = Math.max(this.parts.watchdog, DEAD_V)
    if (this.stress > 0 && this.v < trip + 0.05 * this.heat + walk) {
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
    // On the stock board the recovery is the regulator's and it arrives where it
    // arrives. A capacitor cannot be filled by a decision, though: the more of
    // one sits behind the point, the less of that jump is physically available,
    // and past a certain size the reboot stops being an event the voltage can
    // see at all — the chip goes quiet, the cap charges at its own rate, and the
    // tune comes back in underneath the climb rather than on top of it. That is
    // the shape of the whole repeat: struck high, dragged down, cut off, struck
    // high again.
    const settle = Math.min(0.22 + this.rng() * 0.24, this.open)
    if (settle > this.v) this.v += (1 - this.cap) * (settle - this.v)
  }

  get booting() {
    return this.bootRemaining > 0
  }

  /** Jammed rather than rebooting: still powered, still sounding, stuck. */
  get latched() {
    return this.latchRemaining > 0
  }

  /**
   * How much of the found cap is currently sitting on the timing node, 0 to 1.
   * Whoever owns the clock decides what that is worth in octaves — the rail
   * only knows the contact is there and how far the charge has got.
   */
  get clipTravel() {
    return this.drag
  }

  // 1 at full rail; pitch sags toward half an octave down as it dies.
  get pitchFactor() {
    return 0.55 + 0.45 * this.v
  }

  // The same rail the pitch is reading, behind the timing node's decoupling —
  // not the cells, which is what this used to be. A chip with one oscillator in
  // it cannot dive in pitch and hold its tempo: both are that oscillator, and a
  // starve deep enough to drop the tune an octave halves the tempo on the way
  // past. Flat cells still show up here, because flat cells are a rail that
  // sits low; what has changed is that a sag which lasts now does too, and the
  // sequencer, the envelopes and the drum machine crawl with the note.
  get clockFactor() {
    return 0.35 + 0.65 * this.clockV
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
    this.clipRemaining = 0
    this.drag = 0
    this.clockV = 1
    this.reported = 0
    this.stress = 0
    this.thresholdWalk.reset()
    this.clipFault.reset()
  }
}
