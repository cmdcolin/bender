// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { aimed } from './reveal.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

const everyRowShown = (): Controls => {
  const c = { ...DEFAULT_CONTROLS }
  for (const def of GROUPS.flatMap(g => g.sliders))
    c[def.key] = def.max !== c[def.key] ? def.max : def.min
  return c
}

const IN_PLACE = new Set([
  'micPatch',
  'pedalOrder',
  ...[0, 1, 2, 3, 4, 5].map(i => `bendSlot${i}`),
])

afterEach(() => act(() => aimed.set(null)))

describe.each(GROUPS.map(g => [g.name, g] as const))('%s', (_, group) => {
  test('aiming at any of its knobs puts the row on screen', () => {
    act(() => engine.patch(everyRowShown()))
    render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
    const missed = group.sliders
      .filter(d => !IN_PLACE.has(d.key))
      .map(d => d.key)
      .filter(key => {
        act(() => aimed.set({ key, at: performance.now() }))
        return !document.querySelector(`[data-control="${key}"]`)
      })
    expect(missed).toEqual([])
  })
})
