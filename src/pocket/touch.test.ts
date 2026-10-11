import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { BEND_SLOT_KEYS, bendAt } from '../ui/controls'
import { heard } from '../ui/presets/scenarios'
import { TOUCH_MODES, tiltPoint, touchMode, touchPush } from './touch'

const LAST_SLOT = BEND_SLOT_KEYS.at(-1)!
const mode = (name: string) => touchMode(name)
const dry: Controls = { ...DEFAULT_CONTROLS }
for (const k of BEND_SLOT_KEYS) dry[k] = 0

test('dub sweeps the filter across and feeds the delay past 1 at the top', () => {
  const dub = mode('dub')
  expect(touchPush(dub, 0, 0.5, DEFAULT_CONTROLS).filtHz).toBeLessThan(200)
  expect(touchPush(dub, 1, 0.5, DEFAULT_CONTROLS).filtHz).toBeGreaterThan(5000)
  expect(touchPush(dub, 0.5, 0, DEFAULT_CONTROLS).dlyFb).toBeLessThan(1)
  expect(touchPush(dub, 0.5, 1, DEFAULT_CONTROLS).dlyFb).toBeGreaterThan(1)
})

test('starve drags the clock across and sags the supply going up', () => {
  const starve = mode('starve')
  expect(touchPush(starve, 0, 0, DEFAULT_CONTROLS).chipClockX).toBeLessThan(1)
  expect(touchPush(starve, 1, 0, DEFAULT_CONTROLS).chipClockX).toBeGreaterThan(
    1,
  )
  expect(
    touchPush(starve, 0.5, 1, DEFAULT_CONTROLS).chipStarve,
  ).toBeGreaterThan(0.9)
})

test('crush takes bits away going up and lowers the rate going left', () => {
  const crush = mode('crush')
  expect(touchPush(crush, 0.5, 1, DEFAULT_CONTROLS).bits).toBe(2)
  expect(touchPush(crush, 0.5, 0, DEFAULT_CONTROLS).bits).toBe(12)
  expect(touchPush(crush, 0, 0.5, DEFAULT_CONTROLS).srHz).toBeLessThan(400)
})

test('glitch stutters more often going up', () => {
  const glitch = mode('glitch')
  const low = touchPush(glitch, 0.5, 0, DEFAULT_CONTROLS)
  const high = touchPush(glitch, 0.5, 1, DEFAULT_CONTROLS)
  expect(high.glitchProb!).toBeGreaterThan(low.glitchProb!)
  expect(high.glitchRepeat!).toBeGreaterThan(low.glitchRepeat!)
})

test('every mode is heard on a board with an empty chain', () => {
  for (const m of TOUCH_MODES) {
    const push = touchPush(m, 0.7, 0.7, dry)
    const live = { ...dry, ...push }
    const moved = Object.keys(push).filter(
      k => !k.startsWith('bendSlot') && !k.endsWith('Mix') && k !== 'chipLevel',
    ) as (keyof Controls)[]
    for (const k of moved) expect(heard(live, k), `${m.name} ${k}`).toBe(true)
  }
})

test('a bend still in the chain keeps its slot', () => {
  for (const m of TOUCH_MODES)
    expect(touchPush(m, 0.5, 0.5, DEFAULT_CONTROLS)).not.toHaveProperty(
      LAST_SLOT,
    )
  expect(
    bendAt(touchPush(mode('crush'), 0.5, 0.5, dry)[LAST_SLOT]!)?.group,
  ).toBe('Crusher')
})

test('an unknown mode name falls back to dub', () => {
  expect(touchMode('nope').name).toBe('dub')
  expect(touchMode(null).name).toBe('dub')
})

test('tilt reads from where the phone sat when it came on', () => {
  const rest = { beta: 60, gamma: 0 }
  expect(tiltPoint(rest, rest)).toEqual({ x: 0.5, y: 0.5 })
  expect(tiltPoint({ beta: 60, gamma: 25 }, rest).x).toBe(1)
  expect(tiltPoint({ beta: 35, gamma: 0 }, rest).y).toBe(1)
  expect(tiltPoint({ beta: 120, gamma: -90 }, rest)).toEqual({ x: 0, y: 0 })
})
