import { expect, test } from 'vitest'

import { boot, hanging, laid, PLUG } from './cablePaths.ts'

test('a laid cable starts and ends on its bends', () => {
  const { d } = laid([
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 100 },
    { x: 0, y: 100 },
  ])
  expect(d.startsWith('M0 0')).toBe(true)
  expect(d.endsWith('L0 100')).toBe(true)
})

test('the arrow rides the last upright run, pointing the way it runs', () => {
  const down = laid([
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 100 },
    { x: 0, y: 100 },
  ]).arrow
  expect(down.x).toBe(40)
  expect(down.y).toBeGreaterThan(50)
  expect(down.y).toBeLessThan(100)
  expect(down.angle).toBe(90)

  const up = laid([
    { x: 0, y: 100 },
    { x: 40, y: 100 },
    { x: 40, y: 0 },
    { x: 0, y: 0 },
  ]).arrow
  expect(up.angle).toBe(-90)
})

test('a cable that ends on an upright run points into the jack', () => {
  const { arrow } = laid([
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: -50 },
    { x: 120, y: -50 },
    { x: 120, y: 30 },
  ])
  expect(arrow.x).toBe(120)
  expect(arrow.y).toBeGreaterThan(-10)
  expect(arrow.y).toBeLessThan(30)
  expect(arrow.angle).toBe(90)
})

test('a plug boot stands out of the jack the way it faces', () => {
  const at = { x: 10, y: 10 }
  expect(boot({ at, facing: 'right' })).toEqual({ x: 10 + PLUG, y: 10 })
  expect(boot({ at, facing: 'up' })).toEqual({ x: 10, y: 10 - PLUG })
})

test('a held cable runs boot to boot', () => {
  const { d } = hanging(
    { at: { x: 0, y: 0 }, facing: 'right' },
    { at: { x: 100, y: 0 }, facing: 'up' },
  )
  expect(d.startsWith(`M${PLUG} 0`)).toBe(true)
  expect(d.endsWith(`100 ${-PLUG}`)).toBe(true)
})
