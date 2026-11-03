import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { packParams } from '../engine/params.ts'
import { MIC, micInto } from './micJacks.ts'
import { BLOCK } from './stage.ts'

const ctx = { mic: new Float32Array(BLOCK), mic2: new Float32Array(BLOCK) }
const wired = (micPatch: number, micPatch2: number) =>
  packParams({ ...DEFAULT_CONTROLS, micPatch, micPatch2 })

test('each wire feeds the jack it is on and nothing else', () => {
  const p = wired(MIC.mix, MIC.drumTrig + 1)
  expect(micInto(p, ctx, MIC.mix)).toBe(ctx.mic)
  expect(micInto(p, ctx, MIC.drumTrig)).toBe(ctx.mic2)
  expect(micInto(p, ctx, MIC.toyClock)).toBeNull()
})

test('the second wire at off reaches no jack', () => {
  const p = wired(MIC.toyClock, 0)
  expect(micInto(p, ctx, MIC.mix)).toBeNull()
  expect(micInto(p, ctx, MIC.toyClock)).toBe(ctx.mic)
})

test('on a jack both wires share, the first wire is the one heard', () => {
  const p = wired(MIC.glintBus, MIC.glintBus + 1)
  expect(micInto(p, ctx, MIC.glintBus)).toBe(ctx.mic)
})
