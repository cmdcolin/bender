// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterAll, describe, expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { OpenGroup } from './Section.tsx'
import './testDom.ts'

import type { Group } from './controls/types.ts'

const label = (b: Element) => b.getAttribute('aria-label') ?? ''

const boxes = (root: ParentNode | null) =>
  [...(root?.querySelectorAll('svg g[role="button"]') ?? [])].filter(b =>
    label(b).endsWith(' controls'),
  )

const outside = () => boxes(document).filter(b => !b.closest('section'))

const rows = () =>
  new Set(
    [...document.querySelectorAll('section [data-control]')].map(r =>
      r.getAttribute('data-control'),
    ),
  ).size

// A card that holds an editor under its rows.
const EDITORS = new Set(['piano roll controls'])

// Presses every box of a stage at stock and counts the rows its card shows. A
// card holding a close-up drawing has more to press, so it never counts thin.
function walk(group: Group) {
  act(() => engine.patch({ ...DEFAULT_CONTROLS }))
  render(<OpenGroup group={group} onClose={() => {}} seconds={0} />)
  const cards = new Map<string, number>()
  for (const name of new Set(outside().map(label))) {
    const box = outside().find(b => label(b) === name)!
    if (box.getAttribute('aria-pressed') !== 'true') fireEvent.click(box)
    const closeUp = boxes(document.querySelector('section')).length > 0
    cards.set(name, closeUp || EDITORS.has(name) ? Infinity : rows())
    if (box.getAttribute('aria-pressed') === 'true') fireEvent.click(box)
  }
  cleanup()
  return cards
}

const walks = GROUPS.map(g => [g.name, walk(g)] as const).filter(
  ([, cards]) => cards.size > 0,
)

afterAll(() => act(() => engine.patch({ ...DEFAULT_CONTROLS })))

describe.each(walks)('%s', (_, cards) => {
  test('opens no card with fewer than three rows', () => {
    const most = Math.max(...cards.values())
    const floor = Math.min(3, most)
    expect([...cards].filter(([, n]) => n < floor)).toEqual([])
  })
})
