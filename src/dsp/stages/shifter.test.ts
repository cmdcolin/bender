import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import type { BuiltChain } from '../build'
import { DEST } from '../modbus'
import { pitchHz, renderBender, sine, tail } from '../testRender'

test('the frequency shifter moves a sine by its shift, both ways', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    bendSlot0: 7,
    shiftMix: 1,
    shiftHz: 300,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 1))
  const up = renderBender({ ...look, shiftDir: 0 }, 1, load)
  const down = renderBender({ ...look, shiftDir: 1 }, 1, load)
  expect(pitchHz(tail(up))).toBeCloseTo(800, -2)
  expect(pitchHz(tail(down))).toBeCloseTo(200, -2)
})

test('a wire onto the shifter moves the shift itself', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    bendSlot0: 7,
    shiftMix: 1,
    shiftHz: 100,
    bodyX: 1,
    mod0Src: 5,
    mod0Dest: DEST.shiftHz,
    mod0Depth: 1,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 1))
  // body X pinned at 1 lifts a 100 Hz shift four octaves, to 1600
  expect(pitchHz(tail(renderBender(look, 1, load)))).toBeCloseTo(2100, -2)
})
