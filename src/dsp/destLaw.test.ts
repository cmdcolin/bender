import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, isControlKey, type Controls } from '../controls.ts'
import { WIRE_IS_KNOB, wireLaw } from './destLaw.ts'
import { DEST, SRC } from './modbus.ts'
import { renderBender } from './testRender.ts'

import type { BuiltChain } from './build.ts'

const BOARD: Partial<Controls> = {
  chipLevel: 0.8,
  drumLevel: 0.8,
  fmLevel: 0.6,
  pcmLevel: 0.6,
  monoLevel: 0.6,
  drumBpm: 240,
}
const SECONDS = 1.5
const PUSH = 0.5

const playing = (b: BuiltChain) => {
  b.transport.drums = true
  b.transport.tune = true
}

let stock: Float32Array | undefined
const stockTake = () => (stock ??= renderBender(BOARD, SECONDS, playing))

const differing = (a: Float32Array, b: Float32Array) =>
  a.reduce((n, v, i) => (v === b[i] ? n : n + 1), 0)

test('every destination the table calls a knob is a control', () => {
  expect([...WIRE_IS_KNOB].filter(k => !isControlKey(k))).toEqual([])
})

test('the law describe gives names a wire on a level as gain', () => {
  expect(wireLaw('drumLevel')).toMatch(/scales the machine’s output/)
  expect(wireLaw('drumWander')).toMatch(/as the knob turned by d would/)
  expect(wireLaw('drumPattern')).toBeUndefined()
})

test.skipIf(!process.env.CONTRACT).each([...WIRE_IS_KNOB])(
  'a wire alone on %s plays exactly as turning its knob',
  key => {
    const knob = renderBender(
      {
        ...BOARD,
        [key]: (isControlKey(key) ? DEFAULT_CONTROLS[key] : 0) + PUSH,
      },
      SECONDS,
      playing,
    )
    const wire = renderBender(
      {
        ...BOARD,
        bodyX: 1,
        mod0Src: SRC.bodyX,
        mod0Dest: DEST[key],
        mod0Depth: PUSH,
      },
      SECONDS,
      playing,
    )
    expect(differing(knob, stockTake())).toBeGreaterThan(0)
    expect(differing(wire, knob)).toBe(0)
  },
  60000,
)
