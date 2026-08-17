import { expect, test } from 'vitest'
import type { Controls } from '../controls'
import { playKeys, SR } from './testRender'
import { ToyRail } from './toyRail'

test('a starving rail collapses the voices raggedly, not in lockstep', () => {
  const rail = new ToyRail(SR)
  rail.v = 0.45
  const amps = [0.86, 1.21].map(t => rail.ampFactorAt(t))
  const pitches = [0.86, 1.21].map(t => rail.pitchFactorAt(t))
  expect(amps[0]).toBeGreaterThan(amps[1]! + 0.05)
  expect(pitches[0]).toBeGreaterThan(pitches[1]! + 0.02)

  rail.v = 1
  // Part tolerance only shows up as the supply sags; a full rail tunes true.
  expect(rail.pitchFactorAt(0.86)).toBeCloseTo(1)
  expect(rail.pitchFactorAt(1.21)).toBeCloseTo(1)
})

test('flat cells hold the rail under full and take the clock down with it', () => {
  const rail = new ToyRail(SR)
  rail.setBoard(0.8)
  for (let i = 0; i < SR; i++) rail.tick(0, 0, 0)
  expect(rail.v).toBeCloseTo(1 - 0.45 * 0.8, 2)
  expect(rail.pitchFactor).toBeLessThan(0.9)
  expect(rail.clockFactor).toBeLessThan(0.9)

  // Nothing flat, nothing drawing: the rail sits at full and keeps time.
  const fresh = new ToyRail(SR)
  fresh.setBoard(0)
  for (let i = 0; i < SR; i++) fresh.tick(0.2, 0, 0)
  expect(fresh.v).toBe(1)
  expect(fresh.clockFactor).toBe(1)
  expect(fresh.dead).toBe(false)
})

test('a flat battery sags under load, and reboots the chip on its own', () => {
  const quiet = new ToyRail(SR)
  const loud = new ToyRail(SR)
  for (const rail of [quiet, loud]) rail.setBoard(1)
  for (let i = 0; i < SR; i++) {
    quiet.tick(0.02, 0, 0)
    loud.tick(0.15, 0, 0)
  }
  expect(loud.v).toBeLessThan(quiet.v - 0.1)

  // No starve anywhere — the cells alone take it past the watchdog threshold.
  const hammered = new ToyRail(SR)
  hammered.setBoard(1)
  for (let i = 0; i < SR; i++) hammered.tick(0.4, 0, 0)
  expect(hammered.rebootCount).toBeGreaterThan(0)
})

// How long a starved rail takes to reach a given voltage, and where it ends up.
const collapse = (cap: number, to = 0.4) => {
  const rail = new ToyRail(SR)
  rail.setBoard(0, 0, 0, 0, cap)
  let reached = -1
  for (let i = 0; i < 4 * SR; i++) {
    rail.tick(0.12, 0.35, 0)
    if (reached < 0 && rail.v <= to) reached = i / SR
  }
  return { reached, settled: rail.v }
}

test('the cap decides how long the rail takes, not where it lands', () => {
  const stock = collapse(0)
  const bent = collapse(0.6)

  // The bend is entirely in the travel: a stock rail is already there before
  // the ear has a chance to hear it leave.
  expect(stock.reached).toBeLessThan(0.05)
  expect(bent.reached).toBeGreaterThan(10 * stock.reached)

  // ...and both arrive at the same place, because a capacitor stores charge
  // rather than supplying it. A cap that moved the resting voltage would be a
  // second starve knob wearing a disguise.
  expect(bent.settled).toBeCloseTo(stock.settled, 2)
})

test('a bigger cap is a longer swoop, monotonically', () => {
  const times = [0, 0.25, 0.5, 0.75, 1].map(c => collapse(c).reached)
  for (let i = 1; i < times.length; i++) {
    expect(times[i]!).toBeGreaterThan(times[i - 1]!)
  }
  // End to end it is worth two orders of magnitude, so the knob reaches from a
  // click to a swoop you can sing along with.
  expect(times.at(-1)!).toBeGreaterThan(50 * times[0]!)
})

test('the clip chokes the supply rather than shorting it', () => {
  // A choke leaves through the cap, so the rail travels down instead of
  // arriving down. Sampled while the contact is still resting on the pad.
  const rail = new ToyRail(SR, 4)
  rail.setBoard(0, 0, 0, 0, 0.6)
  const seen: number[] = []
  for (let i = 0; i < 2 * SR; i++) {
    rail.tick(0.1, 0, 0, 8)
    if (i % 480 === 0) seen.push(rail.v)
  }
  const low = Math.min(...seen)
  expect(low).toBeLessThan(0.6)
  // Nothing in there snaps to the floor: every step between samples is small,
  // which is what tells a dive from a dropout.
  const jump = Math.max(...seen.slice(1).map((v, i) => Math.abs(v - seen[i]!)))
  expect(jump).toBeLessThan(0.4)
})

