import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import { renderBender, rms } from '../testRender'

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
  revDryCut: 1,
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
