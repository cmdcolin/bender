import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import type { BuiltChain } from '../build'
import { IDX } from '../../engine/params'
import { SR, bin, pitchHz, renderBender, rms, sine, tail } from '../testRender'
import { ECHO_MODE } from './echo'

// A one-shot second of tone, listened to over the next one, where the only
// thing still sounding is what came back off the pedal.

const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))

const look: Partial<Controls> = {
  chipLevel: 0,
  sampleLevel: 1,
  sampleMode: 1,
  echoLevel: 1,
  echoMs: 200,
  echoFb: 0.7,
}

test('the repeats come back at the pitch they went in at', () => {
  expect(pitchHz(tail(renderBender(look, 2, load)))).toBeCloseTo(400, -2)
})

// How sharply the wave bends from one sample to the next. A read head landing
// somewhere else leaves the phase where it was and picks it up somewhere new,
// which is a corner rather than a step — a 400 Hz tone spliced at a zero
// crossing barely moves in level and still audibly clicks.
const kink = (x: Float32Array) => {
  let m = 0
  for (let i = 2; i < x.length; i++)
    m = Math.max(m, Math.abs(x[i]! - 2 * x[i - 1]! + x[i - 2]!))
  return m
}

test('moving the time crosses heads rather than jumping one', () => {
  // A hand on the knob a quarter second after the source stopped, and between
  // two laps of what is left, so the only thing happening in the window is the
  // move. The tape machine puts its tap somewhere else and the repeat splices;
  // this crosses to a second head over 25 ms, so the repeat walks to its new
  // spacing with nothing in the wave to hear, at its own pitch.
  const grab = (over: Partial<Controls>, key: 'echoMs' | 'delayMs') => {
    const out = renderBender(over, 2, load, undefined, (_, secs, p) => {
      // 601 rather than 600: 400 Hz fits a whole number of times into both 200
      // and 600 ms, so a tap landing there lands in phase and splices silently.
      if (secs >= 1.25) p[IDX[key]] = 601
    })
    return out.subarray(1.24 * SR, 1.31 * SR)
  }
  const crossed = grab({ ...look, echoMs: 200, echoFb: 0.5 }, 'echoMs')
  const spliced = grab(
    {
      chipLevel: 0,
      sampleLevel: 1,
      sampleMode: 1,
      dlyMix: 1,
      delayMs: 200,
      dlyFb: 0.5,
    },
    'delayMs',
  )
  expect(pitchHz(crossed)).toBeCloseTo(400, -2)
  expect(kink(crossed)).toBeLessThan(0.05 * kink(spliced))
})

test('the analog mode loses its top end as the delay gets longer', () => {
  // One lap each, in the window the repeat lands in, so what is left is the
  // bucket brigade's own bandwidth rather than one setting having had more
  // repeats through the same filter.
  const src = (b: BuiltChain) => {
    const buf = new Float32Array(SR)
    buf.set(sine(3000, 0.1).subarray(0, 0.1 * SR), 0)
    b.sampler.setBuffer(buf)
  }
  const repeat = (ms: number) => {
    const out = renderBender(
      { ...look, echoMode: ECHO_MODE.analog, echoFb: 0, echoMs: ms },
      1.6,
      src,
    )
    const at = (ms / 1000) * SR
    return bin(out.subarray(at, at + 0.1 * SR), 3000)
  }
  expect(repeat(900)).toBeLessThan(0.35 * repeat(150))
})

test('a standard repeat keeps the top end an analog one throws away', () => {
  const src = (b: BuiltChain) => b.sampler.setBuffer(sine(3000, 1))
  const at = (mode: number) =>
    bin(
      tail(renderBender({ ...look, echoMode: mode, echoMs: 500 }, 2, src)),
      3000,
    )
  expect(at(ECHO_MODE.standard)).toBeGreaterThan(3 * at(ECHO_MODE.analog))
})

test('reverse plays each window backwards', () => {
  // Low then high, and silence after — so the window that comes back has the
  // high half in front of the low one, which is the whole of what reverse is.
  const twoTone = (b: BuiltChain) => {
    const buf = new Float32Array(48000)
    buf.set(sine(300, 0.25).subarray(0, 12000), 0)
    buf.set(sine(1200, 0.25).subarray(0, 12000), 12000)
    b.sampler.setBuffer(buf)
  }
  const out = renderBender(
    { ...look, echoFb: 0, echoMs: 500, echoMode: ECHO_MODE.reverse },
    1,
    twoTone,
  )
  const early = out.subarray(0.55 * SR, 0.7 * SR)
  const late = out.subarray(0.8 * SR, 0.95 * SR)
  expect(bin(early, 1200)).toBeGreaterThan(3 * bin(early, 300))
  expect(bin(late, 300)).toBeGreaterThan(3 * bin(late, 1200))
})

test('the effect level is a return rather than a crossfade', () => {
  const dry = rms(renderBender({ ...look, echoLevel: 0.001 }, 0.5, load))
  const wet = rms(renderBender({ ...look, echoLevel: 1 }, 0.5, load))
  expect(wet).toBeGreaterThan(dry)
  expect(rms(renderBender({ ...look, echoLevel: 0 }, 0.5, load))).toBeCloseTo(
    dry,
    2,
  )
})

test('a runaway loop stays bounded', () => {
  const out = renderBender({ ...look, echoFb: 1.1, echoMs: 40 }, 6, load)
  expect(Number.isFinite(rms(out))).toBe(true)
  expect(out.reduce((a, v) => Math.max(a, Math.abs(v)), 0)).toBeLessThan(1.1)
})
