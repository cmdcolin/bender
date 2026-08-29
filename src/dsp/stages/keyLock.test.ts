import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import { SCALE_NAMES, snap } from '../../scale'
import { renderBender } from '../testRender'
import { ToyChip } from './toyChip'

// The key line's matrix, from the audio thread's end. The keybeds are snapped
// before the note ever reaches a wire, so what is left to hold down here is the
// half nothing on the other thread can see: the notes the trigger patch makes
// up on its own, which is where the board's randomness comes out as pitch.

const scale = (name: string) => SCALE_NAMES.indexOf(name)

// The kit bridged onto the key line, picking a step of the ROM at random per
// hit. The demo song's own transport stays stopped, so every note the chip
// reports came off a kick.
const PATCH: Partial<Controls> = {
  chipLevel: 0.8,
  drumLevel: 0.9,
  drumBpm: 160,
  drumKick: 0b1010_1010_1010_1010,
  drumSnare: 0,
  drumHat: 0,
  trigToKeys: 7,
  trigKeysNote: 2,
}

function struck(overrides: Partial<Controls>, seconds = 3) {
  const out = new Int16Array(ToyChip.MAX_SOUNDING)
  const seen = new Set<number>()
  renderBender(
    { ...PATCH, ...overrides },
    seconds,
    built => {
      built.transport.drums = true
    },
    undefined,
    built => {
      const n = built.toyChip.soundingNotes(out)
      for (let i = 0; i < n; i++) seen.add(out[i]!)
    },
  )
  return [...seen]
}

const PENT = scale('pent minor')
const D = 2

test('a random step off the kit lands in the key', () => {
  const loose = struck({})
  const locked = struck({ keyScale: PENT, keyRoot: D })
  const inKey = (n: number) => snap(n, PENT, D) === n

  expect(locked.length).toBeGreaterThan(1)
  // The ROM is in nobody's D minor pentatonic, which is what makes the lock
  // worth asserting on.
  expect(loose.some(n => !inKey(n))).toBe(true)
  expect(locked.every(inKey)).toBe(true)
  // And it moved them by a key or two rather than transposing the lot.
  for (const n of locked)
    expect(loose.some(o => Math.abs(o - n) <= 2)).toBe(true)
})

test('the lock off leaves the patch striking the ROM’s own notes', () => {
  expect(struck({ keyScale: 0, keyRoot: 7 })).toEqual(struck({}))
})
