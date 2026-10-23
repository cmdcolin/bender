import { expect, test } from 'vitest'

import { PitchFollow } from './pitchfollow.ts'

const SR = 48000

function follow(wave: (phase: number) => number, hz: number, seconds = 0.5) {
  const f = new PitchFollow(SR)
  let out = 0
  for (let i = 0; i < seconds * SR; i++) {
    out = f.process(0.5 * wave(((hz * i) / SR) % 1))
  }
  return out
}

const sine = (p: number) => Math.sin(2 * Math.PI * p)
const saw = (p: number) => 2 * p - 1
const square = (p: number) => (p < 0.5 ? 1 : -1)

test('the follower settles on the pitch of a steady wave', () => {
  for (const wave of [sine, saw, square]) {
    for (const hz of [55, 110, 220, 440, 880]) {
      expect(follow(wave, hz) / hz).toBeCloseTo(1, 1)
    }
  }
})

test('the follower reports nothing for silence and holds its pitch after the note', () => {
  expect(follow(() => 0, 220)).toBe(0)

  const f = new PitchFollow(SR)
  let held = 0
  for (let i = 0; i < SR; i++) held = f.process(0.5 * sine((220 * i) / SR))
  for (let i = 0; i < SR; i++) expect(f.process(0)).toBe(held)
})

test('the follower moves to a new pitch', () => {
  const f = new PitchFollow(SR)
  let hz = 0
  for (let i = 0; i < SR / 2; i++) f.process(0.5 * sine((220 * i) / SR))
  for (let i = 0; i < SR / 2; i++) hz = f.process(0.5 * sine((330 * i) / SR))
  expect(hz / 330).toBeCloseTo(1, 1)
})
