import { expect, test } from 'vitest'

import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  readInOrder,
  sameControls,
  type ControlKey,
  type Controls,
} from './controls.ts'
import { Glide } from './engine/glide.ts'
import { N_PARAMS, PARAM_DEFS, packParams, paramMask } from './engine/params.ts'
import { packControls } from './ui/packed.ts'

const moved = (): Controls => ({
  ...DEFAULT_CONTROLS,
  chipLevel: 0.4,
  drumBpm: 140,
  tuneStep3: 5,
  ringFill: 1,
})

const reversed = (): Controls => {
  const c = moved()
  for (const k of CONTROL_KEYS.toReversed()) {
    const v = c[k]
    Reflect.deleteProperty(c, k)
    c[k] = v
  }
  return c
}

const without = (key: ControlKey): Controls => {
  const c = moved()
  Reflect.deleteProperty(c, key)
  return c
}

const withExtra = (): Controls => {
  const c = moved()
  Reflect.set(c, 'retiredControl', 3)
  return c
}

const inKeyOrder = (c: Controls): Controls => {
  const copy = { ...DEFAULT_CONTROLS }
  for (const k of CONTROL_KEYS) Reflect.set(copy, k, c[k])
  return copy
}

const boards = {
  'in order': moved,
  reversed,
  'missing a middle key': () => without('chipTune'),
  'missing the last key': () => without('ringFill'),
  'with an extra key': withExtra,
}

const oldPackParams = (values: Controls) =>
  Float32Array.from(PARAM_DEFS, ([k]) => values[k])

const oldParamMask = (patch: Partial<Controls>) =>
  Uint8Array.from(PARAM_DEFS, ([k]) => (patch[k] === undefined ? 0 : 1))

const oldSameControls = (a: Controls, b: Controls) =>
  CONTROL_KEYS.every(k => a[k] === b[k])

test('reversed boards really are out of order', () => {
  expect(Object.keys(reversed())).toEqual(CONTROL_KEYS.toReversed())
})

test('params follow the controls order, so packing a board reads it in one walk', () => {
  expect(PARAM_DEFS.map(([k]) => k)).toEqual(CONTROL_KEYS)
})

for (const [name, board] of Object.entries(boards)) {
  test(`reading a board ${name} gives every value in key order`, () => {
    const c = board()
    expect(readInOrder(c, CONTROL_KEYS, [])).toEqual(
      CONTROL_KEYS.map(k => c[k]),
    )
  })

  test(`packing a board ${name} matches reading it key by key`, () => {
    const c = board()
    expect(packParams(c, new Float32Array(N_PARAMS))).toEqual(oldPackParams(c))
  })

  test(`a board ${name} compares like it does key by key`, () => {
    const c = board()
    for (const other of Object.values(boards).map(b => b())) {
      expect(sameControls(c, other)).toBe(oldSameControls(c, other))
      expect(sameControls(other, c)).toBe(oldSameControls(other, c))
    }
    expect(sameControls(c, board())).toBe(true)
    expect(sameControls(c, { ...c, outGain: 0.5 })).toBe(false)
  })

  test(`a patch shaped like a board ${name} masks like it does key by key`, () => {
    const c = board()
    expect(paramMask(c)).toEqual(oldParamMask(c))
  })

  test(`a board ${name} packs into the link it would in order`, () => {
    const c = board()
    expect(packControls(c, () => false)).toBe(
      packControls(inKeyOrder(c), () => false),
    )
  })

  test(`a glide from a board ${name} moves what it would in order`, () => {
    const from = board()
    const to = { ...moved(), drumBpm: 90, chipTune: 2, ringFill: 0 }
    for (const t of [0.25, 0.75, 1])
      expect(new Glide(from, to).at(DEFAULT_CONTROLS, t)).toEqual(
        new Glide(inKeyOrder(from), to).at(DEFAULT_CONTROLS, t),
      )
  })
}

test('a sparse patch masks only what it sets', () => {
  const patch: Partial<Controls> = { drumBpm: 120, chipLevel: undefined }
  expect(paramMask(patch)).toEqual(oldParamMask(patch))
})
