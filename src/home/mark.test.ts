import { expect, test } from 'vitest'

import { markBars } from './mark'

test('a mark is the same every time and different for a different board', () => {
  expect(markBars('p=abc')).toEqual(markBars('p=abc'))
  expect(markBars('p=abd')).not.toEqual(markBars('p=abc'))
})

test('every bar is visible and fits the box', () => {
  for (const v of markBars('p=abc')) {
    expect(v).toBeGreaterThanOrEqual(0.18)
    expect(v).toBeLessThanOrEqual(1)
  }
})
