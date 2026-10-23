import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { packParams } from '../engine/params.ts'
import { LANE_MAX } from '../lanes.ts'
import { packControls, unpackControls } from '../ui/packed.ts'
import { coherePatch, wireFault } from '../ui/presets/patch.ts'
import { ModBus, type ModSources } from './modbus.ts'
import { BLOCK } from './stage.ts'
import { SR } from './testRender.ts'
import { TriggerBus } from './trigbus.ts'

const LANE_A = 12

function bay(overrides: Partial<Controls>) {
  const bus = new ModBus(SR)
  const trig = new TriggerBus()
  const zero = new Float32Array(BLOCK)
  const src: ModSources = {
    mic: zero,
    droop: zero,
    env: zero,
    fb: zero,
    step: zero,
    trig,
    heat: 0,
  }
  const p = packParams({
    ...DEFAULT_CONTROLS,
    mod0Src: LANE_A,
    mod0Dest: 0,
    mod0Depth: 1,
    ...overrides,
  })
  // One block with the kit's counter landing on `tick`, or no strobe at all.
  return (tick?: number) => {
    if (tick !== undefined) trig.stepClocked(0, tick)
    trig.swap(BLOCK)
    bus.build(BLOCK, p, src)
    return bus.read(0)![BLOCK - 1]!
  }
}

test('a lane sends the value written on the step the kit stands on', () => {
  const block = bay({ modLaneA0: 6, modLaneA1: -12, modLaneA2: 0 })
  expect(block(0)).toBeCloseTo(6 / LANE_MAX)
  expect(block(1)).toBeCloseTo(-1)
  expect(block(2)).toBe(0)
})

test('a lane holds its step between strobes and while the kit is stopped', () => {
  const block = bay({ modLaneA3: 9 })
  block(3)
  expect(block()).toBeCloseTo(9 / LANE_MAX)
  expect(block()).toBeCloseTo(9 / LANE_MAX)
})

test('a short lane comes round on its own length', () => {
  const block = bay({ modLaneALen: 3, modLaneA0: 4, modLaneA1: 8 })
  expect(block(3)).toBeCloseTo(4 / LANE_MAX)
  expect(block(7)).toBeCloseTo(8 / LANE_MAX)
})

test('a wire off a blank lane reads as dead, and the bay’s repair writes it', () => {
  const board: Controls = {
    ...DEFAULT_CONTROLS,
    drumLevel: 1,
    filtMix: 1,
    mod0Src: LANE_A,
    mod0Dest: 0,
    mod0Depth: 1,
  }
  expect(wireFault(board, 0)).toBe('is off a lane with nothing written')
  let seed = 1
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const fixed = coherePatch(board, rand)
  const lane = Array.from(
    { length: 16 },
    (_, i) => fixed[`modLaneA${i}` as keyof Controls],
  )
  expect(lane.some(v => v !== 0)).toBe(true)
  expect(wireFault(fixed, 0)).not.toBe('is off a lane with nothing written')
})

test('a link carries a lane’s values, signs and length', () => {
  const none = () => false
  const board: Controls = {
    ...DEFAULT_CONTROLS,
    modLaneA0: -12,
    modLaneA5: 12,
    modLaneB15: -3,
    modLaneBLen: 5,
  }
  expect({
    ...DEFAULT_CONTROLS,
    ...unpackControls(packControls(board, none), none),
  }).toEqual(board)
})
