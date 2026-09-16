import { beforeEach, expect, test } from 'vitest'

import { engine } from '../engine/engine'
import { keepRunState } from './runState'

// The tab's shelf, standing in for the one node has never heard of.
const shelf = new Map<string, string>()

beforeEach(() => {
  globalThis.sessionStorage = {
    getItem: (k: string) => shelf.get(k) ?? null,
    setItem: (k: string, v: string) => void shelf.set(k, v),
  } as Storage
  // Stopped first, then emptied: the engine is one object over the whole file,
  // so every keepRunState a test before this one called is still subscribed and
  // still writing the shelf as the run lines come down.
  engine.setSongPlaying(false)
  engine.setDrumsPlaying(false)
  shelf.clear()
})

test('a tab with nothing on the shelf comes back stopped', () => {
  keepRunState()
  expect(engine.songPlaying.get()).toBe(false)
  expect(engine.drumsPlaying.get()).toBe(false)
})

test('a tab comes back running whatever it was running', () => {
  shelf.set('bender.run', '{"song":false,"drums":true}')
  keepRunState()
  expect(engine.songPlaying.get()).toBe(false)
  expect(engine.drumsPlaying.get()).toBe(true)
})

test('a shelf that says something else is ignored', () => {
  shelf.set('bender.run', '{"song":"yes"}')
  keepRunState()
  expect(engine.songPlaying.get()).toBe(false)
  expect(engine.drumsPlaying.get()).toBe(false)
})

test('pressing play writes what the reload will read', () => {
  keepRunState()
  engine.setSongPlaying(true)
  expect(shelf.get('bender.run')).toBe('{"song":true,"drums":false}')
  engine.setDrumsPlaying(true)
  expect(shelf.get('bender.run')).toBe('{"song":true,"drums":true}')
})

// The address bar carries every board, so a hash naming one says nothing about
// where it came from. The shelf does: a tab with nothing on it has never run
// this app, and the board it is showing arrived from outside.
test('a tab says whether it has been here before', () => {
  expect(keepRunState()).toBe(false)
  expect(keepRunState()).toBe(true)
})

test('a tab that never pressed play has still been here', () => {
  keepRunState()
  expect(shelf.get('bender.run')).toBe('{"song":false,"drums":false}')
})
