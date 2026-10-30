import { describe, expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { ROCK } from '../drums.ts'
import { IDX, packParams } from '../engine/params.ts'
import { buildBender, type BuiltChain } from './build.ts'
import {
  BLOCK,
  type Stage,
  type StereoBlock,
  type WrittenBus,
} from './stage.ts'

import type { Chain } from './chain.ts'

const SR = 48000
const WARM_BLOCKS = 200
const SEEK_BLOCKS = 400
const AFTER_BLOCKS = 100

const BOARD: Partial<Controls> = {
  ...ROCK,
  bendSlot0: 1,
  bendSlot1: 2,
  bendSlot2: 3,
  bendSlot3: 4,
  bendSlot4: 5,
  bendSlot5: 6,
  chipLevel: 0.6,
  chipAccomp: 1,
  drumLevel: 0.6,
  fmLevel: 0.5,
  pcmLevel: 0.5,
  monoLevel: 0.5,
  oscLevel: 0.3,
  noiseLevel: 0.2,
  loopRec: 1,
  fourLevel: 0.5,
  ringMix: 0.5,
  crushMix: 0.5,
  distMix: 0.5,
  combMix: 0.5,
  glitchMix: 0.5,
  filtMix: 0.5,
  shiftMix: 0.5,
  octMix: 0.5,
  rackMix: 0.5,
  stompMix: 0.6,
  dlyMix: 0.5,
  echoLevel: 0.5,
  revMix: 0.4,
  ensMix: 0.5,
  ampMix: 0.6,
  tapeMix: 0.7,
  brownAmt: 0.4,
  humLevel: 0.3,
  fbAmt: 0.5,
  drumWander: 0.01,
  jointChatter: 0,
  relayRate: 0,
}

function stagesOf(chain: Chain) {
  return [
    ...chain.sources,
    ...chain.bendById.filter((s): s is Stage => s !== undefined),
    ...chain.pedals,
    ...chain.post,
  ]
}

function rig() {
  const built = buildBender(SR, 3)
  built.transport.tune = true
  built.transport.drums = true
  const stages = stagesOf(built.chain)
  const panics = new Map<string, number>()
  for (const s of stages) {
    const inner = s.panic.bind(s)
    s.panic = () => {
      panics.set(s.label, (panics.get(s.label) ?? 0) + 1)
      inner()
    }
  }
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  return { built, stages, panics, io }
}

function boardFor(built: BuiltChain, s: Stage) {
  const id = built.chain.bendById.indexOf(s)
  return packParams({
    ...DEFAULT_CONTROLS,
    ...BOARD,
    ...(id > 6 ? { bendSlot5: id } : {}),
  })
}

function poisonOnce(s: Stage) {
  const inner = s.process.bind(s)
  const state = { armed: false, struck: false }
  s.process = (io, p, ctx) => {
    inner(io, p, ctx)
    if (state.armed && !state.struck) {
      io.l[37] = Number.NaN
      io.r[90] = Number.POSITIVE_INFINITY
      state.struck = true
    }
  }
  return state
}

function finite(io: StereoBlock) {
  let ok = true
  for (let i = 0; i < io.n; i++)
    ok = ok && Number.isFinite(io.l[i]!) && Number.isFinite(io.r[i]!)
  return ok
}

function energy(io: StereoBlock) {
  let sum = 0
  for (let i = 0; i < io.n; i++) sum += io.l[i]! * io.l[i]!
  return sum
}

const LABELS = stagesOf(buildBender(SR, 3).chain).map(s => s.label)

describe('a non-finite block stays in the stage that made it', () => {
  test.each(LABELS)('%s', label => {
    const { built, stages, panics, io } = rig()
    const chain = built.chain
    const culprit = stages.find(s => s.label === label)
    if (!culprit) throw new Error(`no stage ${label}`)
    const p = boardFor(built, culprit)
    const poison = poisonOnce(culprit)
    for (let b = 0; b < WARM_BLOCKS; b++) chain.process(io, p)
    panics.clear()
    poison.armed = true
    let seek = 0
    let allFinite = true
    while (!poison.struck && seek < SEEK_BLOCKS) {
      chain.process(io, p)
      allFinite = allFinite && finite(io)
      seek++
    }
    expect(poison.struck, `${label} never ran`).toBe(true)
    let after = 0
    for (let b = 0; b < AFTER_BLOCKS; b++) {
      chain.process(io, p)
      allFinite = allFinite && finite(io)
      after += energy(io)
    }
    expect(allFinite).toBe(true)
    expect(chain.faults).toBe(1)
    expect(chain.faultStage).toBe(label)
    expect([...panics]).toEqual([[label, 1]])
    expect(after).toBeGreaterThan(0.1)
  })
})

test('two stages faulting in one block take the whole board down', () => {
  const { built, stages, panics, io } = rig()
  const chain = built.chain
  const p = packParams({ ...DEFAULT_CONTROLS, ...BOARD })
  const toy = poisonOnce(built.toyChip)
  const drum = poisonOnce(built.toyDrum)
  for (let b = 0; b < WARM_BLOCKS; b++) chain.process(io, p)
  panics.clear()
  toy.armed = true
  drum.armed = true
  chain.process(io, p)
  expect(toy.struck && drum.struck).toBe(true)
  expect(finite(io)).toBe(true)
  expect(chain.faults).toBe(2)
  expect(panics.size).toBe(stages.length)
})

test('a non-finite block that reaches the output still panics the board', () => {
  const { built, stages, panics, io } = rig()
  const chain = built.chain
  const p = packParams({ ...DEFAULT_CONTROLS, ...BOARD })
  for (let b = 0; b < WARM_BLOCKS; b++) chain.process(io, p)
  panics.clear()
  const gain = p[IDX.outGain]!
  p[IDX.outGain] = Number.NaN
  chain.process(io, p)
  expect(energy(io)).toBe(0)
  expect(chain.faults).toBe(1)
  expect(chain.faultStage).toBe('chain')
  expect(panics.size).toBe(stages.length)
  p[IDX.outGain] = gain
  let after = 0
  let allFinite = true
  for (let b = 0; b < AFTER_BLOCKS; b++) {
    chain.process(io, p)
    allFinite = allFinite && finite(io)
    after += energy(io)
  }
  expect(allFinite).toBe(true)
  expect(chain.faults).toBe(1)
  expect(after).toBeGreaterThan(0.1)
})

function poisonBusOnce(s: Stage, bus: WrittenBus) {
  const inner = s.process.bind(s)
  const state = { armed: false, struck: false }
  s.process = (io, p, ctx) => {
    inner(io, p, ctx)
    if (state.armed && !state.struck) {
      ctx[bus][37] = Number.NaN
      state.struck = true
    }
  }
  return state
}

const WRITERS = stagesOf(buildBender(SR, 3).chain).flatMap(s =>
  (s.writes ?? []).map(bus => [s.label, bus] as const),
)

describe('a non-finite sample on a shared bus is blamed on its writer', () => {
  test('every bus has a writer', () => {
    expect(new Set(WRITERS.map(([, bus]) => bus))).toEqual(
      new Set(['sag', 'send', 'step']),
    )
  })

  test.each(WRITERS)('%s on %s', (label, bus) => {
    const { built, stages, panics, io } = rig()
    const chain = built.chain
    const writer = stages.find(s => s.label === label)
    if (!writer) throw new Error(`no stage ${label}`)
    const p = boardFor(built, writer)
    const poison = poisonBusOnce(writer, bus)
    for (let b = 0; b < WARM_BLOCKS; b++) chain.process(io, p)
    panics.clear()
    poison.armed = true
    let allFinite = true
    for (let b = 0; b < AFTER_BLOCKS; b++) {
      chain.process(io, p)
      allFinite = allFinite && finite(io)
    }
    expect(poison.struck, `${label} never ran`).toBe(true)
    expect(allFinite).toBe(true)
    expect(chain.faults).toBe(1)
    expect(chain.faultStage).toBe(label)
    expect([...panics]).toEqual([[label, 1]])
  })
})
