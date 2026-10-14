import { expect, test } from 'vitest'

import { DEST } from '../modbus'
import { magnitudes } from '../spectrum'
import { playHeldKey, render, renderBender, rms, SR } from '../testRender'

import type { Controls } from '../../controls'

const kit = (overrides: Partial<Controls>) =>
  rms(
    renderBender(overrides, 2, built => {
      built.transport.drums = true
    }),
  )

// The kit kicks the amp down its trigger line rather than through the mix: a
// kit barely audible still throws the springs, and the crash is most of what
// the tank hands back.
const look: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0.01,
  revMix: 1,
  revDry: 0,
  revDecayS: 1,
}

test('a drum hit throws the springs against the housing', () => {
  const still = kit(look)
  const kicked = kit({ ...look, revKick: 1 })
  expect(kicked).toBeGreaterThan(10 * still)
})

test('low down the knob only an accent gets through', () => {
  const flat = { ...look, drumAccent: 0 }
  const still = kit(flat)
  expect(kit({ ...flat, revKick: 0.2 })).toBeLessThan(1.5 * still)
  expect(kit({ ...flat, revKick: 0.6 })).toBeGreaterThan(10 * still)
})

// One note into a twenty-second tank, and the tail after it: a static tank
// rings on the same few resonances window after window, which is what Warble
// is there to break up.
function tail(revWarble: number) {
  const x = playHeldKey(
    {
      chipLevel: 0.8,
      drumLevel: 0,
      revMix: 1,
      revDry: 0,
      revDecayS: 20,
      revWarble,
    },
    0,
    0.3,
    4,
  ).subarray(SR)
  const N = 4096
  const frames: Float64Array[] = []
  for (let at = 0; at + N <= x.length; at += N) {
    const m = magnitudes(x, at, N).subarray(0, 256)
    frames.push(m.map(v => v * v))
  }
  return frames
}

const likeness = (a: Float64Array, b: Float64Array) => {
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    ab += a[i]! * b[i]!
    aa += a[i]! ** 2
    bb += b[i]! ** 2
  }
  return ab / Math.sqrt(aa * bb)
}

const steadiness = (frames: Float64Array[]) =>
  frames.slice(1).reduce((s, f, i) => s + likeness(frames[i]!, f), 0) /
  (frames.length - 1)

// Bins holding nine tenths of the tail's power, summed over the whole take.
const spread = (frames: Float64Array[]) => {
  const sum = new Float64Array(frames[0]!.length)
  for (const f of frames) for (let k = 0; k < f.length; k++) sum[k]! += f[k]!
  const p = Array.from(sum).toSorted((a, b) => b - a)
  const total = p.reduce((a, v) => a + v, 0)
  let held = 0
  let bins = 0
  while (held < 0.9 * total) held += p[bins++]!
  return bins
}

test('warble keeps a long tail from ringing on the same notes', () => {
  const still = tail(0)
  const seasick = tail(1)
  expect(steadiness(still)).toBeGreaterThan(0.9)
  expect(steadiness(seasick)).toBeLessThan(0.75)
  expect(spread(seasick)).toBeGreaterThan(3 * spread(still))
})

test('a held wire on the warble is the knob turned there', () => {
  const tank: Partial<Controls> = {
    chipLevel: 0.8,
    revMix: 1,
    revDry: 0,
    revDecayS: 8,
  }
  const wired = render(
    { ...tank, bodyX: 1, mod0Src: 5, mod0Dest: DEST.revWarble, mod0Depth: 0.6 },
    1,
  )
  expect(wired).toEqual(render({ ...tank, revWarble: 0.6 }, 1))
  expect(wired).not.toEqual(render(tank, 1))
})
