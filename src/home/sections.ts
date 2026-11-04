// The signed-in home: the board you had open last, then one list of every
// other board — the ones you named, and the unnamed ones the app autosaved.

import { sinceWords } from 'skillet-shared/relative-time'

import { appUrl, boardUrl } from '../site/paths.ts'
import { handOffSession } from '../ui/resumeHandoff.ts'
import { cardActions, saveAction, type CardEdits } from './cards.ts'
import { el } from './dom.ts'
import { markFor } from './mark.ts'

import type { HomeDoc } from '../ui/cloud.ts'
import type { RecentSession, SavedVoice } from '../ui/voiceModel.ts'

function section(id: string, heading: string): HTMLElement {
  const box = el('section', 'homeSec')
  box.id = id
  box.append(el('h2', 'head', heading))
  return box
}

const newest = <T>(list: T[], at: (item: T) => number) =>
  list.toSorted((a, b) => at(b) - at(a))[0]

// The label needs the preset table, which the landing page has no use for, so
// it arrives after the row is drawn.
function labelLater(query: string, into: HTMLElement) {
  import('./boardLabel.ts').then(
    ({ boardLabel }) => {
      const label = boardLabel(query)
      into.textContent = label.text
      into.dataset.preset = label.preset
    },
    (e: unknown) => {
      console.error('could not label a board', e)
    },
  )
  return into
}

const namedAs = (doc: HomeDoc, query: string) =>
  newest(
    doc.voices.filter(v => v.query === query),
    v => v.savedAt ?? 0,
  )

function resumeStrip(doc: HomeDoc, current: RecentSession, now: number) {
  const box = el('section', 'homeSec resume')
  box.id = 'resume'
  const text = el('div', 'resumeText')
  const named = namedAs(doc, current.query)
  const head = el('h2', 'resumeHead', named?.name ?? 'Last session')
  text.append(
    named === undefined ? labelLater(current.query, head) : head,
    el('p', 'when', `last played ${sinceWords(current.at, now)}`),
  )
  const go = el('a', 'btn primary', 'Resume →')
  go.href = boardUrl(current.query)
  go.title =
    'Brings back the bends, pattern, pedals and tape. Sampler recordings and the mic need bringing in again.'
  go.addEventListener('click', () => {
    handOffSession(current.id)
  })
  const fresh = el('a', 'btn', 'Start fresh')
  fresh.href = appUrl
  const row = el('div', 'resumeCta')
  row.append(go, fresh)
  box.append(markFor(current.query), text, row)
  return box
}

export function resumeSection(doc: HomeDoc, now: number) {
  const current = doc.recent[0]
  return current === undefined ? undefined : resumeStrip(doc, current, now)
}

type Entry =
  | { voice: SavedVoice; session: RecentSession | undefined; at: number }
  | { voice: undefined; session: RecentSession; at: number }

// A named board takes the time it was last played or saved, and carries on the
// session that played it. An unnamed board shows once, at its latest visit.
function entries(doc: HomeDoc): Entry[] {
  const earlier = doc.recent.slice(1)
  const named: Entry[] = doc.voices.map(voice => {
    const session = newest(
      earlier.filter(s => s.query === voice.query),
      s => s.at,
    )
    return {
      voice,
      session,
      at: Math.max(voice.savedAt ?? 0, session?.at ?? 0),
    }
  })
  const unnamed: Entry[] = earlier
    .filter(s => !doc.voices.some(v => v.query === s.query))
    .filter((s, i, all) => all.findIndex(o => o.query === s.query) === i)
    .map(session => ({ voice: undefined, session, at: session.at }))
  return [...named, ...unnamed].toSorted((a, b) => b.at - a.at)
}

function entryRow(entry: Entry, doc: HomeDoc, now: number, edits: CardEdits) {
  const query =
    entry.voice === undefined ? entry.session.query : entry.voice.query
  const link = el('a', 'boardLink')
  link.href = boardUrl(query)
  const session = entry.session
  if (session !== undefined)
    link.addEventListener('click', () => {
      handOffSession(session.id)
    })
  const name =
    entry.voice === undefined
      ? labelLater(query, el('span', 'boardName unnamed', 'unsaved'))
      : el('span', 'boardName', entry.voice.name)
  link.append(
    markFor(query),
    name,
    el('span', 'says', entry.at === 0 ? '' : sinceWords(entry.at, now)),
  )
  const item = el('li', 'boardRow')
  item.append(
    link,
    entry.voice === undefined
      ? saveAction(query, doc.voices, edits, () => name.dataset.preset ?? '')
      : cardActions(entry.voice, edits),
  )
  return item
}

function emptyState(): HTMLElement {
  const box = el('div', 'empty')
  box.append(
    el('h3', 'emptyHead', 'Nothing here yet'),
    el(
      'p',
      'emptySays',
      'Play something in the app and it shows up here. Press save (ctrl+S) to give it a name.',
    ),
  )
  const go = el('a', 'btn primary', 'Open the app →')
  go.href = appUrl
  box.append(go)
  return box
}

export function failedSection(retry: () => void): HTMLElement {
  const box = section('boards', 'Your boards')
  const empty = el('div', 'empty')
  empty.append(
    el('h3', 'emptyHead', 'Your boards did not load'),
    el('p', 'emptySays', 'Check the connection and try again.'),
  )
  const again = el('button', 'btn primary', 'Try again')
  again.type = 'button'
  again.addEventListener('click', retry)
  empty.append(again)
  box.append(empty)
  return box
}

function listSection(
  doc: HomeDoc,
  list: Entry[],
  now: number,
  edits: CardEdits,
) {
  const box = section('boards', 'Your boards')
  const rows = el('ul', 'boards')
  rows.append(...list.map(entry => entryRow(entry, doc, now, edits)))
  box.append(rows)
  return box
}

function emptySection() {
  const box = section('boards', 'Your boards')
  box.append(emptyState())
  return box
}

export function boardsSection(doc: HomeDoc, now: number, edits: CardEdits) {
  const list = entries(doc)
  return list.length > 0
    ? listSection(doc, list, now, edits)
    : doc.recent.length === 0
      ? emptySection()
      : undefined
}
