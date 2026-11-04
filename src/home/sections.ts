// The sections down the signed-in home, in the order they are stacked: the
// board you had open last, everything you have saved, and the sessions before.

import { sinceWords } from 'skillet-shared/relative-time'

import { appUrl, boardUrl } from '../site/paths.ts'
import { handOffSession } from '../ui/resumeHandoff.ts'
import { card, cardActions, type CardEdits } from './cards.ts'
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

function resumeStrip(current: RecentSession, now: number) {
  const box = el('section', 'homeSec resume')
  box.id = 'resume'
  const text = el('div', 'resumeText')
  text.append(
    el('h2', 'resumeHead', 'Your last session'),
    el('p', 'when', sinceWords(current.at, now)),
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
  return current === undefined ? undefined : resumeStrip(current, now)
}

// A voice with the session's board names its row.
const savedAs = (doc: HomeDoc, session: RecentSession) =>
  doc.voices
    .filter(v => v.query === session.query)
    .toSorted((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0]

function sessionRow(doc: HomeDoc, session: RecentSession, now: number) {
  const match = savedAs(doc, session)
  const link = el('a', 'sessionRow')
  link.href = boardUrl(session.query)
  link.addEventListener('click', () => {
    handOffSession(session.id)
  })
  link.append(
    markFor(session.query),
    el('span', 'sessionWhen', sinceWords(session.at, now)),
    ...(match === undefined ? [] : [el('span', 'says', match.name)]),
  )
  const item = el('li')
  item.append(link)
  return item
}

function sessionsSection(doc: HomeDoc, sessions: RecentSession[], now: number) {
  const box = section('recent', 'Earlier sessions')
  const list = el('ul', 'sessions')
  list.append(...sessions.map(session => sessionRow(doc, session, now)))
  box.append(list)
  return box
}

export function earlierSection(doc: HomeDoc, now: number) {
  const earlier = doc.recent.slice(1)
  return earlier.length === 0 ? undefined : sessionsSection(doc, earlier, now)
}

function emptyVoices(): HTMLElement {
  const box = el('div', 'empty')
  box.append(
    el('h3', 'emptyHead', 'Nothing saved yet'),
    el(
      'p',
      'emptySays',
      'Open the app, bend something, and press save in the panel — or ctrl+S, which does the same. The board lands here under the name you give it, on every machine you sign in on.',
    ),
  )
  const go = el('a', 'btn primary')
  go.href = appUrl
  go.textContent = 'Open the app →'
  box.append(go)
  return box
}

export function failedSection(retry: () => void): HTMLElement {
  const box = section('voices', 'Your voices')
  const empty = el('div', 'empty')
  empty.append(
    el('h3', 'emptyHead', 'Your voices did not load'),
    el(
      'p',
      'emptySays',
      'The account is signed in, but the request for its voices failed. Check the connection and try again.',
    ),
  )
  const again = el('button', 'btn primary', 'Try again')
  again.type = 'button'
  again.addEventListener('click', retry)
  empty.append(again)
  box.append(empty)
  return box
}

export function voicesSection(
  doc: HomeDoc,
  now: number,
  edits: CardEdits,
): HTMLElement {
  const box = section('voices', 'Your voices')
  if (doc.voices.length === 0) {
    box.append(emptyVoices())
    return box
  }
  // Newest save first: the list is stored in insertion order, which is what
  // keeps a re-save where it was in the app's own popover, and is the wrong
  // order for a page you come back to.
  const sorted = doc.voices.toSorted(
    (a: SavedVoice, b: SavedVoice) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
  )
  const grid = el('ul', 'grid')
  for (const voice of sorted) {
    const says =
      voice.savedAt === undefined
        ? 'saved'
        : `saved ${sinceWords(voice.savedAt, now)}`
    const item = card(voice.query, voice.name, says)
    item.append(cardActions(voice, edits))
    grid.append(item)
  }
  box.append(grid)
  return box
}
