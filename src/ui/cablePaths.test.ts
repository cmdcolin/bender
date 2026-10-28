import { expect, test } from 'vitest'

import { boot, hanging, laid, layRuns, PLUG } from './cablePaths.ts'

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

const edge = (x: number, y: number) => ({
  at: { x, y },
  facing: 'right' as const,
})
const plate = (x: number, y: number) => ({
  at: { x, y },
  facing: 'up' as const,
})

test('an edge-to-edge run turns once down its lane', () => {
  const route = layRuns(
    [{ id: 'a', from: edge(100, 10), to: edge(100, 200), inner: true }],
    100,
  ).get('a')!
  expect(route.bends).toHaveLength(4)
  expect(route.bends[1]!.x).toBe(route.bends[2]!.x)
  expect(route.bends[1]!.x).toBeGreaterThan(100 + PLUG)
})

test('inner runs take the lanes nearest the cases', () => {
  const routes = layRuns(
    [
      { id: 'out', from: plate(300, 50), to: edge(100, 60) },
      { id: 'in', from: edge(100, 10), to: edge(100, 200), inner: true },
    ],
    100,
  )
  expect(routes.get('in')!.bends[1]!.x).toBeLessThan(
    routes.get('out')!.bends[2]!.x,
  )
})

test('runs on one plate cross above it at heights of their own', () => {
  const routes = layRuns(
    [
      { id: 'a', from: plate(300, 50), to: edge(100, 60) },
      { id: 'b', from: plate(320, 50), to: edge(100, 160) },
      { id: 'c', from: edge(100, 10), to: plate(340, 50) },
    ],
    100,
  )
  const bands = ['a', 'b'].map(id => routes.get(id)!.bends[1]!.y)
  bands.push(routes.get('c')!.bends.at(-2)!.y)
  expect(new Set(bands).size).toBe(3)
  for (const y of bands) expect(y).toBeLessThan(50 - PLUG)
})

test('runs out of one jack share a lane and leave it at their own inputs', () => {
  const routes = layRuns(
    [
      { id: 'a', from: edge(100, 10), to: edge(100, 200), inner: true },
      { id: 'b', from: edge(100, 10), to: edge(100, 400), inner: true },
      { id: 'c', from: plate(300, 50), to: edge(100, 300) },
    ],
    100,
  )
  const lane = (id: string) => routes.get(id)!.bends[1]!.x
  expect(lane('a')).toBe(lane('b'))
  expect(lane('c')).toBeGreaterThan(lane('a'))
  expect(routes.get('a')!.bends.at(-2)!.y).toBe(200)
  expect(routes.get('b')!.bends.at(-2)!.y).toBe(400)
})

test('a plate-to-plate run crosses above both plates', () => {
  const route = layRuns(
    [{ id: 'a', from: plate(40, 20), to: plate(400, 300) }],
    100,
  ).get('a')!
  expect(route.bends[1]!.y).toBeLessThan(20 - PLUG)
  expect(route.bends.at(-2)!.y).toBeLessThan(300 - PLUG)
  expect(route.bends.at(-1)).toEqual({ x: 400, y: 300 - PLUG })
})
