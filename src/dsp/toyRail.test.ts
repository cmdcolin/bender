import { expect, test } from 'vitest'
import { SR } from './testRender'
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
  rail.setBattery(0.8)
  for (let i = 0; i < SR; i++) rail.tick(0, 0, 0)
  expect(rail.v).toBeCloseTo(1 - 0.45 * 0.8, 2)
  expect(rail.pitchFactor).toBeLessThan(0.9)
  expect(rail.clockFactor).toBeLessThan(0.9)

  // Nothing flat, nothing drawing: the rail sits at full and keeps time.
  const fresh = new ToyRail(SR)
  fresh.setBattery(0)
  for (let i = 0; i < SR; i++) fresh.tick(0.2, 0, 0)
  expect(fresh.v).toBe(1)
  expect(fresh.clockFactor).toBe(1)
  expect(fresh.dead).toBe(false)
})

test('a flat battery sags under load, and reboots the chip on its own', () => {
  const quiet = new ToyRail(SR)
  const loud = new ToyRail(SR)
  for (const rail of [quiet, loud]) rail.setBattery(1)
  for (let i = 0; i < SR; i++) {
    quiet.tick(0.02, 0, 0)
    loud.tick(0.15, 0, 0)
  }
  expect(loud.v).toBeLessThan(quiet.v - 0.1)

  // No starve anywhere — the cells alone take it past the watchdog threshold.
  const hammered = new ToyRail(SR)
  hammered.setBattery(1)
  for (let i = 0; i < SR; i++) hammered.tick(0.4, 0, 0)
  expect(hammered.rebootCount).toBeGreaterThan(0)
})
