import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { EVENT, N_DRUM_VOICES, STEPS } from '../drums.ts'
import { packParams } from '../engine/params.ts'
import { eventOn } from './stages/stepFaults.ts'
import { renderBender } from './testRender.ts'
import { TriggerBus } from './trigbus.ts'
import { mulberry32 } from './util/rng.ts'
import { NO_STRAY, STRAYS, Wander } from './wander.ts'

import type { Controls } from '../controls.ts'
import type { BuiltChain } from './build.ts'

const FOUR = 0x8888
const OFFBEAT_HATS = 0x2222
const BACKBEAT = 0x0808

function load(w: Wander) {
  w.rows.fill(0)
  w.maybes.fill(0)
  w.rows[0] = FOUR
  w.rows[1] = BACKBEAT
  w.rows[2] = OFFBEAT_HATS
  w.accent = 0x8080
  w.lens.fill(STEPS)
}

test('at nothing no bar strays, and the dice stay undrawn', () => {
  let draws = 0
  const w = new Wander(() => {
    draws++
    return 0
  })
  for (let bar = 0; bar < 64; bar++) {
    load(w)
    w.plan(0, bar)
    expect(w.straying).toBe(false)
  }
  expect(draws).toBe(0)
})

test('the last bar of every four strays more often than the others', () => {
  const w = new Wander(mulberry32(1))
  const strays = [0, 0, 0, 0]
  for (let bar = 0; bar < 4000; bar++) {
    load(w)
    w.plan(0.3, bar)
    if (w.straying) strays[bar % 4]!++
  }
  expect(strays[3]).toBeGreaterThan(strays[0]! * 2.5)
  expect(strays[0]! / 1000).toBeCloseTo(0.15, 1)
  expect(strays[3]! / 1000).toBeCloseTo(0.55, 1)
})

test('a low amount picks only the gentle strays', () => {
  const w = new Wander(mulberry32(2))
  const seen = new Set<string>()
  for (let bar = 0; bar < 2000; bar++) {
    load(w)
    w.plan(0.1, bar)
    if (w.first !== NO_STRAY) seen.add(STRAYS[w.first]!.name)
    expect(w.second).toBe(NO_STRAY)
  }
  expect([...seen].toSorted()).toEqual([
    'ghosts',
    'no kick',
    'nudge',
    'roll',
    'turnaround',
  ])
})

test('all the way up every stray turns up, and some bars stack two', () => {
  const w = new Wander(mulberry32(3))
  const seen = new Set<string>()
  let stacked = 0
  for (let bar = 0; bar < 4000; bar++) {
    load(w)
    w.plan(1, bar)
    if (w.first !== NO_STRAY) seen.add(STRAYS[w.first]!.name)
    if (w.second !== NO_STRAY) stacked++
  }
  expect(seen.size).toBe(STRAYS.length)
  expect(stacked).toBeGreaterThan(100)
})

test('every stray changes a four-on-the-floor bar', () => {
  for (const [i, stray] of STRAYS.entries()) {
    let changed = 0
    for (let seed = 0; seed < 20; seed++) {
      const w = new Wander(mulberry32(seed))
      load(w)
      w.ratchets.fill(0)
      w.events.fill(0)
      w.wireLine = -1
      stray.play(w, mulberry32(seed + 100), 1)
      const rows =
        [...w.rows].join() !==
        [FOUR, BACKBEAT, OFFBEAT_HATS, 0, 0, 0, 0, 0].join()
      if (
        rows ||
        w.accent !== 0x8080 ||
        w.ratchets.some(r => r > 1) ||
        w.events.some(e => e !== 0) ||
        w.wireLine >= 0
      )
        changed++
    }
    expect([i, stray.name, changed]).toEqual([i, stray.name, 20])
  }
})

test('rows only ever move inside sixteen bits', () => {
  const w = new Wander(mulberry32(4))
  for (let bar = 0; bar < 2000; bar++) {
    load(w)
    w.plan(1, bar)
    for (let v = 0; v < N_DRUM_VOICES; v++) {
      expect(w.rows[v]).toBeLessThan(1 << STEPS)
      expect(w.maybes[v]).toBeLessThan(1 << STEPS)
    }
  }
})

test("Wander's fault lands only on its own bar, and the event row wins", () => {
  const trig = new TriggerBus()
  const events = new Uint8Array(STEPS)
  events[14] = EVENT.brake
  events[15] = EVENT.brake
  trig.wandered(3, events)
  const bar3 = (col: number) => 3 * STEPS + col + 1
  const p = packParams(DEFAULT_CONTROLS)
  expect(eventOn(p, bar3(14), trig)).toBe(EVENT.brake)
  expect(eventOn(p, bar3(13), trig)).toBe(0)
  expect(eventOn(p, bar3(14) + STEPS, trig)).toBe(0)
  expect(eventOn(p, bar3(14))).toBe(0)
  const cut = packParams({ ...DEFAULT_CONTROLS, drumEvent14: EVENT.cut })
  expect(eventOn(cut, bar3(14), trig)).toBe(EVENT.cut)
})

function kicksPerBar(overrides: Partial<Controls>, seconds = 8.2) {
  const kicks = new Map<number, number>()
  renderBender(
    {
      chipLevel: 0,
      drumLevel: 1,
      drumBpm: 480,
      drumKick: FOUR,
      drumHat: OFFBEAT_HATS,
      ...overrides,
    },
    seconds,
    (b: BuiltChain) => {
      b.transport.drums = true
      const kit = b.toyDrum as unknown as {
        tick: number
        hit: (bits: number, gain: number, ctx: unknown, i: number) => number
      }
      const own = kit.hit.bind(kit)
      kit.hit = (bits, gain, ctx, i) => {
        const bar = Math.floor(kit.tick / STEPS)
        if (bits & 1) kicks.set(bar, (kicks.get(bar) ?? 0) + 1)
        return own(bits, gain, ctx, i)
      }
    },
  )
  const bars = Array.from({ length: 15 }, (_, i) => i + 1)
  return bars.map(b => kicks.get(b) ?? 0)
}

test('the kit plays the grid every bar while Wander is at nothing', () => {
  expect(kicksPerBar({})).toEqual(Array(15).fill(4))
})

test('with Wander up some bars stray and the rest play the grid', () => {
  const kicks = kicksPerBar({ drumWander: 0.8 })
  const plain = kicks.filter(k => k === 4).length
  expect(plain).toBeGreaterThan(2)
  expect(plain).toBeLessThan(15)
})
