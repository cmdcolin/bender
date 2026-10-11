import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type ControlKey } from '../controls'
import { dealBendKeys, HEATS } from './bendDeal'
import { BEND_ENDS, STAGE_DB } from './bendEnds'
import { sliderFor } from './controls'
import { LETTERS } from './keyboard'
import { heard } from './presets/scenarios'
import { CLOCK_KEYS, PART_KEYS, YOURS } from './presets/yours'
import { toPos } from './slider-scale'

// A small deterministic generator, so a deal is the same deal every run.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const keysOf = (patch: object) => Object.keys(patch) as ControlKey[]

test('a deal is one key per letter, in keyboard order', () => {
  const deal = dealBendKeys(DEFAULT_CONTROLS, seeded(1))
  expect(deal.map(k => k.letter)).toEqual(LETTERS)
  for (const k of deal) expect(k.stages.length).toBeGreaterThan(0)
})

test('every key pushes something in range, and nothing that is yours', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const k of dealBendKeys(DEFAULT_CONTROLS, seeded(seed))) {
      const patch = k.push(DEFAULT_CONTROLS)
      expect(k.keys.length).toBeGreaterThan(0)
      for (const key of keysOf(patch)) {
        const def = sliderFor(key)
        expect(patch[key]).toBeGreaterThanOrEqual(def.min)
        expect(patch[key]).toBeLessThanOrEqual(def.max)
        expect(YOURS.has(key), key).toBe(false)
        expect(CLOCK_KEYS.has(key)).toBe(false)
        expect(PART_KEYS.has(key)).toBe(false)
      }
    }
  }
})

test('a key on a silent stage brings the stage up with it', () => {
  for (const k of dealBendKeys(DEFAULT_CONTROLS, seeded(7))) {
    const live = { ...DEFAULT_CONTROLS, ...k.push(DEFAULT_CONTROLS) }
    for (const key of k.keys)
      expect(heard(live, key), `${k.letter}: ${k.says}`).toBe(true)
  }
})

test('a level the hand already has up is left where it is', () => {
  const loud = { ...DEFAULT_CONTROLS, dlyMix: 1 }
  for (const k of dealBendKeys(loud, seeded(3))) {
    const patch = k.push(loud)
    if ('dlyMix' in patch && !k.keys.includes('dlyMix'))
      expect(patch.dlyMix).toBe(1)
  }
})

test('no two keys share a control', () => {
  const deal = dealBendKeys(DEFAULT_CONTROLS, seeded(11))
  const seen = new Set<ControlKey>()
  for (const k of deal) {
    for (const key of k.keys) {
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  }
})

test('tame moves one control a key', () => {
  for (const k of dealBendKeys(DEFAULT_CONTROLS, seeded(5), 'tame'))
    expect(k.keys).toHaveLength(1)
})

test('wreck moves three a key, and solders on a third of them', () => {
  const deal = dealBendKeys(DEFAULT_CONTROLS, seeded(5), 'wreck')
  for (const k of deal) expect(k.keys).toHaveLength(3)
  const soldered = deal.filter(k => k.stages.some(s => s.startsWith('+ ')))
  expect(soldered.length).toBeGreaterThan(0)
  for (const k of soldered) {
    const patch = k.push(DEFAULT_CONTROLS)
    const extra = keysOf(patch).filter(key => !k.keys.includes(key))
    expect(
      extra.some(key => /^mod\dSrc$/.test(key) || /^bendSlot\d$/.test(key)),
      k.says,
    ).toBe(true)
  }
})

test('no key slams a control to an end that measured silent', () => {
  for (const heat of HEATS)
    for (const seed of [1, 2, 3]) {
      for (const k of dealBendKeys(DEFAULT_CONTROLS, seeded(seed), heat)) {
        const patch = k.push(DEFAULT_CONTROLS)
        for (const key of k.keys) {
          const high = toPos(sliderFor(key), patch[key]!) >= 0.5
          const ends = BEND_ENDS[key]
          if (ends)
            expect(ends[high ? 1 : 0], `${key} ${k.says}`).not.toBeNull()
        }
      }
    }
})

test('no two keys bring up the same silent stage', () => {
  for (const seed of [1, 2, 3, 4]) {
    const seen = new Set<ControlKey>()
    for (const k of dealBendKeys(DEFAULT_CONTROLS, seeded(seed), 'wild')) {
      const raised = keysOf(k.push(DEFAULT_CONTROLS)).filter(
        key =>
          !k.keys.includes(key) &&
          key in STAGE_DB &&
          !heard(DEFAULT_CONTROLS, key),
      )
      for (const gate of raised) {
        expect(seen.has(gate), `${gate} ${k.says}`).toBe(false)
        seen.add(gate)
      }
    }
  }
})

test('no key brings up a silent stage that comes up loud', () => {
  const loud = (Object.keys(STAGE_DB) as ControlKey[]).filter(
    gate => STAGE_DB[gate]! > 6,
  )
  expect(loud).toContain('fbAmt')
  for (const heat of HEATS)
    for (const seed of [1, 2, 3, 4]) {
      for (const k of dealBendKeys(DEFAULT_CONTROLS, seeded(seed), heat)) {
        const patch = k.push(DEFAULT_CONTROLS)
        for (const gate of loud)
          if (!k.keys.includes(gate))
            expect(patch[gate] ?? DEFAULT_CONTROLS[gate], k.says).toBe(
              DEFAULT_CONTROLS[gate],
            )
      }
    }
})

test('no key turns a level or mix up past what a bend is', () => {
  for (const heat of HEATS)
    for (const seed of [1, 2, 3]) {
      for (const k of dealBendKeys(DEFAULT_CONTROLS, seeded(seed), heat)) {
        const patch = k.push(DEFAULT_CONTROLS)
        for (const key of k.keys) {
          if (sliderFor(key).role === undefined) continue
          const high = toPos(sliderFor(key), patch[key]!) >= 0.5
          expect(
            BEND_ENDS[key]?.[high ? 1 : 0] ?? 0,
            k.says,
          ).toBeLessThanOrEqual(6)
        }
      }
    }
})
