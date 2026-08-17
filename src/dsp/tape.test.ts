import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildChain } from './build'
import { BLOCK, type StereoBlock } from './stage'

const SR = 48000

function render(overrides: Partial<Controls>, seconds: number) {
  const chain = buildChain(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const l = new Float32Array(blocks * BLOCK)
  const r = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    l.set(io.l.subarray(0, BLOCK), b * BLOCK)
    r.set(io.r.subarray(0, BLOCK), b * BLOCK)
  }
  return { l, r }
}

const rms = (x: Float32Array) =>
  Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)
const db = (x: number) => 20 * Math.log10(x)

// Energy above the midband as a fraction of the whole, via a first-difference
// high pass. Enough to rank two renders by brightness.
function bright(x: Float32Array): number {
  let hp = 0
  for (let i = 1; i < x.length; i++) hp += (x[i]! - x[i - 1]!) ** 2
  return Math.sqrt(hp / x.length) / (rms(x) + 1e-12)
}

function zcr(x: Float32Array): number {
  let n = 0
  for (let i = 1; i < x.length; i++) if (x[i]! >= 0 !== x[i - 1]! >= 0) n++
  return ((n / 2) * SR) / x.length
}

// Pitch wander as a percentage: how much the zero-crossing rate of a steady
// tone drifts window to window.
function wander(x: Float32Array): number {
  const wins: number[] = []
  for (let i = SR; i + 2400 < x.length; i += 2400)
    wins.push(zcr(x.subarray(i, i + 2400)))
  const mean = wins.reduce((a, b) => a + b, 0) / wins.length
  const sd = Math.sqrt(
    wins.reduce((a, b) => a + (b - mean) ** 2, 0) / wins.length,
  )
  return (sd / mean) * 100
}

const SILENT: Partial<Controls> = { chipLevel: 0 }
const TONE: Partial<Controls> = {
  chipLevel: 0,
  oscLevel: 0.7,
  oscAHz: 220,
  oscXmod: 0,
}
const STEADY: Partial<Controls> = { tapeHiss: 0, tapeWow: 0, tapeFlutter: 0 }

test('hiss is a floor of its own — audible with nothing playing, gone when turned down', () => {
  const { l } = render({ ...SILENT, tapeMix: 1, tapeHiss: 1 }, 1)
  const floor = rms(l.subarray(SR / 2))
  expect(db(floor)).toBeGreaterThan(-50)
  expect(db(floor)).toBeLessThan(-30)
  expect(rms(render({ ...SILENT, tapeMix: 1, tapeHiss: 0 }, 1).l)).toBe(0)
})

test('a slower tape hisses louder and darker', () => {
  const at = (speed: number) =>
    render(
      { ...SILENT, tapeMix: 1, tapeHiss: 1, tapeSpeed: speed },
      1,
    ).l.subarray(SR / 2)
  const [slow, mid, fast] = [at(0), at(1), at(2)]
  expect(rms(slow)).toBeGreaterThan(rms(mid))
  expect(rms(mid)).toBeGreaterThan(rms(fast))
  expect(bright(slow)).toBeLessThan(bright(mid))
  expect(bright(mid)).toBeLessThan(bright(fast))
})

test('speed sets how much top end survives the head gap', () => {
  const at = (speed: number) =>
    bright(
      render(
        { ...TONE, ...STEADY, tapeMix: 1, tapeSpeed: speed },
        1,
      ).l.subarray(SR / 2),
    )
  expect(at(0)).toBeLessThan(at(1))
  expect(at(1)).toBeLessThan(at(2))
  expect(at(2)).toBeLessThan(
    bright(render({ ...TONE, ...STEADY }, 1).l.subarray(SR / 2)),
  )
})

// At 15 ips the head gap already sits past the programme, so bias can't work
// through the gap corner alone — it needs its own record tilt or the knob
// inverts at the fast speed.
test('bias runs bright to dull at every speed', () => {
  for (const speed of [0, 1, 2]) {
    const steps = [-1, -0.5, 0, 0.5, 1].map(bias =>
      bright(
        render(
          { ...TONE, ...STEADY, tapeMix: 1, tapeSpeed: speed, tapeBias: bias },
          1,
        ).l.subarray(SR / 2),
      ),
    )
    for (let i = 1; i < steps.length; i++)
      expect(steps[i]!).toBeLessThan(steps[i - 1]!)
  }
})

