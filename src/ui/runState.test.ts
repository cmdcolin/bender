import { beforeEach, expect, test } from 'vitest'
import { engine } from '../engine/engine'
import { keepRunState } from './runState'

// The tab's shelf, standing in for the one node has never heard of.
const shelf = new Map<string, string>()

beforeEach(() => {
  shelf.clear()
  globalThis.sessionStorage = {
    getItem: (k: string) => shelf.get(k) ?? null,
    setItem: (k: string, v: string) => void shelf.set(k, v),
  } as Storage
  engine.setSongPlaying(false)
  engine.setDrumsPlaying(false)
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
