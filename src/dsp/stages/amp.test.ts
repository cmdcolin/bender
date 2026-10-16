import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { BLOCK, type Ctx } from '../stage'
import { SR, bin, makeIo, renderStereo, rms, sine } from '../testRender'
import { LATENCY } from '../util/halfband'
import { mulberry32 } from '../util/rng'
import {
  AMP_CAB,
  AMP_VOICE,
  Amp,
  stackAnalog,
  stackDigital,
  type StackParts,
} from './amp'

const FENDER: StackParts = {
  r1: 250e3,
  r2: 1e6,
  r3: 25e3,
  r4: 56e3,
  c1: 250e-12,
  c2: 20e-9,
  c3: 20e-9,
}

const MARSHALL: StackParts = {
  r1: 220e3,
  r2: 1e6,
  r3: 25e3,
  r4: 33e3,
  c1: 470e-12,
  c2: 22e-9,
  c3: 22e-9,
}

type Z = [number, number]

const zmul = (a: Z, b: Z): Z => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
]

const zdiv = (a: Z, b: Z): Z => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}

// The stack as the circuit it is, solved node by node at one frequency: a
// treble cap from the input into the top of the treble pot, whose wiper is the
// output; the slope resistor into the bass cap; the bass pot as a rheostat; the
// mid cap into the wiper of a mid pot that stands on ground. Nothing here
// shares a line with the closed forms in amp.ts, so agreement is the proof that
// those are the circuit and not a remembered formula.
function netlist(p: StackParts, t: number, m: number, l: number, hz: number) {
  const s: Z = [0, 2 * Math.PI * hz]
  const A = 1
  const OUT = 2
  const B = 3
  const P = 4
  const U = 5
  const W = 6
  const IN = -1
  const n = 6
  const y: Z[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => [0, 0] as Z),
  )
  const rhs: Z[] = Array.from({ length: n }, () => [0, 0] as Z)
  const stamp = (a: number, b: number, g: Z) => {
    for (const [i, j, sign] of [
      [a, a, 1],
      [b, b, 1],
      [a, b, -1],
      [b, a, -1],
    ] as const) {
      if (i > 0 && j > 0) {
        y[i - 1]![j - 1]![0] += sign * g[0]
        y[i - 1]![j - 1]![1] += sign * g[1]
      }
    }
    if (a === IN && b > 0) {
      rhs[b - 1]![0] += g[0]
      rhs[b - 1]![1] += g[1]
    }
  }
  const res = (a: number, b: number, r: number) => stamp(a, b, [1 / r, 0])
  const cap = (a: number, b: number, c: number) => stamp(a, b, zmul(s, [c, 0]))
  cap(IN, A, p.c1)
  res(A, OUT, (1 - t) * p.r1 + 1e-3)
  res(OUT, B, t * p.r1 + 1e-3)
  cap(P, B, p.c2)
  res(IN, P, p.r4)
  res(B, U, l * p.r2 + 1e-3)
  res(U, W, (1 - m) * p.r3 + 1e-3)
  res(W, 0, m * p.r3 + 1e-3)
  cap(W, P, p.c3)
  const aug = y.map((row, i) => [...row, rhs[i]!])
  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let r = i + 1; r < n; r++)
      if (Math.hypot(...aug[r]![i]!) > Math.hypot(...aug[pivot]![i]!)) pivot = r
    ;[aug[i], aug[pivot]] = [aug[pivot]!, aug[i]!]
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = zdiv(aug[r]![i]!, aug[i]![i]!)
      for (let c = i; c <= n; c++) {
        const d = zmul(f, aug[i]![c]!)
        aug[r]![c]![0] -= d[0]
        aug[r]![c]![1] -= d[1]
      }
    }
  }
  return Math.hypot(...zdiv(aug[OUT - 1]![n]!, aug[OUT - 1]![OUT - 1]!))
}

function closedForm(
  p: StackParts,
  t: number,
  m: number,
  l: number,
  hz: number,
) {
  const { b, a } = stackAnalog(p, t, m, l)
  const w = 2 * Math.PI * hz
  const poly = (q: readonly number[]): Z => {
    let re = 0
    let im = 0
    for (let k = 0; k < q.length; k++) {
      re += q[k]! * w ** k * Math.cos((k * Math.PI) / 2)
      im += q[k]! * w ** k * Math.sin((k * Math.PI) / 2)
    }
    return [re, im]
  }
  return Math.hypot(...zdiv(poly(b), poly(a)))
}

test('the tone stack is the circuit: closed forms agree with a node-by-node solve', () => {
  const rng = mulberry32(0xa3c1)
  for (const parts of [FENDER, MARSHALL]) {
    for (let i = 0; i < 40; i++) {
      const t = rng()
      const m = rng()
      const l = rng() ** 2
      for (const hz of [30, 90, 250, 700, 1500, 4000, 12000]) {
        const want = netlist(parts, t, m, l, hz)
        const got = closedForm(parts, t, m, l, hz)
        expect(Math.abs(got - want) / want).toBeLessThan(1e-4)
      }
    }
  }
})

