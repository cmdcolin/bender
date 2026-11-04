// The signed-in home: the last autosave, the sessions you saved, and the older
// autosaves folded away under them.

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

// A board that is a preset is called by its name. Finding out needs the preset
// table, which the landing page has no use for, so it arrives after the row is
// drawn.
function presetLater(query: string, into: HTMLElement) {
  import('./boardLabel.ts').then(
    ({ presetOf }) => {
      const preset = presetOf(query)
      if (preset !== undefined) {
        into.textContent = preset
        into.dataset.preset = preset
      }
    },
    (e: unknown) => {
      console.error('could not look up a preset', e)
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
    named === undefined ? presetLater(current.query, head) : head,
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

function boardLink(
  query: string,
  name: HTMLElement,
  at: number | undefined,
  now: number,
) {
  const link = el('a', 'boardLink')
  link.href = boardUrl(query)
  link.append(
    markFor(query),
    name,
    el('span', 'says', at === undefined ? '' : sinceWords(at, now)),
  )
  return link
}

function savedRow(voice: SavedVoice, now: number, edits: CardEdits) {
  const item = el('li', 'boardRow')
  item.append(
    boardLink(
      voice.query,
      el('span', 'boardName', voice.name),
      voice.savedAt,
      now,
    ),
    cardActions(voice, edits),
  )
  return item
}

function autosaveRow(
  session: RecentSession,
  doc: HomeDoc,
  now: number,
  edits: CardEdits,
) {
  const name = presetLater(
    session.query,
    el('span', 'boardName unnamed', 'untitled'),
  )
  const link = boardLink(session.query, name, session.at, now)
  link.addEventListener('click', () => {
    handOffSession(session.id)
  })
  const item = el('li', 'boardRow')
  item.append(
    link,
    saveAction(
      session.query,
      doc.voices,
      edits,
      () => name.dataset.preset ?? '',
    ),
  )
  return item
}

// The autosaves behind the one on the resume strip, once per board, leaving out
// any board already saved under a name.
const olderAutosaves = (doc: HomeDoc) =>
  doc.recent
    .slice(1)
    .filter(s => !doc.voices.some(v => v.query === s.query))
    .filter((s, i, all) => all.findIndex(o => o.query === s.query) === i)

function autosavesFold(
  doc: HomeDoc,
  older: RecentSession[],
  now: number,
  edits: CardEdits,
) {
  const fold = el('details', 'autosaves')
  fold.append(
    el(
      'summary',
      undefined,
      older.length === 1
        ? '1 older autosave'
        : `${older.length} older autosaves`,
    ),
  )
  const rows = el('ul', 'boards')
  rows.append(...older.map(session => autosaveRow(session, doc, now, edits)))
  fold.append(rows)
  return fold
}

function savedList(doc: HomeDoc, now: number, edits: CardEdits) {
  const rows = el('ul', 'boards')
  rows.append(
    ...doc.voices
      .toSorted((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
      .map(voice => savedRow(voice, now, edits)),
  )
  return rows
}

function nothingSaved(): HTMLElement {
  const box = el('div', 'empty')
  box.append(
    el('h3', 'emptyHead', 'Nothing saved yet'),
    el(
      'p',
      'emptySays',
      'Press save in the app to keep a board here under a name.',
    ),
  )
  const go = el('a', 'btn primary', 'Open the app →')
  go.href = appUrl
  box.append(go)
  return box
}

export function failedSection(retry: () => void): HTMLElement {
  const box = section('saved', 'Saved sessions')
  const empty = el('div', 'empty')
  empty.append(
    el('h3', 'emptyHead', 'Your saved sessions did not load'),
    el('p', 'emptySays', 'Check the connection and try again.'),
  )
  const again = el('button', 'btn primary', 'Try again')
  again.type = 'button'
  again.addEventListener('click', retry)
  empty.append(again)
  box.append(empty)
  return box
}

export function savedSection(doc: HomeDoc, now: number, edits: CardEdits) {
  const box = section('saved', 'Saved sessions')
  const older = olderAutosaves(doc)
  box.append(
    doc.voices.length === 0 ? nothingSaved() : savedList(doc, now, edits),
    ...(older.length === 0 ? [] : [autosavesFold(doc, older, now, edits)]),
  )
  return box
}
