import { expect, test } from 'vitest'

import { SCOPE_LEN, SCOPE_RING_MASK, ScopeTrace } from './scopeTrace.ts'

const fill = (trace: ScopeTrace, length: number, at: (i: number) => number) => {
  for (let i = 0; i < length; i++) {
    trace.ring[trace.pos] = at(i)
    trace.pos = (trace.pos + 1) & SCOPE_RING_MASK
  }
}

const sine = (period: number, phase: number) => (i: number) =>
  Math.sin((2 * Math.PI * (i + phase)) / period)

test('a tone starts its trace on a rising zero crossing, whatever the phase it was posted at', () => {
  const starts = [0, 37, 81, 133].map(phase => {
    const trace = new ScopeTrace()
    fill(trace, 3000 + phase, sine(160, phase))
    trace.unroll(1)
    return Array.from(trace.out.subarray(0, 4))
  })
  for (const start of starts) {
    expect(start[0]).toBeGreaterThanOrEqual(0)
    expect(start[0]).toBeLessThan(0.05)
    expect(start[1]).toBeGreaterThan(start[0]!)
  }
  for (const start of starts.slice(1))
    for (let i = 0; i < start.length; i++)
      expect(start[i]).toBeCloseTo(starts[0]![i]!, 1)
})

test('the trace starts at the most recent crossing that leaves a whole trace behind it', () => {
  const trace = new ScopeTrace()
  fill(trace, SCOPE_LEN * 2, sine(200, 0.5))
  trace.unroll(1)
  for (let i = 0; i < SCOPE_LEN; i++)
    expect(trace.out[i]).toBe(
      trace.ring[(trace.pos + 400 + i) & SCOPE_RING_MASK],
    )
})

test('a crossing too small to arm the trigger is ignored, and the newest samples are shown', () => {
  const trace = new ScopeTrace()
  fill(trace, SCOPE_LEN * 2, i => (i % 2 === 0 ? 0.01 : -0.01) + i / 1e5)
  trace.unroll(1)
  for (let i = 0; i < SCOPE_LEN; i++)
    expect(trace.out[i]).toBe(
      trace.ring[(trace.pos + SCOPE_LEN + i) & SCOPE_RING_MASK],
    )
})

test('a signal that never crosses zero shows the newest samples in order', () => {
  const trace = new ScopeTrace()
  fill(trace, SCOPE_LEN * 3, i => 0.5 + i / 1e4)
  trace.unroll(0.8)
  for (let i = 1; i < SCOPE_LEN; i++)
    expect(trace.out[i]).toBeGreaterThan(trace.out[i - 1]!)
  expect(trace.out[SCOPE_LEN - 1]).toBe(
    trace.ring[(trace.pos - 1) & SCOPE_RING_MASK],
  )
})
