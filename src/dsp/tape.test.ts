import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { bin, renderBender, sine } from './testRender'
import { packParams } from '../engine/params'
import { buildChain, type BuiltChain } from './build'
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

// Where a steady tone crosses zero going up, to a fraction of a sample. Counting
// whole crossings in a window instead quantises the pitch to one crossing in
// 2400 samples, which at 220 Hz is 0.45% — coarser than the wander this file
// asserts on, so a transport wobbling by a third of a percent read as either
// zero or twice the truth depending on where the crossings happened to land.
function crossings(x: Float32Array): number[] {
  const t: number[] = []
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1]!
    const b = x[i]!
    if (a <= 0 && b > 0) t.push(a === b ? i : i - 1 + -a / (b - a))
  }
  return t
}

// Pitch wander as a percentage: how much the period of a steady tone drifts
// over the render, measured across eight cycles at a time.
function wander(x: Float32Array): number {
  const t = crossings(x.subarray(SR))
  const hz: number[] = []
  for (let i = 8; i < t.length; i++) {
    const f = (8 * SR) / (t[i]! - t[i - 8]!)
    if (Number.isFinite(f)) hz.push(f)
  }
  if (hz.length === 0) return 0
  const mean = hz.reduce((a, b) => a + b, 0) / hz.length
  const sd = Math.sqrt(hz.reduce((a, b) => a + (b - mean) ** 2, 0) / hz.length)
  return (sd / mean) * 100
}

// What the machine does to one frequency, in dB against the same tone with the
// tape out of circuit — so whatever the source did cancels and what is left is
// the machine. The sampler is the one thing on the board that plays a clean
// sine, and a whole number of cycles in a one-second loop comes round without a
// splice to hear.
function response(hz: number, over: Partial<Controls> = {}): number {
  const board: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    sampleLevel: 1,
    tapeHiss: 0,
    tapeWow: 0,
    tapeFlutter: 0,
    tapeDrive: 0,
    tapeHyst: 0,
    tapeBump: 0,
    ...over,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(hz, 1, 0.06))
  const at = (mix: number) =>
    bin(renderBender({ ...board, tapeMix: mix }, 2, load).subarray(SR), hz)
  return db(at(1) / at(0))
}

const SILENT: Partial<Controls> = { chipLevel: 0, drumLevel: 0 }
const TONE: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
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

// Record and replay are one shelf and its inverse. Run both from the same
// corner — which is the obvious thing to write and what this did for a long
// time — and they do not cancel: what is left over is a couple of dB sitting on
// 1.2 kHz, so a machine at rest handed back every board with a presence lift
// nobody had asked it for. Below the head gap there is nothing left for the tape
// to do, so a tone down there has to come back the level it went in at.
test('the record and replay curves cancel below the head gap', () => {
  for (const hz of [50, 120, 300, 700, 1200, 2000])
    expect(Math.abs(response(hz, { tapeSpeed: 2 })), `${hz} Hz`).toBeLessThan(
      0.4,
    )
})

// Gap loss is flat and then a cliff — a wavelength either fits across the gap
// or it cancels in it. A single pole is a tone control instead: it starts
// taking the top off the midrange an octave early and still passes 20 kHz at
// 3¾ ips, where a real machine has nothing up there at all.
test('the head gap is a cliff rather than a tone control', () => {
  const slow = (hz: number) => response(hz, { tapeSpeed: 0 })
  const [flat, knee, over, gone] = [
    slow(2000),
    slow(4000),
    slow(8000),
    slow(16000),
  ]
  expect(Math.abs(flat)).toBeLessThan(1)
  expect(gone).toBeLessThan(-9)
  // An octave further past the knee costs more than the octave before it did.
  expect(gone - over).toBeLessThan(over - knee)
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
  // Wound down it is steady to the floor of the measurement itself, which is
  // where a sample-rate estimate of a 220 Hz period bottoms out.
  expect(at(0)).toBeLessThan(0.05)
  expect(at(0.3)).toBeGreaterThan(0.2)
  // Reading the period rather than counting crossings resolves the two apart,
  // so the knob can be held to roughly what it says rather than merely to more.
  expect(at(1)).toBeGreaterThan(at(0.3) * 2)
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

// Warmth, as against crunch. A symmetrical clipper makes the third harmonic and
// the fifth and never the second — so the second is the whole of what the
// hysteresis knob is for, and a square wave is the test that cannot be fooled:
// it has no even harmonics of its own to borrow one from.
test('hysteresis puts a second harmonic on a wave that has none', () => {
  const at = (tapeHyst: number) => {
    const { l } = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeDrive: 6, tapeHyst },
      2,
    )
    const played = l.subarray(SR)
    return bin(played, 440) / bin(played, 220)
  }
  expect(db(at(0))).toBeLessThan(-60)
  expect(db(at(0.3))).toBeGreaterThan(-40)
  expect(at(1)).toBeGreaterThan(at(0.3))
  expect(at(0.3)).toBeGreaterThan(at(0.1))
})

