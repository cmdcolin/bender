import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { IDX, packParams } from '../engine/params.ts'
import { Chain } from './chain.ts'
import { BLOCK, type Stage } from './stage.ts'
import { Echo } from './stages/echo.ts'
import { RackVerb } from './stages/rackVerb.ts'
import { makeIo, SR } from './testRender.ts'

function burst() {
  const state = { on: true, t: 0 }
  const stage: Stage = {
    label: 'burst',
    process(io) {
      for (let i = 0; i < io.n; i++, state.t++) {
        const v = state.on
          ? 0.4 * Math.sin((2 * Math.PI * 400 * state.t) / SR)
          : 0
        io.l[i]! += v
        io.r[i]! += v
      }
    },
    panic: () => {},
  }
  return { state, stage }
}

function peakOf(chain: Chain, p: Float32Array, blocks: number) {
  let peak = 0
  for (let b = 0; b < blocks; b++) {
    const io = makeIo()
    chain.process(io, p)
    for (let i = 0; i < BLOCK; i++) peak = Math.max(peak, Math.abs(io.l[i]!))
  }
  return peak
}

const blocksFor = (seconds: number) => Math.ceil((seconds * SR) / BLOCK)

function counted(gate: keyof Controls) {
  const calls: string[] = []
  const stage: Stage = {
    label: gate,
    when: p => p[IDX[gate]]! > 0,
    process: () => calls.push('process'),
    sleep: () => calls.push('sleep'),
    panic: () => calls.push('panic'),
  }
  return { calls, stage }
}

test('an echo switched off and back on has no old repeats left to play', () => {
  const { state, stage } = burst()
  const chain = new Chain(SR)
  chain.sources = [stage]
  chain.pedals = [new Echo(SR)]
  const board = { ...DEFAULT_CONTROLS, echoLevel: 1, echoMs: 300, echoFb: 0.8 }
  const p = packParams(board)
  peakOf(chain, p, blocksFor(0.25))
  state.on = false
  expect(peakOf(chain, p, blocksFor(0.4))).toBeGreaterThan(0.05)
  p[IDX.echoLevel] = 0
  peakOf(chain, p, blocksFor(1))
  p[IDX.echoLevel] = 1
  expect(peakOf(chain, p, blocksFor(0.5))).toBeLessThan(1e-6)
})

test('a frozen rack reverb keeps its tank while its mix is down', () => {
  const { state, stage } = burst()
  const chain = new Chain(SR)
  chain.sources = [stage]
  chain.pedals = [new RackVerb(SR)]
  const p = packParams({ ...DEFAULT_CONTROLS, rackMix: 1 })
  peakOf(chain, p, blocksFor(0.5))
  state.on = false
  p[IDX.rackFreeze] = 1
  p[IDX.rackMix] = 0
  peakOf(chain, p, blocksFor(0.2))
  p[IDX.rackMix] = 1
  expect(peakOf(chain, p, blocksFor(0.2))).toBeGreaterThan(0.01)
})

test('a stage goes to sleep once, the block after it goes quiet', () => {
  const { calls, stage } = counted('echoLevel')
  const chain = new Chain(SR)
  chain.pedals = [stage]
  const p = packParams({ ...DEFAULT_CONTROLS, echoLevel: 1 })
  chain.process(makeIo(), p)
  p[IDX.echoLevel] = 0
  chain.process(makeIo(), p)
  chain.process(makeIo(), p)
  chain.process(makeIo(), p)
  expect(calls).toEqual(['process', 'sleep'])
})

test('stages that go quiet together sleep one a block, and a waking one clears first', () => {
  const a = counted('echoLevel')
  const b = counted('rackMix')
  const chain = new Chain(SR)
  chain.pedals = [a.stage, b.stage]
  const p = packParams({ ...DEFAULT_CONTROLS, echoLevel: 1, rackMix: 1 })
  chain.process(makeIo(), p)
  p[IDX.echoLevel] = 0
  p[IDX.rackMix] = 0
  chain.process(makeIo(), p)
  expect(a.calls).toEqual(['process', 'sleep'])
  expect(b.calls).toEqual(['process'])
  p[IDX.rackMix] = 1
  chain.process(makeIo(), p)
  expect(b.calls).toEqual(['process', 'sleep', 'process'])
})

test('a stage that never ran is never put to sleep', () => {
  const { calls, stage } = counted('echoLevel')
  const chain = new Chain(SR)
  chain.pedals = [stage]
  const p = packParams(DEFAULT_CONTROLS)
  for (let b = 0; b < 4; b++) chain.process(makeIo(), p)
  expect(calls).toEqual([])
})
