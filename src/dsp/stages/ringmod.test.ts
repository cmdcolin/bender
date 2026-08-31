import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { IDX, packParams } from '../../engine/params'
import { buildBender, type BuiltChain } from '../build'
import { DEST } from '../modbus'
import { BLOCK, type StereoBlock } from '../stage'
import { spectrum } from '../spectrum'
import { RING_TRACK } from './ringmod'
import { rms, SR } from '../testRender'

// A3, the chip's semitone zero, and the note every tracking case here is
// judged against.
const A3 = 0
const F0 = 220

const RING: Partial<Controls> = {
  bendSlot0: 1,
  ringMix: 1,
  chipLevel: 1,
  drumLevel: 0,
}

const track = (name: string) => RING_TRACK.indexOf(name)

// A key held through the board, both channels kept: the ring mod is the one
// bend whose whole point is what it does to a note it is given, and the stem
// meters only carry the left.
//
// `each` is the gesture a board set up before the render cannot make — a hand
// pulling a wire out of the bay, or the panic button.
function play(
  overrides: Partial<Controls>,
  seconds = 1,
  note: number | null = A3,
  each?: (built: BuiltChain, block: number, p: Float32Array) => void,
) {
  const built = buildBender(SR)
  if (note !== null) built.toyChip.noteOn(note)
  const p = packParams({ ...DEFAULT_CONTROLS, ...RING, ...overrides })
  const io: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const l = new Float32Array(blocks * BLOCK)
  const r = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    each?.(built, b, p)
    built.chain.process(io, p)
    l.set(io.l.subarray(0, BLOCK), b * BLOCK)
    r.set(io.r.subarray(0, BLOCK), b * BLOCK)
  }
  return { l, r }
}

// How much of a take sits on a harmonic grid of `step`. A note the ring mod
// left in tune reads near one; a note it moved off its own harmonics reads near
// zero, whatever else happened to the timbre.
function onGrid(x: Float32Array, step: number): number {
  const total = x.reduce((a, v) => a + v * v, 0) / x.length
  let on = 0
  for (let k = 1; k * step < 16000; k++) {
    const hz = k * step
    let re = 0
    let im = 0
    for (let i = 0; i < x.length; i++) {
      const w = (2 * Math.PI * hz * i) / SR
      re += x[i]! * Math.cos(w)
      im += x[i]! * Math.sin(w)
    }
    on += (2 * (re * re + im * im)) / (x.length * x.length)
  }
  return on / (total + 1e-18)
}

/** How much the two channels agree: one is mono, zero is uncorrelated. */
function corr(l: Float32Array, r: Float32Array): number {
  let ll = 0
  let rr = 0
  let lr = 0
  for (let i = 0; i < l.length; i++) {
    ll += l[i]! * l[i]!
    rr += r[i]! * r[i]!
    lr += l[i]! * r[i]!
  }
  return lr / (Math.sqrt(ll * rr) + 1e-18)
}

const held = (x: Float32Array) => x.subarray(SR / 4, SR / 4 + SR / 2)

test('the stage stays out of the path until the mix is up', () => {
  const off = play({ ringMix: 0 })
  const on = play({ ringMix: 1 })
  expect(rms(off.l)).toBeGreaterThan(0)
  expect(off.l).not.toEqual(on.l)
})

// The whole reason the stage has a reputation: a carrier that stands still
// moves every partial by the same number of hertz, so none of them lands where
// it started and the note is gone even though the level barely moved.
test('a carrier that stands still takes the note off its own harmonics', () => {
  const dry = play({ ringMix: 0 })
  expect(onGrid(held(dry.l), F0)).toBeGreaterThan(0.9)

  for (const ringHz of [300, 1700]) {
    const wet = play({ ringHz })
    expect(onGrid(held(wet.l), F0)).toBeLessThan(0.01)
    // and it is not simply quieter — the energy went somewhere else
    expect(rms(wet.l)).toBeGreaterThan(0.5 * rms(dry.l))
  }
})

test('a carrier locked to the note at a whole ratio leaves it in tune', () => {
  for (const name of ['unison', 'octave', 'oct+5th', 'two oct']) {
    const wet = play({ ringTrack: track(name) })
    expect(onGrid(held(wet.l), F0)).toBeGreaterThan(0.9)
  }
})

// A half ratio puts the sidebands on a grid an octave under the note: nothing
// of the original fundamental survives, and what replaces it is still a note.
test('a half ratio writes a new fundamental an octave under the note', () => {
  for (const name of ['sub', 'fifth']) {
    const wet = play({ ringTrack: track(name) })
    expect(onGrid(held(wet.l), F0)).toBeLessThan(0.01)
    expect(onGrid(held(wet.l), F0 / 2)).toBeGreaterThan(0.9)
  }
})

test('the tritone lands on no grid at all, which is the point of it', () => {
  const wet = play({ ringTrack: track('tritone') })
  expect(onGrid(held(wet.l), F0)).toBeLessThan(0.01)
  expect(onGrid(held(wet.l), F0 / 2)).toBeLessThan(0.01)
})

