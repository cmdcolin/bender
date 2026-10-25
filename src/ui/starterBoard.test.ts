// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import './testDom.ts'
import { bench, setBench } from './bench.ts'
import { onBoard } from './chain-map.ts'
import { shownOn } from './fitted.ts'
import { openStage } from './openStage.ts'
import { startFresh } from './starterBoard.ts'

beforeEach(() => {
  openStage.set(null)
  setBench({ ...bench.get(), pedals: [] })
  localStorage.clear()
  engine.patch({
    fmLevel: 0,
    pcmLevel: 0,
    monoLevel: 0,
    echoLevel: 0,
    echoMute: 0,
    revMix: 0,
    revMute: 0,
  })
})

test('a fresh tab has every synth up and the delay and reverb bypassed', () => {
  startFresh()
  const c = engine.controls.get()
  const on = onBoard(c)
  for (const synth of ['Plinky', 'Glint', 'Parlor', 'Growler'])
    expect(on.has(synth)).toBe(true)
  expect(bench.get().pedals).toEqual(['Ricochet', 'Boing'])
  expect(shownOn(c).has('Boing')).toBe(true)
  expect(c.echoMute).toBe(1)
  expect(c.revMute).toBe(1)
})

test('a tab with a bench of its own keeps it', () => {
  setBench({ ...bench.get(), pedals: ['Gnash'] })
  startFresh()
  expect(bench.get().pedals).toEqual(['Gnash'])
})

test('a fresh tab opens the toy keyboard in the panel', () => {
  startFresh()
  expect(openStage.get()).toBe('Plinky')
})
