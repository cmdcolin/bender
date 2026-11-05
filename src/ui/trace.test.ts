import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, isControlKey } from '../controls.ts'
import { createTrace, laneKeys, TRACE_LANES, TRACE_MS } from './trace.ts'

import type { ActivityLine } from './activity.ts'

const line = (id: number, keys: string[]): ActivityLine => ({
  id,
  at: 0,
  text: '',
  said: false,
  bends: keys.filter(isControlKey).map(key => ({ key, value: '' })),
})

test('lanes follow the newest bends first, once each, up to the cap', () => {
  const lines = [
    line(3, ['chipStarve']),
    line(2, ['dlyFb', 'chipStarve']),
    line(1, ['tapeMix']),
  ]
  expect(laneKeys(lines)).toEqual(['chipStarve', 'dlyFb', 'tapeMix'])
  const many = Object.keys(DEFAULT_CONTROLS)
    .slice(0, 20)
    .map((k, i) => line(i, [k]))
  expect(laneKeys(many).length).toBeLessThanOrEqual(TRACE_LANES)
})

test('a lane starts with the value before the set and steps to the new one', () => {
  const trace = createTrace(DEFAULT_CONTROLS)
  trace.controls({ ...DEFAULT_CONTROLS, chipStarve: 1 }, 1000)
  trace.follow(['chipStarve'], 1000)
  const [lane] = trace.lanes()
  expect(lane?.points.map(p => p.at)).toEqual([1000 - TRACE_MS, 1000])
  expect(lane?.points.at(-1)?.pos).toBe(1)
})

test('a glide adds a point a frame, and old points fall off but one', () => {
  const trace = createTrace(DEFAULT_CONTROLS)
  trace.follow(['chipStarve'], 0)
  for (let f = 1; f <= 10; f++)
    trace.controls({ ...DEFAULT_CONTROLS, chipStarve: f / 10 }, f * 16)
  expect(trace.lanes()[0]?.points).toHaveLength(11)
  trace.prune(TRACE_MS + 1000)
  expect(trace.lanes()[0]?.points).toHaveLength(1)
})

test('the meter adds hits, bars on the downbeat, and pooled levels', () => {
  const trace = createTrace(DEFAULT_CONTROLS)
  trace.meter({ hits: 1, peak: 0.2, tick: 15 }, 0)
  trace.meter({ hits: 0, peak: 0.5, tick: 16 }, 16)
  expect(trace.hits()).toEqual([{ at: 0, voices: 1 }])
  expect(trace.bars()).toEqual([{ at: 16 }])
  expect(trace.levels()).toEqual([{ at: 0, peak: 0.5 }])
})