// Tracking is about the note, so it has to follow one. Two different keys under
// the same setting have to come out ringing at two different rates.
test('the carrier follows the key rather than sitting where it was', () => {
  const at = (semitone: number) =>
    play({ ringTrack: track('octave') }, 1, semitone).l
  const low = at(0)
  const high = at(12)
  expect(onGrid(held(low), F0)).toBeGreaterThan(0.9)
  expect(onGrid(held(high), F0 * 2)).toBeGreaterThan(0.9)
  // the octave up is a different take, not the same one relabelled
  expect(spectrum(high, SR).centroid).toBeGreaterThan(
    spectrum(low, SR).centroid,
  )
})

// Nothing stamps the key line but the toy, so a board sounding the FM chip has
// to fall back on the knob rather than parking the carrier at zero.
test('with nothing on the key line the carrier stays on its own knob', () => {
  const wet = play(
    { chipLevel: 0, noiseLevel: 0.5, ringTrack: track('octave'), ringHz: 700 },
    0.5,
    null,
  )
  expect(rms(wet.l)).toBeGreaterThan(0.01)
})

test('the two channels come out a quarter turn apart', () => {
  const wet = play({ ringHz: 430 })
  expect(Math.abs(corr(held(wet.l), held(wet.r)))).toBeLessThan(0.2)

  // and folded to mono nothing cancels: the pair is one carrier 45° over
  const mono = held(wet.l).map((v, i) => 0.5 * (v + held(wet.r)[i]!))
  expect(rms(mono)).toBeGreaterThan(0.5 * rms(held(wet.l)))
})

// Sub-audio, the same quarter turn is what makes the tremolo pan instead of
// pump — the two channels dip at different times rather than together.
test('a sub-audio carrier pans rather than pumping both channels at once', () => {
  const wet = play({ ringHz: 3 }, 2)
  expect(corr(wet.l, wet.r)).toBeLessThan(0.5)
})

test('the mic carrier still overrides the oscillator', () => {
  const quiet = play({ ringHz: 430, micPatch: 4 })
  // nothing is coming in the mic, so the carrier is flat zero and the wet path
  // is silence — which at full mix is the whole output
  expect(rms(quiet.l)).toBeLessThan(1e-6)
})

// The one thing a multiply cannot do. Sine and square put out the same shape at
// any level; the bridge stops conducting near zero, so how hard it is driven
// decides how much of the grit comes through.
test('only the diode bridge changes its spectrum with input level', () => {
  const flatnessAt = (ringShape: number, chipLevel: number) => {
    const wet = play({ ringHz: 430, ringShape, chipLevel })
    const x = held(wet.l)
    const level = rms(x) || 1
    return spectrum(
      Float32Array.from(x, v => v / level),
      SR,
    ).flatness
  }
  for (const shape of [0, 1]) {
    expect(flatnessAt(shape, 0.15)).toBeCloseTo(flatnessAt(shape, 1), 2)
  }
  const quiet = flatnessAt(2, 0.15)
  const loud = flatnessAt(2, 1)
  expect(quiet).toBeGreaterThan(loud * 1.3)
})

test('the bridge sits beside the multiply rather than above it', () => {
  const sine = play({ ringHz: 430, ringShape: 0 })
  const dio = play({ ringHz: 430, ringShape: 2 })
  // the trim is not exact on purpose, but a shape switch must not be a jump
  expect(rms(dio.l)).toBeGreaterThan(0.6 * rms(sine.l))
  expect(rms(dio.l)).toBeLessThan(1.8 * rms(sine.l))
  expect(dio.l).not.toEqual(sine.l)
})

// A wire rewrites the rate every sample, so the block after it is unpatched has
// to set the rate again rather than trust what the wire left in the oscillator.
test('the carrier comes back to its knob after a wire comes off it', () => {
  const patch: Partial<Controls> = {
    ringHz: 430,
    mod0Src: 1,
    mod0Dest: DEST.ringHz,
    mod0Depth: 1,
    modLfoHz: 4,
  }
  expect(play(patch).l).not.toEqual(play({ ringHz: 430 }).l)

  const pulled = play(patch, 1, A3, (_, b, p) => {
    if (b < 200) return
    p[IDX.mod0Depth] = 0
    p[IDX.mod0Src] = 0
  })
  // back on the knob, which is a 430 Hz carrier on a 220 Hz note: the sidebands
  // land where the unwired take's do
  const after = pulled.l.subarray(300 * BLOCK)
  expect(onGrid(after, F0)).toBeLessThan(0.01)
  expect(rms(after)).toBeGreaterThan(0.01)
})

test('a panic leaves nothing of the last note in the carrier', () => {
  const wet = play({ ringTrack: track('two oct') }, 1, A3, (built, b) => {
    if (b !== 100) return
    built.chain.panic()
    built.toyChip.noteOn(A3)
  })
  expect(onGrid(wet.l.subarray(200 * BLOCK), F0)).toBeGreaterThan(0.9)
})