test('the stack is passive: nothing it passes is louder than what went in', () => {
  const rng = mulberry32(0x57ac)
  for (const parts of [FENDER, MARSHALL]) {
    for (let i = 0; i < 60; i++) {
      const t = rng()
      const m = rng()
      const l = rng() ** 2
      for (let hz = 20; hz < 20000; hz *= 1.4)
        expect(closedForm(parts, t, m, l, hz)).toBeLessThan(1)
    }
  }
})

test('mid takes the scoop out of the middle, treble opens the top and bass the bottom', () => {
  const at = (t: number, m: number, l: number, hz: number) =>
    20 * Math.log10(closedForm(FENDER, t, m, l, hz))
  expect(at(0.5, 1, 0.25, 800) - at(0.5, 0, 0.25, 800)).toBeGreaterThan(8)
  expect(at(1, 0.5, 0.25, 4000) - at(0, 0.5, 0.25, 4000)).toBeGreaterThan(8)
  expect(at(0.5, 0.5, 1, 80) - at(0.5, 0.5, 0, 80)).toBeGreaterThan(5)
  const middle = at(0.5, 0.5, 0.25, 600)
  expect(middle).toBeLessThan(at(0.5, 0.5, 0.25, 60) - 5)
  expect(middle).toBeLessThan(at(0.5, 0.5, 0.25, 8000) - 3)
})

test('the digital stack follows the analogue one through the band the amp uses', () => {
  const k = new Float64Array(7)
  for (const parts of [FENDER, MARSHALL]) {
    stackDigital(parts, 0.6, 0.3, 0.2, 2 * SR, k)
    for (const hz of [60, 200, 800, 2000, 5000]) {
      const w = (2 * Math.PI * hz) / (2 * SR)
      const response = (c: number[]): Z => {
        let re = 0
        let im = 0
        c.forEach((v, n) => {
          re += v * Math.cos(n * w)
          im -= v * Math.sin(n * w)
        })
        return [re, im]
      }
      const got = Math.hypot(
        ...zdiv(
          response([k[0]!, k[1]!, k[2]!, k[3]!]),
          response([1, k[4]!, k[5]!, k[6]!]),
        ),
      )
      const want = closedForm(parts, 0.6, 0.3, 0.2, hz)
      expect(Math.abs(20 * Math.log10(got / want))).toBeLessThan(0.3)
    }
  }
})

const look: Partial<Controls> = {
  chipLevel: 0,
  sampleLevel: 1,
  sampleMode: 1,
  ampMix: 1,
  ampCab: AMP_CAB.direct,
}

function take(
  buf: Float32Array,
  over: Partial<Controls>,
  seconds: number,
): Float32Array {
  const { l } = renderStereo({ ...look, ...over }, seconds, b =>
    b.sampler.setBuffer(buf),
  )
  return l
}

const tone = (hz: number, amp: number, over: Partial<Controls> = {}) =>
  take(sine(hz, 4, amp), over, 1.5).subarray(SR * 0.5)

function thd(x: Float32Array, hz: number): number {
  let h = 0
  for (let k = 2; k <= 9; k++) h += bin(x, hz * k) ** 2
  return Math.sqrt(h) / bin(x, hz)
}

const db = (a: number, b: number) => 20 * Math.log10(a / b)

test('the gain knob walks a note from clean through crunch to saturation', () => {
  for (const ampVoice of [AMP_VOICE.fender, AMP_VOICE.marshall]) {
    const at = (ampGain: number) =>
      thd(tone(400, 0.1, { ampVoice, ampGain, ampMaster: 0.4 }), 400)
    const [clean, crunch, lead] = [at(0), at(0.6), at(1)]
    expect(clean).toBeLessThan(0.03)
    expect(crunch).toBeGreaterThan(3 * clean)
    expect(lead).toBeGreaterThan(crunch)
    expect(lead).toBeGreaterThan(0.2)
  }
})

test('the marshall breaks up where the fender is still clean', () => {
  const at = (ampVoice: number) =>
    thd(tone(400, 0.05, { ampVoice, ampGain: 0.75, ampMaster: 0.3 }), 400)
  expect(at(AMP_VOICE.marshall)).toBeGreaterThan(2 * at(AMP_VOICE.fender))
})

test('the two channels of a mono take stay the same signal', () => {
  const { l, r } = renderStereo({ ...look, ampGain: 0.8 }, 0.8, b =>
    b.sampler.setBuffer(sine(300, 2, 0.2)),
  )
  expect([...l]).toEqual([...r])
})

