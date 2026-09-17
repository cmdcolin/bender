import { expect, test } from 'vitest'

import { deviation, render, rms } from '../testRender'

test('screech filter self-oscillates past unity resonance', () => {
  const out = render(
    {
      chipLevel: 0,
      crackleAmp: 0.4,
      crackleRate: 20,
      bendSlot0: 6,
      filtMix: 1,
      filtRes: 1.25,
      filtHz: 400,
    },
    2,
  )
  expect(rms(out.subarray(out.length - 4800))).toBeGreaterThan(0.02)
})

const FILT = { bendSlot0: 6, filtMix: 1, filtHz: 700, filtRes: 0.85 }
const diffRms = (a: Float32Array, b: Float32Array) =>
  rms(a.map((v, i) => v - b[i]!))

test('popcorn crackles harder under a loud input', () => {
  const kit = { chipLevel: 0, drumLevel: 0.9, ...FILT }
  const hush = { chipLevel: 0, drumLevel: 0, ...FILT }
  const loud = diffRms(render({ ...kit, filtPop: 1 }, 2), render(kit, 2))
  const idle = diffRms(render({ ...hush, filtPop: 1 }, 2), render(hush, 2))
  expect(loud).toBeGreaterThan(idle * 3)
})

test('an arcing cap breaks up the self-oscillation', () => {
  const osc = {
    chipLevel: 0,
    crackleAmp: 0.4,
    crackleRate: 20,
    ...FILT,
    filtRes: 1.1,
    filtHz: 400,
  }
  const arced = render({ ...osc, filtArc: 0.6 }, 2)
  expect(deviation(arced, render(osc, 2))).toBeGreaterThan(0.5)
})

test('a dirty pot crackles on a sweep and stays clean standing still', () => {
  const still = { chipLevel: 0.7, ...FILT, filtRes: 0.6 }
  const sweep = {
    ...still,
    mod0Src: 1,
    mod0Dest: 0,
    mod0Depth: 0.6,
    modLfoHz: 2,
  }
  const dirty = render({ ...sweep, filtWiper: 1 }, 2)
  expect(deviation(dirty, render(sweep, 2))).toBeGreaterThan(0.2)
  expect(render({ ...still, filtWiper: 1 }, 2)).toEqual(render(still, 2))
})
