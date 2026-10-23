import { expect, test } from 'vitest'

import { DEST } from '../modbus.ts'
import { bin, pitchHz, renderBender, rms, sine, tail } from '../testRender.ts'

import type { Controls } from '../../controls.ts'
import type { BuiltChain } from '../build.ts'

const load = (b: BuiltChain) => b.sampler.setBuffer(sine(220, 2))
const look: Partial<Controls> = {
  chipLevel: 0,
  sampleLevel: 1,
  bendSlot0: 8,
  octMix: 1,
  octTrack: 1,
}

test('the divider drops a tracked note an octave per division step', () => {
  const sub = (octDiv: number) =>
    pitchHz(
      tail(renderBender({ ...look, octUp: 0, octSub: 1, octDiv }, 1, load)),
    )
  expect(sub(1)).toBeCloseTo(110, -1)
  expect(sub(2)).toBeCloseTo(55, -1)
})

test('the XOR doubler puts the octave above the note', () => {
  const out = tail(renderBender({ ...look, octUp: 1, octSub: 0 }, 1, load))
  expect(bin(out, 440)).toBeGreaterThan(bin(out, 220) * 2)
  expect(bin(out, 440)).toBeGreaterThan(bin(out, 110) * 2)
})

test('hard bounce swaps between the octave and the sub at the rate', () => {
  const out = tail(
    renderBender(
      { ...look, octUp: 1, octSub: 1, octBounce: 1, octRate: 4 },
      1,
      load,
    ),
    1,
  )
  const quarter = 48000 / 4
  const a = out.subarray(quarter * 0.1, quarter * 0.9)
  const b = out.subarray(quarter * 1.1, quarter * 1.9)
  const subHeavy = (x: Float32Array) => bin(x, 110) / (bin(x, 440) + 1e-9)
  const [lo, hi] = [subHeavy(a), subHeavy(b)].toSorted((x, y) => x - y)
  expect(hi! / lo!).toBeGreaterThan(4)
})

test('a lower Track breaks the divider away from a clean octave', () => {
  const at = (octTrack: number) =>
    tail(renderBender({ ...look, octUp: 0, octTrack, octTone: 8000 }, 1, load))
  const clean = at(1)
  const broken = at(0)
  expect(bin(clean, 110)).toBeGreaterThan(bin(broken, 110))
})

test('a wire on oct chaos does what turning Track down does', () => {
  const wired = tail(
    renderBender(
      {
        ...look,
        octUp: 0,
        octTone: 8000,
        bodyX: 1,
        mod0Src: 5,
        mod0Dest: DEST.octChaos,
        mod0Depth: 1,
      },
      1,
      load,
    ),
  )
  const clean = tail(
    renderBender({ ...look, octUp: 0, octTone: 8000 }, 1, load),
  )
  expect(bin(clean, 110)).toBeGreaterThan(bin(wired, 110))
})

test('the octave at no mix leaves the board as it was', () => {
  const off = renderBender({ ...look, octMix: 0 }, 0.5, load)
  const empty = renderBender({ ...look, bendSlot0: 0 }, 0.5, load)
  expect(rms(off)).toBeGreaterThan(0)
  expect(off).toEqual(empty)
})