// Harmonics past the half-band's stop band, 28 kHz, would fold back into the
// audible range if the stages ran at the board's own rate. Here they fold at
// the doubled rate and the filter takes them out first.
test('even a hard-driven stage keeps its aliases a long way down', () => {
  for (const hz of [5900, 4300]) {
    const x = take(
      sine(hz, 4, 0.3),
      { ampVoice: AMP_VOICE.marshall, ampGain: 1, ampMaster: 0.8 },
      1.5,
    ).subarray(SR * 0.5)
    const f = bin(x, hz)
    for (let k = Math.ceil(28000 / hz); k <= 10; k++) {
      const folded = Math.abs(((hz * k + SR / 2) % SR) - SR / 2)
      if (folded < 20000) expect(db(bin(x, folded), f)).toBeLessThan(-48)
    }
  }
})

// Cold bias leaves both tubes near cutoff around zero crossing, so the
// crossover grit is loudest on the quietest notes and gone when the pair is
// held conducting.
test('a cold bias adds crossover grit to a quiet note that a hot one does not', () => {
  const at = (ampBias: number) =>
    thd(tone(400, 0.01, { ampGain: 0.25, ampMaster: 0.7, ampBias }), 400)
  expect(at(0)).toBeGreaterThan(8 * at(1))
})

// A conducting grid charges the coupling cap, which bleeds back through the grid
// leak: a hard chord leaves the stage squashed for a moment, and it comes back
// under the note.
test('a loud burst leaves the next quiet note squashed, and it recovers', () => {
  const buf = new Float32Array(4 * SR)
  buf.set(sine(300, 1, 0.6).subarray(0, SR / 2))
  buf.set(sine(300, 4, 0.03).subarray(0, 3 * SR), SR / 2)
  const o = take(buf, { ampGain: 0.8, ampMaster: 0.3, ampSag: 0 }, 3)
  const w = (a: number, b: number) => rms(o.subarray(a * SR, b * SR))
  const settled = w(2.5, 2.55)
  expect(w(0.51, 0.56)).toBeLessThan(0.8 * settled)
  expect(w(0.9, 0.95)).toBeGreaterThan(0.97 * settled)
})

test('the supply sags under a loud held note', () => {
  const at = (ampSag: number) => {
    const o = take(
      sine(200, 4, 0.5),
      {
        ampGain: 0.6,
        ampMaster: 0.9,
        ampSag,
      },
      1,
    )
    const w = (a: number, b: number) => rms(o.subarray(a * SR, b * SR))
    return db(w(0.4, 0.5), w(0.01, 0.04))
  }
  expect(at(0)).toBeGreaterThan(-0.2)
  expect(at(1)).toBeLessThan(at(0) - 0.5)
})

// The board's supply droop is the second thing pulling the rail down, whether
// the amp is loaded or not.
test('the board’s dying supply drags the amp’s rail with it', () => {
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...look,
    ampGain: 0.6,
    ampMaster: 0.9,
    ampSag: 0.5,
  })
  const level = (droop: number) => {
    const amp = new Amp(SR)
    const io = makeIo()
    const ctx = { droop: new Float32Array(BLOCK).fill(droop) } as unknown as Ctx
    const out: number[] = []
    for (let b = 0; b < 100; b++) {
      for (let i = 0; i < BLOCK; i++) {
        io.l[i] = io.r[i] =
          0.5 * Math.sin((2 * Math.PI * 200 * (b * BLOCK + i)) / SR)
      }
      amp.process(io, p, ctx)
      if (b >= 50) out.push(...io.l)
    }
    return rms(Float32Array.from(out))
  }
  expect(level(0.8)).toBeLessThan(0.95 * level(0))
})

// The speaker is the difference between a cab and no cab at a level where
// nothing upstream is clipping, so what comes out is only the cabinet.
test('the cabinets roll off steeply above 5 kHz, and the closed one keeps more bass', () => {
  const level = (hz: number, ampCab: number) =>
    rms(tone(hz, 0.01, { ampGain: 0, ampMaster: 0.7, ampCab }))
  const rel = (hz: number, cab: number) =>
    db(level(hz, cab), level(hz, AMP_CAB.direct))
  for (const cab of [AMP_CAB.open, AMP_CAB.closed]) {
    expect(Math.abs(rel(400, cab))).toBeLessThan(2)
    expect(rel(10000, cab)).toBeLessThan(-20)
    expect(rel(2400, cab)).toBeGreaterThan(rel(400, cab) + 1.5)
  }
  expect(rel(80, AMP_CAB.closed)).toBeGreaterThan(rel(80, AMP_CAB.open) + 1.5)
})

// A wet path that arrives late against a dry one is a comb filter, so the dry
// is held back by what the oversampling costs.
test('the dry signal is delayed to line up with the oversampled wet path', () => {
  const buf = sine(1000, 2, 0.3)
  const dry = take(buf, { ampMix: 0 }, 0.5)
  const nearlyDry = take(buf, { ampMix: 1e-6 }, 0.5)
  for (let i = 2000; i < 4000; i++)
    expect(Math.abs(nearlyDry[i]! - dry[i - LATENCY]!)).toBeLessThan(1e-3)
})
