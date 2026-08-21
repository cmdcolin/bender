// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { buildMap } from './chain-map'
import { CHANNELS, GROUPS, groupKeys, touchedCount } from './controls'
import { resetGroup, rollGroup } from './presets'
import { YOURS } from './presets/yours'
import { OpenGroup } from './Section'
import './testDom'

// The desk. It is the one panel made of other panels' controls, so what is
// tested here is the thing that makes that safe: the faders are drawn, the
// count and the reset reach them, and the board still has exactly one widget
// per control — which the controls suite holds from the other side.

const mixBus = () => {
  const g = GROUPS.find(g => g.name === 'Mix bus')
  if (!g) throw new Error('no Mix bus')
  return g
}

const openDesk = () =>
  render(<OpenGroup group={mixBus()} onClose={() => {}} seconds={0} />)

test('every source fader is on the desk, under the name of its machine', () => {
  openDesk()
  for (const { name } of CHANNELS)
    expect(screen.getByRole('slider', { name })).toBeTruthy()
  // Not under the name it carries on its own panel: six rows reading *Level* is
  // a mixer nobody can use.
  expect(screen.queryAllByRole('slider', { name: 'Level' })).toHaveLength(0)
  expect(screen.getByRole('slider', { name: 'Bus drive' })).toBeTruthy()
})

test('a fader moved on the desk is the machine’s own control', () => {
  openDesk()
  fireEvent.change(screen.getByRole('slider', { name: 'FM chip' }), {
    target: { value: '800' },
  })
  expect(engine.controls.get().fmLevel).toBeGreaterThan(0.5)
})

// The count on the desk is the count of the balance, so the reset beside it is
// the way back to the balance the toy ships with.
test('the desk counts and resets the faders it borrows', () => {
  const board = { ...DEFAULT_CONTROLS, fmLevel: 0.8, mixDrive: 6 }
  expect(touchedCount(mixBus(), board)).toBe(2)
  expect(groupKeys(mixBus())).toContain('fmLevel')
  expect(groupKeys(mixBus())).toContain('mixDrive')
})

// Drawn is not the same as owned. Your monitoring level and the file you dropped
// are yours over any gesture, and the desk is the one panel that could have
// taken them away by counting every fader it shows as one of its own.
test('the desk shows the mic and the sampler without owning them', () => {
  const desk = mixBus()
  for (const key of ['micLevel', 'sampleLevel'] as const) {
    expect(
      CHANNELS.some(c => c.key === key),
      key,
    ).toBe(true)
    expect(groupKeys(desk), key).not.toContain(key)
  }
  for (const key of desk.borrows ?? []) expect(YOURS.has(key), key).toBe(false)

  const board = { ...DEFAULT_CONTROLS, micLevel: 0.6, sampleLevel: 0.4 }
  expect(touchedCount(desk, board)).toBe(0)
  const back = resetGroup(desk, board)
  expect(back.micLevel).toBe(0.6)
  expect(back.sampleLevel).toBe(0.4)
})

// Rolling the desk is rolling the balance. A roll that moved only the summing
// amp would leave the one thing the panel is about exactly where it stood.
test('rolling the desk rolls the balance', () => {
  let seed = 7
  const rand = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const rolled = rollGroup(mixBus(), DEFAULT_CONTROLS, rand)
  // A level is what decides whether a stage is there at all, so a roll leaves
  // every one of them somewhere you can hear.
  expect(rolled.fmLevel).toBeGreaterThan(0.3)
  expect(rolled.oscLevel).toBeGreaterThan(0.3)
  expect(rolled.chipLevel).not.toBe(DEFAULT_CONTROLS.chipLevel)
  // What is yours it still leaves alone: the mic is your monitoring and the
  // sampler is the file you dropped.
  expect(rolled.micLevel).toBe(DEFAULT_CONTROLS.micLevel)
  expect(rolled.sampleLevel).toBe(DEFAULT_CONTROLS.sampleLevel)
})

// The map is the panel's only index, and the mix bus was the one box on it that
// opened nothing.
test('the mix bus on the map is a door onto the desk', () => {
  const map = buildMap(DEFAULT_CONTROLS)
  const mix = map.nodes.find(n => n.id === 'mix')!
  expect(mix.door).toBe('Mix bus')
  expect(map.doors).toContain('Mix bus')
  expect(
    buildMap({ ...DEFAULT_CONTROLS, fmLevel: 0.8 }).nodes.find(
      n => n.id === 'mix',
    )!.count,
  ).toBe(1)
})

// Only the first of the mic's seven solder points is the mix. A shout browning
// the toy out lit the bus on the map while the bus's own meter read nothing.
test('a mic soldered off the bus does not light the bus', () => {
  const bus = (c: Partial<typeof DEFAULT_CONTROLS>) =>
    buildMap({
      ...DEFAULT_CONTROLS,
      chipLevel: 0,
      drumLevel: 0,
      ...c,
    }).nodes.find(n => n.id === 'mix')!.active
  expect(bus({ micLevel: 0.8 })).toBe(true)
  expect(bus({ micLevel: 0.8, micPatch: 1 })).toBe(false)
})
