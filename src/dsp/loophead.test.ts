import { expect, test } from 'vitest'
import type { Controls } from '../controls'
import { SR, renderBender, rms, sine } from './testRender'

// A short reel with a tone already on it, so what a lap costs is measurable
// against what went on.
const REEL_S = 0.5
const seeded = () => sine(220, REEL_S, 0.5)

const PLAYING: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  sampleLevel: 1,
}

/** The reel itself after a render, which is the thing under test — what the
    board put on the tape, not what it put out of the speakers. */
function reelAfter(o: Partial<Controls>, seconds: number): Float32Array {
  let tape: Float32Array | null = null
  renderBender({ ...PLAYING, ...o }, seconds, built => {
    const buf = seeded()
    built.sampler.setBuffer(buf)
    tape = buf
  })
  return tape!
}

test('a record head left disarmed does not touch the tape', () => {
  const after = reelAfter({}, 2)
  expect(after).toEqual(seeded())
})

test('the loop is bit-identical with the head disarmed however the rest sits', () => {
  const a = renderBender({ ...PLAYING }, 1, b => b.sampler.setBuffer(seeded()))
  const b = renderBender({ ...PLAYING, loopErase: 0.3, loopSecs: 9 }, 1, x =>
    x.sampler.setBuffer(seeded()),
  )
  expect(a).toEqual(b)
})

// Erase all the way up is a delay the length of the reel: what was on it is
// gone after one lap.
test('a full erase head wipes what was there', () => {
  const after = reelAfter({ loopRec: 1, loopErase: 1 }, REEL_S * 3)
  const was = seeded()
  let same = 0
  for (let i = 0; i < was.length; i++) {
    if (Math.abs(after[i]! - was[i]!) < 1e-4) same++
  }
  expect(same / was.length).toBeLessThan(0.1)
})

// The erase head disconnected: laps pile up rather than replacing, and the
// medium is what stops it going to ten times full scale.
test('with nothing erased the laps pile up and the oxide runs out of room', () => {
  const after = reelAfter({ loopRec: 1, loopErase: 0 }, REEL_S * 12)
  expect(rms(after)).toBeGreaterThan(rms(seeded()))
  expect(
    after.reduce((a, v) => Math.max(a, Math.abs(v)), 0),
  ).toBeLessThanOrEqual(1)
})

// The point of the whole thing: a lap costs whatever the board does to a
// signal, so a board with a bend in it takes the loop somewhere a decay
// coefficient could not.
test('a bend in the path makes the loop diverge rather than fade', () => {
  const clean = reelAfter({ loopRec: 1, loopErase: 0.5 }, REEL_S * 8)
  const bent = reelAfter(
    { loopRec: 1, loopErase: 0.5, bendSlot0: 2, bits: 3, crushMix: 1 },
    REEL_S * 8,
  )
  let diff = 0
  for (let i = 0; i < clean.length; i++) diff += (bent[i]! - clean[i]!) ** 2
  expect(Math.sqrt(diff / clean.length)).toBeGreaterThan(0.01)
})

// Armed with nothing loaded, the head threads a reel of its own and the board
// plays onto it.
test('arming with no file threads a blank tape of the length asked for', () => {
  let len = -1
  renderBender(
    { chipLevel: 0.8, sampleLevel: 1, loopRec: 1, loopErase: 1, loopSecs: 1 },
    0.4,
    built => {
      built.transport.tune = true
    },
    undefined,
    built => {
      const b = (built.sampler as unknown as { buf: Float32Array | null }).buf
      if (b) len = b.length
    },
  )
  expect(len).toBe(SR)
})

test('a threaded tape has the board on it rather than silence', () => {
  let tape: Float32Array | null = null
  renderBender(
    { chipLevel: 0.8, sampleLevel: 1, loopRec: 1, loopErase: 1, loopSecs: 0.5 },
    1.5,
    built => {
      built.transport.tune = true
    },
    undefined,
    built => {
      tape = (built.sampler as unknown as { buf: Float32Array | null }).buf
    },
  )
  expect(rms(tape!)).toBeGreaterThan(0.005)
})
