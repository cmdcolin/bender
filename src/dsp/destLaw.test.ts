import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, isControlKey, type Controls } from '../controls.ts'
import { SLIDER_BY_KEY } from '../ui/controls/index.ts'
import {
  DEST_LAW,
  LIVE_DESTS,
  WIRE_IS_KNOB,
  wireLaw,
  type Law,
} from './destLaw.ts'
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

const HOPS = LIVE_DESTS.flatMap(dest => {
  const law: Law = DEST_LAW[dest]
  const knob = law.knob ?? dest
  return law.law === 'hop' && isControlKey(knob)
    ? [{ dest, knob, choices: law.choices }]
    : []
})

test('every destination measured as its knob is a plain add in the table', () => {
  const off = [...WIRE_IS_KNOB].filter(dest => {
    const law: Law = DEST_LAW[dest]
    return !isControlKey(dest) || law.law !== 'add' || law.scale !== undefined
  })
  expect(off).toEqual([])
})

test('each step law counts the settings its control has', () => {
  const off = HOPS.filter(({ knob, choices }) => {
    const def = SLIDER_BY_KEY.get(knob)
    return !def || def.max - def.min + 1 !== choices
  })
  expect(off).toEqual([])
})

test('describe can explain a wire on every control a destination moves', () => {
  const silent = LIVE_DESTS.map(dest => {
    const law: Law = DEST_LAW[dest]
    return law.knob ?? dest
  }).filter(knob => isControlKey(knob) && !wireLaw(knob))
  expect(silent).toEqual([])
})

test('describe words each law the way it plays', () => {
  expect(wireLaw('drumLevel')).toMatch(/scales the machine’s output/)
  expect(wireLaw('drumWander')).toMatch(/as the knob turned by d would/)
  expect(wireLaw('filtHz')).toMatch(/2\^\(4·d\), so depth 0\.25 is an octave/)
  expect(wireLaw('chipDataLine')).toMatch(/round its 7 settings/)
  expect(wireLaw('srHz')).toMatch(/2\^\(4·d\)/)
  expect(wireLaw('drumTrigBias')).toMatch(/fires the current step once/)
  expect(wireLaw('chipTone')).toBeUndefined()
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

const SELECTED: Partial<Controls> = Object.fromEntries(
  HOPS.filter(h => /(Line|Fault)$/.test(h.knob)).map(h => [h.knob, 1]),
)
const HOP_BOARD: Partial<Controls> = { ...BOARD, ...SELECTED }

let hopStock: Float32Array | undefined
const hopStockTake = () =>
  (hopStock ??= renderBender(HOP_BOARD, SECONDS, playing))

for (const { dest, knob, choices } of HOPS)
  test.skipIf(!process.env.CONTRACT)(
    `a wire of all but one step on ${dest} plays as that many settings on ${knob}`,
    ctx => {
      const at = HOP_BOARD[knob] ?? DEFAULT_CONTROLS[knob]
      const next = renderBender(
        { ...HOP_BOARD, [knob]: (at + choices - 1) % choices },
        SECONDS,
        playing,
      )
      if (differing(next, hopStockTake()) === 0) ctx.skip()
      const wire = renderBender(
        {
          ...HOP_BOARD,
          bodyX: 1,
          mod0Src: SRC.bodyX,
          mod0Dest: DEST[dest],
          mod0Depth: (choices - 1) / choices,
        },
        SECONDS,
        playing,
      )
      expect(differing(wire, next)).toBe(0)
    },
    60000,
  )
