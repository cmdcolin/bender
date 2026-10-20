// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterAll, describe, expect, test } from 'vitest'

import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { STRIP_KEYS } from './diagram.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

import type { Group } from './controls/types.ts'

// Every slider moved, so no row waits behind a gate.
const everyRowShown = (): Controls => {
  const c = { ...DEFAULT_CONTROLS }
  for (const def of GROUPS.flatMap(g => g.sliders))
    c[def.key] = def.max !== c[def.key] ? def.max : def.min
  return c
}

// The trigger patch solders onto the machines it plays.
const REACHES_OUT: Record<string, readonly ControlKey[]> = {
  'Trigger patch': [
    'fmStruck',
    'fmKeyGate',
    'pcmStruck',
    'pcmKeyGate',
    'monoStruck',
    'monoKeyGate',
  ],
}

// Knobs a stage sets outside its boxes: the mic's jacks, the patch bay's
// wires, and the four-track desk, whose strip drawing shows the first track.
const SETS_IN_PLACE: Record<string, (key: ControlKey) => boolean> = {
  Mic: key => key === 'micPatch',
  'Patch bay': key => key.startsWith('mod'),
  Layercake: key => !STRIP_KEYS.some(k => k === key && k.startsWith('four1')),
}

// Boxes that open no card: the mic finds its level row, and a patch bay wire
// opens the rows beside the bay.
const NO_CARD = new Set(['Mic', 'Patch bay'])

const label = (b: Element) => b.getAttribute('aria-label') ?? ''

const boxes = (root: ParentNode | null) =>
  [...(root?.querySelectorAll('svg g[role="button"]') ?? [])].filter(b =>
    label(b).endsWith(' controls'),
  )

const shown = () =>
  [...document.querySelectorAll('section [data-control]')].map(
    r => r.getAttribute('data-control') as ControlKey,
  )

const press = (name: string, inCard: boolean) => {
  const el = boxes(document).find(
    b => label(b) === name && Boolean(b.closest('section')) === inCard,
  )
  if (el && el.getAttribute('aria-pressed') !== 'true') fireEvent.click(el)
}

const shut = (name: string) => {
  const el = boxes(document).find(
    b => label(b) === name && !b.closest('section'),
  )
  if (el?.getAttribute('aria-pressed') === 'true') fireEvent.click(el)
}

// Presses every box of a stage's drawings, and every box of each close-up
// that opens, and reads the rows each card shows.
function walk(group: Group) {
  act(() => engine.patch(everyRowShown()))
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
  const top = boxes(document)
    .filter(b => !b.closest('section'))
    .map(label)
  const reached = new Set<ControlKey>()
  const empty: string[] = []
  for (const name of top) {
    press(name, false)
    const own = shown()
    const inner = boxes(document.querySelector('section')).map(label)
    for (const n of inner) {
      press(n, true)
      for (const key of shown()) reached.add(key)
    }
    for (const key of own) reached.add(key)
    if (own.length === 0 && inner.length === 0) empty.push(name)
    shut(name)
  }
  cleanup()
  return { drawn: top.length > 0, reached, empty }
}

const walks = new Map(GROUPS.map(g => [g.name, walk(g)]))
const drawn = GROUPS.filter(g => walks.get(g.name)!.drawn)

afterAll(() => act(() => engine.patch({ ...DEFAULT_CONTROLS })))

test('the walk finds the drawn stages', () => {
  expect(drawn.map(g => g.name)).toEqual(
    expect.arrayContaining(['Plinky', 'Clatter', 'Glint', 'Growler']),
  )
})

describe.each(drawn.map(g => [g.name, g] as const))('%s', (name, group) => {
  const { reached, empty } = walks.get(name)!

  test('opens only knobs of its own stage', () => {
    const own = new Set<ControlKey>([
      ...group.sliders.map(d => d.key),
      ...(REACHES_OUT[name] ?? []),
    ])
    expect([...reached].filter(k => !own.has(k))).toEqual([])
  })

  test('reaches every knob its drawing took over', () => {
    const inPlace = SETS_IN_PLACE[name] ?? (() => false)
    expect(
      (group.handled ?? []).filter(k => !reached.has(k) && !inPlace(k)),
    ).toEqual([])
  })

  test('has no box that opens an empty card', () => {
    expect(NO_CARD.has(name) ? [] : empty).toEqual([])
  })
})