// It rides the level rather than the note: the same board played quietly is the
// same board without the bloom, which is what separates this from a knob that
// simply adds a harmonic.
test('the bloom comes up with how hard the tape is driven', () => {
  const at = (oscLevel: number) => {
    const { l } = render(
      { ...TONE, ...STEADY, oscLevel, tapeMix: 1, tapeHyst: 1 },
      2,
    )
    const played = l.subarray(SR)
    return bin(played, 440) / bin(played, 220)
  }
  expect(at(0.7)).toBeGreaterThan(at(0.08) * 2)
})

// The record level makes its own gain up on the way out, so a head driven twice
// as hard plays back at about the same level — which is why how much the medium
// is carrying has to be read off what the record head wrote and not off what
// came back from the replay head. Read off the playback side, the knob ran
// backwards: the harder the tape was hit the less it bloomed.
//
// Right at the top it does turn over, and that is the medium rather than the
// model — past saturation both halves of the wave are flat against the same
// ceiling and there is no asymmetry left to hear. What has to hold is the climb
// through the range the knob is actually used over, and that the top of it is
// still nothing like the bottom.
test('the bloom climbs with the record level rather than falling away', () => {
  const at = (tapeDrive: number) => {
    const { l } = render(
      { ...TONE, ...STEADY, tapeMix: 1, tapeHyst: 0.3, tapeDrive },
      2,
    )
    const played = l.subarray(SR)
    return bin(played, 440) / bin(played, 220)
  }
  const [cold, mid, stock] = [at(-12), at(0), at(6)]
  expect(cold).toBeLessThan(mid)
  expect(mid).toBeLessThan(stock)
  expect(db(stock / cold)).toBeGreaterThan(15)
  expect(at(15)).toBeGreaterThan(cold)
})

// Turned off, the head is the symmetrical clipper it always was — so a board
// that never asked for warmth is bit-identical to the machine before it had a
// knob for it.
test('hysteresis at zero leaves the record head symmetrical', () => {
  const board: Partial<Controls> = {
    ...TONE,
    ...STEADY,
    tapeMix: 1,
    tapeDrive: 12,
  }
  const off = render({ ...board, tapeHyst: 0 }, 1).l
  expect(render({ ...board, tapeHyst: 0.5 }, 1).l).not.toEqual(off)
  const quiet = render({ ...board, tapeHyst: 0, oscLevel: 0 }, 1).l
  expect(rms(quiet)).toBe(0)
})

// The bump is a resonance the head has by being a head, so its frequency is the
// speed's and only its size is yours — and stock has to be exactly the fixed
// amount the machine was built with, or every board that ever used the tape
// comes back a different board.
test('the head bump is the low end, and its stock is the machine', () => {
  const low = (tapeBump: number) => {
    const { l } = render(
      {
        ...SILENT,
        oscLevel: 0.5,
        oscAHz: 38,
        oscShape: 1,
        ...STEADY,
        tapeMix: 1,
        tapeSpeed: 1,
        tapeHyst: 0,
        tapeBump,
      },
      2,
    )
    return bin(l.subarray(SR), 38)
  }
  expect(low(0)).toBeLessThan(low(0.5))
  expect(low(0.5)).toBeLessThan(low(1.5))
  expect(DEFAULT_CONTROLS.tapeBump).toBe(0.5)
})

test('tape off leaves the board bit-identical', () => {
  const look: Partial<Controls> = { chipLevel: 0.6, dlyMix: 0.3, revMix: 0.2 }
  expect(render({ ...look, tapeMix: 0 }, 1).l).toEqual(render(look, 1).l)
})
