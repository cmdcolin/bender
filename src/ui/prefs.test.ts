// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'

import { bench } from './bench.ts'
import { DEFAULT_KEYMAP, keymap, moveKey } from './keymap.ts'
import { morphSetting } from './morph.ts'
import {
  applyPrefs,
  collectPrefs,
  decide,
  isApplying,
  localAt,
  readPrefs,
  stampLocal,
} from './prefs.ts'

beforeEach(() => {
  localStorage.clear()
  bench.set({ all: false, closed: [], pedals: [] })
  morphSetting.set(1)
  keymap.set(DEFAULT_KEYMAP)
})

test('the account wins when newer, this machine when changed since', () => {
  expect(decide(0, null)).toBe('none')
  expect(decide(0, 5)).toBe('adopt')
  expect(decide(4, 5)).toBe('adopt')
  expect(decide(6, 5)).toBe('push')
  expect(decide(6, null)).toBe('push')
  expect(decide(5, 5)).toBe('none')
})

test('a stored setup keeps the fields that are the right shape', () => {
  expect(readPrefs('nope')).toBeNull()
  expect(readPrefs({ morph: 4 })).toBeNull()
  expect(
    readPrefs({
      at: 3,
      bench: { all: true, closed: ['FM chip', 7] },
      morph: 4,
      keys: ['a', 'a'],
    }),
  ).toEqual({
    at: 3,
    bench: { all: true, closed: ['FM chip'], pedals: [] },
    morph: 4,
  })
  expect(readPrefs({ at: 3, morph: 5 })).toEqual({ at: 3 })
})

test('applying a setup writes the stores and this machine keeps it', () => {
  applyPrefs({
    bench: { all: true, closed: ['Mono synth'], pedals: [] },
    morph: 8,
  })
  expect(bench.get()).toEqual({
    all: true,
    closed: ['Mono synth'],
    pedals: [],
  })
  expect(morphSetting.get()).toBe(8)
  expect(localStorage.getItem('bender.morphSeconds')).toBe('8')
  expect(isApplying()).toBe(false)
})

test('a listener can tell an applied setup from a hand', () => {
  const seen: boolean[] = []
  const off = morphSetting.subscribe(() => seen.push(isApplying()))
  applyPrefs({ morph: 4 })
  morphSetting.set(30)
  off()
  expect(seen).toEqual([true, false])
})

test('collecting reads every store and takes the clock it is given', () => {
  moveKey('a', 'q')
  const prefs = collectPrefs(9)
  expect(prefs.at).toBe(9)
  expect(prefs.keys).toEqual(keymap.get())
  expect(prefs.keys).not.toEqual(DEFAULT_KEYMAP)
  stampLocal(9)
  expect(localAt()).toBe(9)
})
