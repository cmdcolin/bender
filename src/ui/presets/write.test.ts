import { expect, test } from 'vitest'

import { YOURS } from '../../dsp/stages/roms.ts'
import { HOLD, REST } from '../../tune.ts'
import { kit, tune } from './write.ts'

test('a tune fills the melody and the stacked lanes, and plays yours', () => {
  const t = tune('A3 . ~', 'C3')
  expect(t.chipTune).toBe(YOURS)
  expect(t.tuneLen).toBe(3)
  expect(t.tunePoly).toBe(1)
  expect([t.tuneStep0, t.tuneStep1, t.tuneStep2]).toEqual([0, REST, HOLD])
  expect(t.tuneStackA0).toBe(-9)
  expect(t.tuneStackB0).toBe(REST)
})

test('a kit clears the rows it does not name', () => {
  const k = kit({ kick: 'x...', ratchet: '..3' })
  expect(k.drumKick).not.toBe(0)
  expect(k.drumKickLen).toBe(4)
  expect(k.drumSnare).toBe(0)
  expect(k.drumRatchet2).not.toBe(0)
})
