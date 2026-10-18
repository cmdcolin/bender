// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'

import { engine } from '../engine/engine.ts'
import './testDom.ts'
import { watchTriggers } from './triggerWatch.ts'

const IDS = ['key-line', 'key-line-pcm', 'key-line-mono', 'fmStruck']

const mapOf = () => {
  const root = document.createElement('div')
  root.innerHTML = IDS.map(id => `<g data-wire="${id}"></g>`).join('')
  return root
}

const lit = (root: HTMLElement) =>
  IDS.filter(id =>
    root.querySelector(`[data-wire="${id}"]`)!.hasAttribute('data-live'),
  )

beforeEach(() => {
  engine.set('fmKeyGate', 0)
  engine.set('pcmKeyGate', 0)
  engine.set('monoKeyGate', 0)
  engine.set('fmStruck', 0)
  engine.chipNotes.set(new Set())
  engine.fmNotes.set(new Set())
  engine.pcmNotes.set(new Set())
  engine.monoNotes.set(new Set())
})

test('the gate line lights while the toy and a machine on it are both sounding', () => {
  const root = mapOf()
  const stop = watchTriggers(root)
  engine.chipNotes.set(new Set([60]))
  expect(lit(root)).toEqual([])
  engine.pcmNotes.set(new Set([60]))
  expect(lit(root)).toEqual(['key-line', 'key-line-pcm'])
  engine.chipNotes.set(new Set())
  expect(lit(root)).toEqual([])
  stop()
})

test('a cut jumper takes its machine off the line', () => {
  const root = mapOf()
  engine.set('pcmKeyGate', 1)
  const stop = watchTriggers(root)
  engine.chipNotes.set(new Set([60]))
  engine.pcmNotes.set(new Set([60]))
  expect(lit(root)).toEqual([])
  stop()
})

test('a bridge lights for the kit voice it listens to', () => {
  const root = mapOf()
  engine.set('fmStruck', 1)
  const stop = watchTriggers(root)
  engine.meter.set({ ...engine.meter.get(), hits: 1 << 1 })
  expect(lit(root)).toEqual([])
  engine.meter.set({ ...engine.meter.get(), hits: 1 })
  expect(lit(root)).toEqual(['fmStruck'])
  stop()
})
