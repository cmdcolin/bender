import { expect, test } from 'vitest'

import {
  cleanVoiceName,
  markOpened,
  readCurrent,
  readVoices,
  removeVoice,
  suggestVoiceName,
  upsertVoice,
  VOICE_NAME_MAX,
} from './voiceModel'

test('a name loses its line breaks and its excess length', () => {
  expect(cleanVoiceName('  broken \n toy  ')).toBe('broken toy')
  expect(cleanVoiceName('x'.repeat(80))).toHaveLength(VOICE_NAME_MAX)
  expect(cleanVoiceName('   ')).toBe('')
})

test('a save lands at the end and an overwrite stays where it was', () => {
  const one = upsertVoice([], 'a', 'p=1')
  const two = upsertVoice(one, 'b', 'p=2')
  expect(upsertVoice(two, 'a', 'p=9').map(v => v.name)).toEqual(['a', 'b'])
  expect(upsertVoice(two, 'a', 'p=9')[0]!.query).toBe('p=9')
})

test('an overwrite keeps the id and the last open, and restamps the save', () => {
  const first = upsertVoice([], 'a', 'p=1', 10)
  const opened = markOpened(first, 'a', 20)
  const again = upsertVoice(opened, 'a', 'p=2', 30)
  expect(again[0]!.id).toBe(first[0]!.id)
  expect(again[0]!.openedAt).toBe(20)
  expect(again[0]!.savedAt).toBe(30)
})

test('a save with no clock carries no metadata, and an empty name saves nothing', () => {
  expect(upsertVoice([], 'a', 'p=1')[0]).toEqual({ name: 'a', query: 'p=1' })
  expect(upsertVoice([], '  ', 'p=1')).toEqual([])
})

test('the suggestion counts up only once the name is taken', () => {
  const list = upsertVoice([], 'dying toy', 'p=1')
  expect(suggestVoiceName([], 'dying toy')).toBe('dying toy')
  expect(suggestVoiceName(list, 'dying toy')).toBe('dying toy 2')
  expect(
    suggestVoiceName(upsertVoice(list, 'dying toy 2', 'p=2'), 'dying toy'),
  ).toBe('dying toy 3')
  expect(suggestVoiceName([], '')).toBe('my voice')
})

test('a stored list drops whatever is not a voice', () => {
  expect(
    readVoices([
      { name: 'a', query: 'p=1', savedAt: 5 },
      { name: 'b' },
      { name: '  ', query: 'p=2' },
      { name: 'c', query: 'x'.repeat(9000) },
      null,
      7,
      { name: 'd', query: 'p=3', savedAt: 'soon' },
    ]),
  ).toEqual([
    { name: 'a', query: 'p=1', savedAt: 5 },
    { name: 'd', query: 'p=3' },
  ])
  expect(readVoices('nope')).toEqual([])
})

test('a stored session needs both halves', () => {
  expect(readCurrent({ query: 'p=1', at: 4 })).toEqual({ query: 'p=1', at: 4 })
  expect(readCurrent({ query: 'p=1' })).toBeNull()
  expect(readCurrent(null)).toBeNull()
})

test('delete takes the one name', () => {
  const list = upsertVoice(upsertVoice([], 'a', 'p=1'), 'b', 'p=2')
  expect(removeVoice(list, 'a').map(v => v.name)).toEqual(['b'])
})
