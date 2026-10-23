import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { EVENT } from '../../drums.ts'
import { packParams } from '../../engine/params.ts'
import { BLOCK } from '../stage.ts'
import { makeIo, renderBender, rms, SR } from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import { StepFaults } from './stepFaults.ts'

import type { Ctx } from '../stage.ts'

const STEP = 6000
const HZ = 440

// A sine through the stage, with the kit's counter landing on each tick of
// `strobes` at the sample given.
function run(
  overrides: Partial<Controls>,
  strobes: { at: number; tick: number }[],
  samples = BLOCK * 150,
) {
  const stage = new StepFaults(SR)
  const trig = new TriggerBus()
  const ctx = { trig } as unknown as Ctx
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const input = new Float32Array(samples)
  const out = new Float32Array(samples)
  for (let s = 0; s < samples; s++)
    input[s] = 0.5 * Math.sin((2 * Math.PI * HZ * s) / SR)
  for (let b = 0; b < samples; b += BLOCK) {
    for (const s of strobes)
      if (s.at >= b && s.at < b + BLOCK)
        trig.stepClocked(s.at - b, s.tick, STEP)
    io.l.set(input.subarray(b, b + BLOCK))
    io.r.set(input.subarray(b, b + BLOCK))
    if (stage.when(p)) stage.process(io, p, ctx)
    out.set(io.l.subarray(0, BLOCK), b)
    trig.swap(BLOCK)
  }
  return { input, out }
}

const BAR = [
  { at: 1000, tick: 0 },
  { at: 1000 + STEP, tick: 1 },
]

test('a board with no events passes the mix through untouched', () => {
  const { input, out } = run({}, BAR)
  expect(out).toEqual(input)
})

test('a cut silences its step and lets go on the next', () => {
  const { input, out } = run({ drumEvent0: EVENT.cut }, BAR)
  expect(rms(out.subarray(1200, 1000 + STEP))).toBe(0)
  const after = 1200 + STEP
  expect(out.subarray(after, after + 2000)).toEqual(
    input.subarray(after, after + 2000),
  )
})

test('a fault ends with its step even if the kit stops', () => {
  const { input, out } = run({ drumEvent0: EVENT.cut }, [BAR[0]!])
  const after = 1200 + STEP
  expect(out.subarray(after, after + 2000)).toEqual(
    input.subarray(after, after + 2000),
  )
})

test('a brake slows the mix to a stop inside its step', () => {
  const { out } = run({ drumEvent0: EVENT.brake }, BAR)
  const early = rms(out.subarray(1100, 1600))
  const late = rms(out.subarray(1000 + STEP * 0.9, 1000 + STEP))
  expect(early).toBeGreaterThan(0.3)
  expect(late).toBeLessThan(0.01)
  // Halfway through, the tape runs at half speed, so the sine is an octave
  // down: about a zero crossing per 109 samples rather than 55.
  const mid = out.subarray(1000 + STEP / 2 - 300, 1000 + STEP / 2 + 300)
  let crossings = 0
  for (let i = 1; i < mid.length; i++)
    if (mid[i - 1]! < 0 !== mid[i]! < 0) crossings++
  expect(crossings).toBeGreaterThan(3)
  expect(crossings).toBeLessThan(8)
})

test('a run of brakes stops the mix once, over the whole run', () => {
  const strobes = [0, 1, 2, 3].map(k => ({ at: 1000 + k * STEP, tick: k }))
  const brakes = { drumEvent0: 3, drumEvent1: 3, drumEvent2: 3, drumEvent3: 3 }
  const { out } = run(brakes, strobes, BLOCK * 220)
  const at = (s: number) =>
    rms(out.subarray(1000 + s * STEP, 1000 + s * STEP + 600))
  expect(at(0.5)).toBeGreaterThan(at(2))
  expect(at(2)).toBeGreaterThan(at(3.5))
  expect(at(2)).toBeGreaterThan(0.1)
  expect(at(3.7)).toBeLessThan(0.01)
})

test('a freeze loops the first quarter of its step', () => {
  const { input, out } = run({ drumEvent0: EVENT.freeze }, BAR)
  const slice = STEP / 4
  for (const k of [100, 700, 1200]) {
    expect(out[1000 + slice + k]).toBeCloseTo(input[1000 + k]!, 5)
    expect(out[1000 + 2 * slice + k]).toBeCloseTo(input[1000 + k]!, 5)
  }
})

// The kick on every step at 120 bpm, so the kit is clocking.
const KIT: Partial<Controls> = {
  chipLevel: 0.6,
  drumLevel: 1,
  drumBpm: 120,
  drumKick: 0xffff,
}

function railRun(overrides: Partial<Controls>) {
  let reboots = 0
  const v: number[] = []
  const ticks: number[] = []
  renderBender(
    { ...KIT, ...overrides },
    4.5,
    b => {
      b.transport.drums = true
      b.transport.tune = true
    },
    undefined,
    b => {
      reboots = b.rail.rebootCount
      v.push(b.rail.v)
      const col = b.toyDrum.tick % 16
      if (col !== ticks.at(-1)) ticks.push(col)
    },
  )
  return { reboots, v, ticks }
}

test('a reboot on step 8 makes an eight-step bar from the downbeat', () => {
  const { ticks } = railRun({ drumEvent7: EVENT.reboot })
  const played = ticks.filter(col => col !== 15)
  expect(played.slice(0, 24)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7,
  ])
})

test('a row set to every four bars fires on the fourth', () => {
  const reboots = (every: number) =>
    railRun({ drumBpm: 480, drumEvent5: EVENT.reboot, drumEventEvery: every })
      .reboots
  expect(reboots(0)).toBeGreaterThanOrEqual(7)
  expect(reboots(2)).toBe(2)
})

test('a reboot step reboots the shared cells every bar', () => {
  expect(railRun({}).reboots).toBe(0)
  expect(railRun({ drumEvent4: EVENT.reboot }).reboots).toBeGreaterThanOrEqual(
    2,
  )
})

test('a drop step lets the shared cells sag and recover', () => {
  expect(Math.min(...railRun({ drumBpm: 60 }).v)).toBeGreaterThan(0.95)
  const { v } = railRun({ drumBpm: 60, drumEvent0: EVENT.drop })
  expect(Math.min(...v)).toBeLessThan(0.7)
  expect(v.at(-1)).toBeGreaterThan(0.95)
})
