import { expect, test } from 'vitest'
import { ALL_SLIDERS, sliderFor } from './controls'
import { TAP_GAP_MS, tapRun, tapValue } from './tap'

const at = (...ms: number[]) =>
  ms.reduce<number[]>((run, t) => tapRun(run, t), [])

test('one press is a press, two are a speed', () => {
  const bpm = sliderFor('drumBpm')
  expect(tapValue(bpm, at(0))).toBeUndefined()
  expect(tapValue(bpm, at(0, 500))).toBe(120)
})

// A late press in the middle is worth its share and no more, which is the whole
// reason the reading is the run's span over its gaps rather than the last gap.
test('the reading is the whole run rather than the last press', () => {
  const bpm = sliderFor('drumBpm')
  expect(tapValue(bpm, at(0, 500, 1000, 1500))).toBe(120)
  expect(tapValue(bpm, at(0, 480, 1020, 1500))).toBe(120)
})

test('a press after a long pause starts its own count', () => {
  const run = at(0, 500, 1000)
  expect(run).toHaveLength(3)
  const fresh = tapRun(run, 1000 + TAP_GAP_MS + 1)
  expect(fresh).toHaveLength(1)
  expect(tapValue(sliderFor('drumBpm'), fresh)).toBeUndefined()
})

// Enough presses that one clumsy one is outvoted, few enough that the row still
// follows a hand changing its mind about the speed.
test('the count keeps a run of the last few gaps', () => {
  expect(at(0, 100, 200, 300, 400, 500, 600, 700)).toEqual([
    300, 400, 500, 600, 700,
  ])
})

// Three units, one question: how long between one of these and the next.
test('a press is worth what the row it is on measures in', () => {
  expect(tapValue(sliderFor('delayMs'), at(0, 375))).toBe(375)
  expect(tapValue(sliderFor('modLfoHz'), at(0, 500))).toBe(2)
  expect(tapValue(sliderFor('echoMs'), at(0, 375))).toBe(375)
})

// Tapping slower than the knob goes parks it at the end of its travel rather
// than somewhere off it.
test('a speed off the end of the travel lands on the end', () => {
  const echo = sliderFor('echoMs')
  expect(tapValue(echo, at(0, 2400))).toBe(echo.max)
  expect(tapValue(sliderFor('drumBpm'), at(0, 10))).toBe(
    sliderFor('drumBpm').max,
  )
})

// The unit is what the press is worth, so a row measured in anything else has
// nothing to tap.
test('only rows in a unit a press can be worth carry one', () => {
  const tapped = ALL_SLIDERS.filter(s => s.tap)
  // The beat, the two delay times, and the bay's own oscillator: the speeds a
  // hand keeps rather than reads.
  expect([...tapped.map(s => s.key)].sort()).toEqual([
    'delayMs',
    'drumBpm',
    'echoMs',
    'modLfoHz',
  ])
  for (const s of tapped) expect(['bpm', 'Hz', 'ms']).toContain(s.unit)
})
