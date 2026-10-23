import { expect, test } from 'vitest'

import { RATCHETS } from '../../drums.ts'
import { renderBender, SR } from '../testRender.ts'

import type { Controls } from '../../controls.ts'
import type { BuiltChain } from '../build.ts'

// The kick alone on step 1 of a sixteen-step bar at 120 bpm. The counter's first
// strobe takes it to step 2, so step 1 first comes round at 2 s.
const KICK: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 1,
  drumBpm: 120,
  drumKick: 0x8000,
  drumSnare: 0,
  drumHat: 0,
  drumClap: 0,
  drumTom: 0,
  drumBell: 0,
  drumOpen: 0,
  drumCym: 0,
  drumAccent: 0,
}

const STEP_S = 0.125

function strikes(overrides: Partial<Controls>, seconds = 2.4) {
  const at: { s: number; gain: number }[] = []
  let now = 0
  renderBender(
    { ...KICK, ...overrides },
    seconds,
    (b: BuiltChain) => {
      b.transport.drums = true
      const kit = b.toyDrum as unknown as {
        hit: (bits: number, gain: number, ctx: unknown, i: number) => number
      }
      const own = kit.hit.bind(kit)
      kit.hit = (bits, gain, ctx, i) => {
        if (bits) at.push({ s: now + i / SR, gain })
        return own(bits, gain, ctx, i)
      }
    },
    undefined,
    (_b, secs) => {
      now = secs
    },
  )
  return at.filter(h => h.s > 1.9 && h.s < 2.2)
}

const ratchet = (n: number) => RATCHETS.indexOf(n)

test('a ratcheted step strikes that many times inside its step', () => {
  for (const n of [2, 3, 4, 8]) {
    const bar = strikes({ drumRatchet0: ratchet(n) })
    expect(bar.length, `×${n}`).toBe(n)
    const span = bar.at(-1)!.s - bar[0]!.s
    expect(span).toBeLessThan(STEP_S)
    expect(span).toBeCloseTo((STEP_S * (n - 1)) / n, 2)
  }
})

test('a ratchet on an empty step strikes nothing', () => {
  const hits = strikes({ drumRatchet3: ratchet(8) })
  expect(hits.length).toBe(1)
})

test('a nudge lands the step late by that share of it', () => {
  const plain = strikes({})[0]!.s
  const half = strikes({ drumNudge0: 6 })[0]!.s
  expect(half - plain).toBeCloseTo(STEP_S / 2, 2)
})

test('a nudged ratchet still lands every repeat before the next step', () => {
  const bar = strikes({ drumRatchet0: ratchet(4), drumNudge0: 9 })
  expect(bar.length).toBe(4)
  expect(bar.at(-1)!.s - bar[0]!.s).toBeLessThan(STEP_S / 4)
})

test('the ramp fades a roll out below zero and swells it above', () => {
  const gains = (ramp: number) =>
    strikes({ drumRatchet0: ratchet(4), drumRatchetRamp: ramp }).map(
      h => h.gain,
    )
  const fade = gains(-1)
  const swell = gains(1)
  expect(fade[0]).toBeCloseTo(1)
  expect(fade[3]).toBeCloseTo(0.15)
  expect(swell[0]).toBeCloseTo(0.15)
  expect(swell[3]).toBeCloseTo(1)
})
