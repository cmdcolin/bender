import { expect, test } from 'vitest'

import { padLines } from './padLines'

test('a pad shows one line per control a key moves', () => {
  expect(padLines('Tone ▲ Wire 2 depth ▲ Starve ▲')).toEqual([
    'Tone ▲',
    'Wire 2 depth ▲',
    'Starve ▲',
  ])
})

test('a soldered wire or bend gets a line of its own', () => {
  expect(padLines('Delay ▲ + ring')).toEqual(['Delay ▲', '+ ring'])
})

test('a pad keeps three lines', () => {
  expect(padLines('A ▲ B ▼ C ▲ + ring')).toEqual(['A ▲', 'B ▼', 'C ▲'])
})