test('record level compresses without running away — makeup holds it near unity', () => {
  const dry = rms(render({ ...TONE, ...STEADY }, 1).l.subarray(SR / 2))
  for (const drive of [-12, -6, 0, 6, 12, 15]) {
    const wet = rms(
      render(
        { ...TONE, ...STEADY, tapeMix: 1, tapeDrive: drive },
        1,
      ).l.subarray(SR / 2),
    )
    expect(Math.abs(db(wet / dry))).toBeLessThan(4)
  }
})

test('the transport wobbles the pitch, and holds it dead steady when wound down', () => {
  const at = (w: number) =>
    wander(
      render(
        {
          ...TONE,
          tapeHiss: 0,
          tapeMix: 1,
          tapeWow: w,
          tapeFlutter: w,
          tapeSpeed: 0,
        },
        4,
      ).l,
    )
  expect(at(0)).toBe(0)
  expect(at(0.3)).toBeGreaterThan(0.3)
  expect(at(1)).toBeGreaterThan(at(0.3))
  expect(at(1)).toBeLessThan(3)
})

test('dropouts dip the level, and shed highs on the way down', () => {
  const quietest = (drop: number) => {
    const { l } = render({ ...TONE, ...STEADY, tapeMix: 1, tapeDrop: drop }, 6)
    let min = Infinity
    for (let i = SR; i + 1200 < l.length; i += 600)
      min = Math.min(min, rms(l.subarray(i, i + 1200)))
    return min
  }
  expect(db(quietest(0.5) / quietest(0))).toBeLessThan(-4)
  expect(db(quietest(1) / quietest(0))).toBeLessThan(-10)
})

test('print-through leaves a ghost one spool wrap behind the signal', () => {
  const ghost = (print: number) => {
    const chain = buildChain(SR)
    const io: StereoBlock = {
      l: new Float32Array(BLOCK),
      r: new Float32Array(BLOCK),
      n: BLOCK,
    }
    const on = packParams({
      ...DEFAULT_CONTROLS,
      ...TONE,
      ...STEADY,
      tapeMix: 1,
      tapePrint: print,
    })
    const off = packParams({
      ...DEFAULT_CONTROLS,
      ...SILENT,
      oscLevel: 0,
      tapeMix: 1,
      tapeHiss: 0,
      tapePrint: print,
    })
    const blocks = Math.ceil((1.5 * SR) / BLOCK)
    const out = new Float32Array(blocks * BLOCK)
    for (let b = 0; b < blocks; b++) {
      chain.process(io, b * BLOCK < 0.2 * SR ? on : off)
      out.set(io.l.subarray(0, BLOCK), b * BLOCK)
    }
    // 7½ ips wraps in 450 ms; the burst ends at 200 ms
    return rms(out.subarray(Math.floor(0.62 * SR), Math.floor(0.68 * SR)))
  }
  expect(db(ghost(1))).toBeGreaterThan(-45)
  expect(db(ghost(1))).toBeLessThan(-25)
  expect(db(ghost(0))).toBeLessThan(-100)
})

test('azimuth error collapses badly to mono', () => {
  const collapse = (az: number) => {
    const { l, r } = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeAzimuth: az },
      1,
    )
    const mono = new Float32Array(l.length)
    for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i]! + r[i]!)
    return db(rms(mono.subarray(SR / 2)) / rms(l.subarray(SR / 2)))
  }
  expect(Math.abs(collapse(0))).toBeLessThan(0.5)
  expect(collapse(1)).toBeLessThan(-2)
})

test('the machine at rest colours but does not wreck the signal', () => {
  const dry = render({ chipLevel: 0.5, ...STEADY }, 2)
  const wet = render(
    { chipLevel: 0.5, ...STEADY, tapeMix: 1, tapeDrive: 0, tapeSpeed: 2 },
    2,
  )
  const n = 60000
  const lat = Math.round(0.01 * SR)
  const err = new Float32Array(n)
  for (let i = 0; i < n; i++)
    err[i] = wet.l[SR / 2 + i + lat]! - dry.l[SR / 2 + i]!
  expect(db(rms(err) / rms(dry.l.subarray(SR / 2, SR / 2 + n)))).toBeLessThan(
    -12,
  )
})

test('tape off leaves the board bit-identical', () => {
  const look: Partial<Controls> = { chipLevel: 0.6, dlyMix: 0.3, revMix: 0.2 }
  expect(render({ ...look, tapeMix: 0 }, 1).l).toEqual(render(look, 1).l)
})
