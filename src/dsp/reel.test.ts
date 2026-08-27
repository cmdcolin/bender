import { expect, test } from 'vitest'
import type { Controls } from '../controls'
import { DEST } from './modbus'
import { peaksOf, PEAK_BINS } from './stages/sampler'
import { bin, deviation, sine, SR, renderBender, rms } from './testRender'

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

// The tape's three lanes in the bay. Everything else on the board dives with
// the rail; before these the sampler was the one source a starve could not
// reach.
const WIRED = { ...PLAYING, mod0Src: 1, modLfoHz: 0.5 }

test('a wire on the capstan drags the tape and leaves the direction alone', () => {
  const free = played({}, 2)
  const dragged = renderBender(
    { ...WIRED, mod0Dest: DEST.sampleSpeed, mod0Depth: 1 },
    2,
    b => b.sampler.setBuffer(twoTone()),
  )
  expect(deviation(dragged, free)).toBeGreaterThan(0.1)
})

// A capstan is a multiplier, so a transport parked at the stop stays parked
// however hard anything pushes it.
test('a wire on the capstan cannot start a frozen tape', () => {
  const frozen = renderBender(
    { ...WIRED, sampleSpeed: 0, mod0Dest: DEST.sampleSpeed, mod0Depth: 1 },
    0.5,
    b => b.sampler.setBuffer(twoTone()),
  )
  // Parked on frame zero, which is the head of the 200 Hz half: a dc-ish hold
  // rather than a tape going anywhere.
  expect(highEnergy(frozen)).toBeLessThan(1e-4)
})

test('a wire on the slide walks the window along the recording', () => {
  const still = played({ loopOut: 0.05 }, 2)
  const walked = renderBender(
    { ...WIRED, loopOut: 0.05, mod0Dest: DEST.loopSlide, mod0Depth: 1 },
    2,
    b => b.sampler.setBuffer(twoTone()),
  )
  // A window that never leaves the first twentieth of the reel is 200 Hz for
  // the whole render; one walked across it reaches the 2 kHz half.
  expect(highEnergy(walked)).toBeGreaterThan(highEnergy(still) * 4)
})

test('a wire on the span opens and closes the window', () => {
  const fixed = played({ loopOut: 0.5 }, 2)
  const breathing = renderBender(
    { ...WIRED, loopOut: 0.5, mod0Dest: DEST.loopSpan, mod0Depth: 1 },
    2,
    b => b.sampler.setBuffer(twoTone()),
  )
  expect(deviation(breathing, fixed)).toBeGreaterThan(0.1)
})

test('an unwired bay leaves the tape exactly where it was', () => {
  const bare = played({}, 1)
  const wired = renderBender(
    {
      ...PLAYING,
      mod0Src: 1,
      modLfoHz: 4,
      mod0Depth: 1,
      mod0Dest: DEST.filtHz,
    },
    1,
    b => b.sampler.setBuffer(twoTone()),
  )
  expect(wired).toEqual(bare)
})

// The markers at the ends of the reel are the whole reel, to the frame. An out
// point held two frames short of the end is a full-reel loop that splices early
// — inaudible on a drum break and a click once a lap on a tone, which is how it
// got past a suite that only ever asked whether the right half was playing.
test('a loop over the whole reel comes round at the end of it', () => {
  // A whole number of cycles, so a correct lap is one unbroken tone and a
  // splice two frames early is a phase jump once a second.
  const reel = sine(200, REEL_S, 0.5)
  const out = renderBender({ ...PLAYING }, REEL_S * 4, b =>
    b.sampler.setBuffer(reel),
  ).subarray(SR)
  // Nothing up here but the splice: the bus and the master put a third
  // harmonic on the tone at −34 dB and nothing at all at 3 kHz. A seamless lap
  // measures −165 dB, and a lap two frames short measures −88.
  let band = 0
  for (let f = 3000; f <= 4000; f += 50) band += bin(out, f) ** 2
  const spread = 20 * Math.log10(Math.sqrt(band) / bin(out, 200))
  expect(spread).toBeLessThan(-120)
})
