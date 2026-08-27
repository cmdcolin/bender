import { expect, test } from 'vitest'
import type { Controls } from '../controls'
import { peaksOf, PEAK_BINS } from './stages/sampler'
import { SR, renderBender, rms } from './testRender'

const REEL_S = 1

// A reel with a different tone on each half, so which half went round is a
// question the output answers on its own.
function twoTone(): Float32Array {
  const buf = new Float32Array(REEL_S * SR)
  for (let i = 0; i < buf.length; i++) {
    const hz = i < buf.length / 2 ? 200 : 2000
    buf[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / SR)
  }
  return buf
}

const PLAYING: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  sampleLevel: 1,
}

const played = (o: Partial<Controls>, seconds: number) =>
  renderBender({ ...PLAYING, ...o }, seconds, b =>
    b.sampler.setBuffer(twoTone()),
  )

/** How much of a render sits above 1 kHz — which half of the reel it was. */
function highEnergy(x: Float32Array): number {
  let last = 0
  let sum = 0
  for (const v of x) {
    sum += (v - last) ** 2
    last = v
  }
  return Math.sqrt(sum / x.length)
}

test('the markers pick which stretch of the reel goes round', () => {
  const low = played({ loopIn: 0, loopOut: 0.5 }, 2)
  const high = played({ loopIn: 0.5, loopOut: 1 }, 2)
  expect(highEnergy(high)).toBeGreaterThan(highEnergy(low) * 4)
})

// Two markers on one line: crossing them is a window the other way round, not
// a window of nothing.
test('markers dragged past each other swap rather than collapse', () => {
  const up = played({ loopIn: 0.5, loopOut: 1 }, 2)
  const down = played({ loopIn: 1, loopOut: 0.5 }, 2)
  expect(rms(down)).toBeCloseTo(rms(up), 3)
})

// The whole point of a window: the head comes round inside it rather than
// running off the end of the file, so a quarter-second slice repeats four times
// a second however long the reel is.
test('the head comes round at the out marker rather than at the end', () => {
  const out = played({ loopIn: 0, loopOut: 0.05 }, REEL_S)
  // A twentieth of a one-second reel is 200 Hz throughout; the far half of the
  // reel never gets a look in.
  expect(highEnergy(out)).toBeLessThan(highEnergy(played({}, REEL_S)))
})

test('a one-shot stops at the out marker and waits', () => {
  const stopped = renderBender(
    { ...PLAYING, sampleMode: 1, loopOut: 0.25 },
    REEL_S,
    b => b.sampler.setBuffer(twoTone()),
  )
  // Quiet for the last half of the render: the window ran out a quarter of the
  // way in and nothing has struck it since.
  expect(rms(stopped.subarray(stopped.length / 2))).toBeLessThan(1e-6)
})

test('a seek drops the head where it was asked for', () => {
  const seeked = renderBender(
    PLAYING,
    0.2,
    b => b.sampler.setBuffer(twoTone()),
    undefined,
    b => b.sampler.seek(0.75),
  )
  // Landed in the far half of the reel, which is the 2 kHz one.
  expect(highEnergy(seeked)).toBeGreaterThan(highEnergy(played({}, 0.2)) * 4)
})

test('a seek past the ends stays on the tape', () => {
  const built = renderBender(
    PLAYING,
    0.05,
    b => b.sampler.setBuffer(twoTone()),
    undefined,
    b => b.sampler.seek(2),
  )
  expect(built.every(v => Number.isFinite(v))).toBe(true)
})

test('the envelope covers the reel and tops out at what is on it', () => {
  const peaks = peaksOf(twoTone())
  expect(peaks).toHaveLength(PEAK_BINS)
  expect(Math.max(...peaks)).toBeCloseTo(0.5, 2)
  expect(Math.min(...peaks)).toBeGreaterThan(0.4)
})

// The reel is drawn off what the head reads, so a record head rewriting the
// tape shows up in the drawing rather than leaving it on the file that was
// dropped. The fader is down for this one: up, the sampler is on the bus it is
// recording off, and what the erase head takes off the tape the play head puts
// straight back.
test('the envelope follows the tape as the record head rewrites it', () => {
  let peaks: Float32Array | null = null
  renderBender(
    { ...PLAYING, sampleLevel: 0, loopRec: 1, loopErase: 1 },
    REEL_S * 3,
    b => b.sampler.setBuffer(twoTone()),
    undefined,
    b => (peaks = b.sampler.peaks),
  )
  expect(Math.max(...peaks!)).toBeLessThan(0.1)
})
