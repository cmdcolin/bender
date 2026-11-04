// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

import '../ui/testDom.ts'

vi.mock('../ui/cloud.ts', () => ({ editVoices: () => Promise.resolve([]) }))

const { savedSection } = await import('./sections.ts')

const HOUR = 3600_000
const NOW = 100 * HOUR
const edits = { user: { uid: 'u', name: 'U', photo: null }, redraw: () => {} }

const rows = (root: Element | null | undefined) =>
  [...(root?.querySelectorAll(':scope > .boards > .boardRow') ?? [])].map(
    row => [
      row.querySelector('.boardName')?.textContent,
      row.querySelector('.says')?.textContent,
      [...row.querySelectorAll('.cardAct')].map(b => b.textContent),
    ],
  )

const doc = {
  recent: [
    { id: 'now', query: 'a=1', at: NOW - HOUR },
    { id: 's1', query: 'b=1', at: NOW - 2 * HOUR },
    { id: 's2', query: 'c=1', at: NOW - 3 * HOUR },
    { id: 's3', query: 'b=1', at: NOW - 4 * HOUR },
    { id: 's4', query: 'd=1', at: NOW - 5 * HOUR },
  ],
  voices: [
    { name: 'old', query: 'z=1', savedAt: NOW - 90 * HOUR },
    { name: 'kept', query: 'c=1', savedAt: NOW - 50 * HOUR },
  ],
}

test('saved boards, newest first, each with the same verbs', () => {
  const verbs = ['Copy link', 'Rename', 'Delete']
  expect(rows(savedSection(doc, NOW, edits))).toEqual([
    ['kept', '2 days ago', verbs],
    ['old', '3 days ago', verbs],
  ])
})

test('older autosaves fold under them, once per board, leaving out saved ones', () => {
  const fold = savedSection(doc, NOW, edits).querySelector('details')
  expect(fold?.querySelector('summary')?.textContent).toBe('2 older autosaves')
  expect(rows(fold)).toEqual([
    ['untitled', '2 hours ago', ['Save']],
    ['untitled', '5 hours ago', ['Save']],
  ])
})

test('the board on the resume strip is not folded under it again', () => {
  const recent = [
    { id: 'now', query: 'a=1', at: NOW - HOUR },
    { id: 's1', query: 'b=1', at: NOW - 2 * HOUR },
    { id: 's2', query: 'a=1', at: NOW - 3 * HOUR },
  ]
  const fold = savedSection({ recent, voices: [] }, NOW, edits).querySelector(
    'details',
  )
  expect(rows(fold)).toEqual([['untitled', '2 hours ago', ['Save']]])
})

test('nothing saved says how to save, and no fold without older autosaves', () => {
  const section = savedSection(
    { recent: [doc.recent[0]!], voices: [] },
    NOW,
    edits,
  )
  expect(section.querySelector('.empty')).not.toBeNull()
  expect(section.querySelector('details')).toBeNull()
})
