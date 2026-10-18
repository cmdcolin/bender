import { expect, test } from 'vitest'

import { IDX } from '../engine/params.ts'
import { SR, renderBender, rms, sine } from './testRender.ts'

import type { Controls } from '../controls.ts'

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

function reelFrom(
  start: Float32Array,
  o: Partial<Controls>,
  seconds: number,
): Float32Array {
  const buf = Float32Array.from(start)
  renderBender({ ...PLAYING, ...o }, seconds, built =>
    built.sampler.setBuffer(buf),
  )
  return buf
}

test('Wear and Hiss do nothing while the head is disarmed', () => {
  const after = reelAfter({ loopWear: 1, loopHiss: 1 }, 2)
  expect(after).toEqual(seeded())
})

test('Wear takes the top off a tone a little more every lap', () => {
  const bright = sine(6000, REEL_S, 0.5)
  const level = (wear: number, laps: number) =>
    rms(
      reelFrom(
        bright,
        { loopRec: 1, loopErase: 1, loopWear: wear },
        REEL_S * laps,
      ),
    )
  expect(level(0.6, 2)).toBeLessThan(level(0, 2))
  expect(level(0.6, 6)).toBeLessThan(level(0.6, 2) * 0.7)
})

test('Hiss laid on a silent reel climbs with every lap', () => {
  const silent = new Float32Array(Math.round(REEL_S * SR))
  const floor = (laps: number) =>
    rms(
      reelFrom(
        silent,
        { loopRec: 1, loopErase: 1, loopHiss: 1 },
        REEL_S * laps,
      ),
    )
  expect(floor(1)).toBeGreaterThan(0)
  expect(floor(6)).toBeGreaterThan(floor(1) * 1.3)
})

test('Hold keeps a loop at its level across laps that would fade it', () => {
  const tone = sine(220, REEL_S, 0.5)
  const level = (hold: number, laps: number) =>
    rms(
      reelFrom(
        tone,
        { loopRec: 1, loopErase: 1, sampleLevel: 0.9, loopHold: hold },
        REEL_S * laps,
      ),
    )
  const fade = level(0, 16) / level(0, 1)
  const held = level(1, 16) / level(1, 1)
  expect(fade).toBeLessThan(0.3)
  expect(held).toBeGreaterThan(0.8)
  expect(held).toBeLessThan(1.25)
})

const TAKE: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  sampleLevel: 1,
  loopRec: 1,
  loopSecs: 10,
}

test('closing a first take cuts the reel to what was played and starts it round', () => {
  let frames = 0
  let openBefore = false
  let openAfter = true
  renderBender(TAKE, 1.6, undefined, undefined, (built, secs) => {
    if (secs < 1) openBefore = built.sampler.open
    if (secs >= 1 && built.sampler.open) built.sampler.closeTake()
    if (secs >= 1.5) openAfter = built.sampler.open
    frames = built.sampler.frames
  })
  expect(openBefore).toBe(true)
  expect(openAfter).toBe(false)
  expect(Math.abs(frames - SR)).toBeLessThanOrEqual(256)
})

test('a take that runs out of reel closes itself at the end of it', () => {
  let open = true
  let frames = 0
  renderBender({ ...TAKE, loopSecs: 0.5 }, 1.2, undefined, undefined, built => {
    open = built.sampler.open
    frames = built.sampler.frames
  })
  expect(open).toBe(false)
  expect(frames).toBe(Math.round(0.5 * SR))
})

test('closing a take the instant it starts leaves a loop of a sane length', () => {
  let frames = 0
  renderBender(TAKE, 0.2, undefined, undefined, (built, secs) => {
    if (secs > 0.01) built.sampler.closeTake()
    frames = built.sampler.frames
  })
  expect(frames).toBeGreaterThanOrEqual(Math.round(0.05 * SR))
})

test('disarming the head ends the take where the head had got to', () => {
  let frames = 0
  renderBender(TAKE, 1.5, undefined, undefined, (built, secs, p) => {
    if (secs >= 1) p[IDX.loopRec] = 0
    frames = built.sampler.frames
  })
  expect(Math.abs(frames - SR)).toBeLessThanOrEqual(256)
})

test('undo takes off the last overdub and a second undo puts it back', () => {
  const before = seeded()
  let tape: Float32Array | null = null
  let states: number[] = []
  renderBender(
    { ...PLAYING, loopRec: 0, loopErase: 1 },
    2.5,
    built => {
      built.sampler.setBuffer(Float32Array.from(before))
    },
    undefined,
    (built, secs, p) => {
      tape = built.sampler.mono
      if (secs === 0) states = [built.sampler.undoState]
      if (secs >= 0.2 && p[IDX.loopRec] === 0 && secs < 0.3) p[IDX.loopRec] = 1
      if (secs >= 1 && secs < 1.1) p[IDX.loopRec] = 0
      if (secs >= 1.5 && states.length === 1) {
        states.push(built.sampler.undoState)
        built.sampler.undo()
        states.push(built.sampler.undoState)
        expect(Array.from(tape!)).toEqual(Array.from(before))
      }
      if (secs >= 2 && states.length === 3) {
        built.sampler.undo()
        states.push(built.sampler.undoState)
        expect(Array.from(tape!)).not.toEqual(Array.from(before))
      }
    },
  )
  expect(states).toEqual([0, 1, 2, 1])
})

test('loading a file drops the undo copy', () => {
  let state = -1
  renderBender(
    { ...PLAYING, loopRec: 1 },
    0.3,
    built => built.sampler.setBuffer(seeded()),
    undefined,
    (built, secs) => {
      if (secs > 0.2 && state < 0) {
        expect(built.sampler.undoState).toBe(1)
        built.sampler.setBuffer(seeded())
        state = built.sampler.undoState
      }
    },
  )
  expect(state).toBe(0)
})