// Everything the chip does hangs off the rail, so a rail that travels has to
// come out of the speaker as a pitch that travels. One key held down and the
// ROM stopped, because a melody moving under the measurement would drown the
// thing being measured; crossings per 40 ms window is then the note alone.
const pitchWalk = (overrides: Partial<Controls>) => {
  const x = playKeys(
    { drumLevel: 0, chipLevel: 0.85, ...overrides },
    chip => chip.noteOn(12),
    1.4,
  )
  const win = Math.floor(0.04 * SR)
  const out: number[] = []
  for (let at = 0; at + win < x.length; at += win) {
    let cycles = 0
    for (let i = at + 1; i < at + win; i++) {
      if (x[i - 1]! <= 0 && x[i]! > 0) cycles++
    }
    out.push(cycles)
  }
  return out
}

test('the bend comes out of the speaker as a pitch that travels', () => {
  // Same starve either side. Without the cap the rail is at the bottom before
  // the first window has closed, so the whole render is already the steady
  // state; with it, the first half second is the dive.
  const stock = pitchWalk({ chipStarve: 0.55 })
  const bent = pitchWalk({ chipStarve: 0.55, chipCap: 0.8 })
  const settled = (v: number[]) => v.slice(-8).reduce((a, b) => a + b, 0) / 8

  // It leaves from higher up, travels down while you listen, and arrives where
  // the stock board already was — which is the whole claim: the cap moves the
  // journey, not the destination.
  expect(bent[0]!).toBeGreaterThan(stock[0]! * 1.25)
  expect(bent[0]!).toBeGreaterThan(settled(bent) * 1.25)
  expect(settled(bent) / settled(stock)).toBeCloseTo(1, 1)

  // Monotone down, not a wobble that happens to end lower.
  expect(bent[0]!).toBeGreaterThan(bent[4]!)
  expect(bent[4]!).toBeGreaterThan(settled(bent) - 0.5)

  // The stock board has nowhere to travel from: it starts where it ends.
  expect(stock[0]! / settled(stock)).toBeCloseTo(1, 1)
})

test('the clock bend reaches octaves the supply cannot', () => {
  const span = (o: Partial<Controls>) => {
    const v = pitchWalk(o).filter(x => x > 1)
    return Math.log2(Math.max(...v) / Math.min(...v))
  }
  // Starving the rail is worth two thirds of an octave and then the chip stops
  // running, because a CMOS oscillator barely cares what its supply is doing.
  // Hanging a capacitor on that oscillator divides it instead, and division has
  // no such ceiling — which is why the dive that needs octaves has to come off
  // the timing pin and cannot come off the rail.
  expect(span({ chipStarve: 0.55, chipCap: 0.6 })).toBeLessThan(1)
  expect(
    span({ chipCap: 0.6, chipClipHz: 3, chipClipClock: 0.5 }),
  ).toBeGreaterThan(1.5)
})

test('the clip leaves the clock slowly and lets go of it at once', () => {
  const rail = new ToyRail(SR, 7)
  const seen: number[] = []
  for (let i = 0; i < 3 * SR; i++) {
    if (i % 128 === 0) rail.setBoard(0, 0, 0, 0, 0.55)
    rail.tick(0.1, 0.25, 0, 3, 0.2)
    if (i % 24 === 0) seen.push(rail.clipTravel)
  }
  let rising = 0
  let falling = 0
  for (let i = 1; i < seen.length; i++) {
    const d = seen[i]! - seen[i - 1]!
    if (d > 1e-6) rising++
    else if (d < -1e-6) falling++
  }
  // Charging the found cap through the contact takes time; lifting the clip
  // takes the cap out of circuit altogether, which takes none. Rising travel is
  // the clock on its way down, so the dive is what there is time to hear — and
  // symmetric, the same bend would only warble.
  expect(rising).toBeGreaterThan(falling * 2)
})

test('a clip on the clock is not a clip on the supply', () => {
  const onClock = new ToyRail(SR, 21)
  const onSupply = new ToyRail(SR, 21)
  let clockLow = 1
  let supplyLow = 1
  for (let i = 0; i < 4 * SR; i++) {
    if (i % 128 === 0) {
      onClock.setBoard(0, 0, 0, 0, 0.5)
      onSupply.setBoard(0, 0, 0, 0, 0.5)
    }
    onClock.tick(0.1, 0, 0, 5, 1)
    onSupply.tick(0.1, 0, 0, 5, 0)
    clockLow = Math.min(clockLow, onClock.v)
    supplyLow = Math.min(supplyLow, onSupply.v)
  }
  // One piece of metal in one place. A supply pad is a low impedance that draws
  // when you bridge it; the oscillator pin draws nothing worth the name, so the
  // rail never notices the clip is on the board at all.
  expect(supplyLow).toBeLessThan(0.6)
  expect(clockLow).toBeGreaterThan(0.95)
})

test('a clipped board browns out without the starve knob being touched', () => {
  const rail = new ToyRail(SR, 11)
  rail.setBoard(0, 0, 0, 0, 0.35)
  for (let i = 0; i < 6 * SR; i++) rail.tick(0.14, 0, 0, 6)
  expect(rail.rebootCount).toBeGreaterThan(0)

  // Metal off the board and nothing else changed: the toy just plays.
  const clean = new ToyRail(SR, 11)
  clean.setBoard(0, 0, 0, 0, 0.35)
  for (let i = 0; i < 6 * SR; i++) clean.tick(0.14, 0, 0, 0)
  expect(clean.rebootCount).toBe(0)
})
