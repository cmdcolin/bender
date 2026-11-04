// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

import '../ui/testDom.ts'

vi.mock('../ui/cloud.ts', () => ({ editVoices: () => Promise.resolve([]) }))

const { boardsSection } = await import('./sections.ts')

const HOUR = 3600_000
const NOW = 100 * HOUR
const edits = { user: { uid: 'u', name: 'U', photo: null }, redraw: () => {} }

const rows = (section: HTMLElement | undefined) =>
  [...(section?.querySelectorAll('.boardRow') ?? [])].map(row => [
    row.querySelector('.boardName')?.textContent,
    row.querySelector('.says')?.textContent,
  ])

test('one list: a named board takes its latest play, repeat unnamed boards show once, newest first', () => {
  const doc = {
    recent: [
      { id: 'now', query: 'a=1', at: NOW - HOUR },
      { id: 's1', query: 'b=1', at: NOW - 2 * HOUR },
      { id: 's2', query: 'c=1', at: NOW - 3 * HOUR },
      { id: 's3', query: 'b=1', at: NOW - 4 * HOUR },
      { id: 's4', query: 'd=1', at: NOW - 5 * HOUR },
    ],
    voices: [
      { name: 'kept', query: 'c=1', savedAt: NOW - 50 * HOUR },
      { name: 'old', query: 'z=1', savedAt: NOW - 90 * HOUR },
    ],
  }
  expect(rows(boardsSection(doc, NOW, edits))).toEqual([
    ['unsaved', '2 hours ago'],
    ['kept', '3 hours ago'],
    ['unsaved', '5 hours ago'],
    ['old', '3 days ago'],
  ])
})

test('the board on the resume strip is not repeated below it', () => {
  const doc = { recent: [{ id: 'now', query: 'a=1', at: NOW }], voices: [] }
  expect(boardsSection(doc, NOW, edits)).toBeUndefined()
})

test('an account with nothing at all gets the empty state', () => {
  const section = boardsSection({ recent: [], voices: [] }, NOW, edits)
  expect(section?.querySelector('.empty')).not.toBeNull()
})
