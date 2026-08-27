import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { Glide } from './glide'

const board = (patch: Partial<Controls>): Controls => ({
  ...DEFAULT_CONTROLS,
  ...patch,
})

test('eases numbers and lands exactly on the destination', () => {
  const from = board({ dlyFb: 0 })
  const glide = new Glide(from, board({ dlyFb: 1 }))
  expect(glide.at(from, 0).dlyFb).toBe(0)
  expect(glide.at(from, 0.5).dlyFb).toBeCloseTo(0.5, 6)
  // Bit-identical, not merely close: the share link writes every control that
  // differs from stock, so a near miss puts the whole board in the URL.
  expect(glide.at(from, 1).dlyFb).toBe(1)
})

test('leaves and arrives at rest', () => {
  const from = board({ dlyFb: 0 })
  const glide = new Glide(from, board({ dlyFb: 1 }))
  const early = glide.at(from, 0.1)
  const late = glide.at(from, 0.9)
  expect(early.dlyFb).toBeLessThan(0.1)
  expect(late.dlyFb).toBeGreaterThan(0.9)
})

test('modes cut at the midpoint rather than travelling', () => {
  const from = board({ distMode: 0 })
  const glide = new Glide(from, board({ distMode: 2 }))
  expect(glide.at(from, 0.3).distMode).toBe(0)
  expect(glide.at(from, 0.7).distMode).toBe(2)
  expect(glide.at(from, 1).distMode).toBe(2)
})

test('never touches the volume, the mic or the pad under your finger', () => {
  const from = board({ outGain: 0.2, bodyX: 0.9, micLevel: 1.1 })
  const glide = new Glide(from, board({ outGain: 1, bodyX: 0, micLevel: 0 }))
  for (const t of [0.5, 1]) {
    const at = glide.at(from, t)
    expect(at.outGain).toBe(0.2)
    expect(at.bodyX).toBe(0.9)
    expect(at.micLevel).toBe(1.1)
  }
})

test('a caller that owns one can force it through, like a reset on its own group', () => {
  const from = board({ outGain: 0.2, bodyX: 0.9 })
  const glide = new Glide(
    from,
    board({ outGain: 1, bodyX: 0 }),
    new Set(['outGain']),
  )
  expect(glide.at(from, 1).outGain).toBe(1)
  // Forcing outGain does not drag bodyX along with it.
  expect(glide.at(from, 1).bodyX).toBe(0.9)
})

test('a hand on a slider the morph is not moving survives it', () => {
  const from = board({ dlyFb: 0 })
  const glide = new Glide(from, board({ dlyFb: 1 }))
  const grabbed = { ...from, filtHz: 900 }
  expect(glide.at(grabbed, 0.5).filtHz).toBe(900)
  expect(glide.at(grabbed, 1).filtHz).toBe(900)
})

// What makes rolls chain: a second morph sets off from wherever the board has
// got to, so a session wanders through board space instead of snapping back to
// the last resting board before every roll.
test('a morph rolled mid-flight sets off from where the board has got to', () => {
  const from = board({ dlyFb: 0 })
  const halfway = new Glide(from, board({ dlyFb: 1 })).at(from, 0.5)
  expect(halfway.dlyFb).toBeCloseTo(0.5, 6)

  const onward = new Glide(halfway, board({ dlyFb: 0.25 }))
  expect(onward.at(halfway, 0.5).dlyFb).toBeCloseTo(0.375, 6)
  expect(onward.at(halfway, 1).dlyFb).toBe(0.25)
})
