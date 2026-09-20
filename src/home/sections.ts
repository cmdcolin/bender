import { appUrl, boardUrl } from '../site/paths'
// The sections down the signed-in home, in the order they are stacked: the
// board you had open last, the ones before it, and everything you have saved.
import { sinceWords } from '../ui/relativeTime'
import { handOffSession } from '../ui/resumeHandoff'
import { card, cardActions, type CardEdits } from './cards'
import { el } from './dom'
import { markFor } from './mark'

import type { HomeDoc } from '../ui/cloud'
import type { RecentSession, SavedVoice } from '../ui/voiceModel'

function section(id: string, heading: string, sub?: string): HTMLElement {
  const box = el('section', 'homeSec')
  box.id = id
  box.append(el('h2', 'head', heading))
  if (sub !== undefined) box.append(el('p', 'sub', sub))
  return box
}

export function resumeSection(doc: HomeDoc, now: number) {
  const current = doc.recent[0]
  if (current === undefined) return undefined
  const box = section('resume', 'Continue where you left off')
  const cardBox = el('div', 'resumeCard')
  cardBox.append(markFor(current.query))

  const body = el('div', 'resumeBody')
  body.append(
    el('p', 'when', sinceWords(current.at, now)),
    el(
      'p',
      'resumeSays',
      'Resuming brings back the whole board — the bends, the pattern, the pedals and the tape. A recording on the sampler and the mic have to be brought in again.',
    ),
  )
  const row = el('p', 'resumeCta')
  const go = el('a', 'btn primary')
  go.href = boardUrl(current.query)
  go.addEventListener('click', () => {
    handOffSession(current.id)
  })
  go.textContent = 'Resume →'
  const fresh = el('a', 'btn')
  fresh.href = appUrl
  fresh.textContent = 'Start fresh'
  row.append(go, fresh)
  body.append(row)

  cardBox.append(body)
  box.append(cardBox)
  return box
}

// A voice with the session's board names its card.
const savedAs = (doc: HomeDoc, session: RecentSession) =>
  doc.voices
    .filter(v => v.query === session.query)
    .toSorted((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0]

export function earlierSection(doc: HomeDoc, now: number) {
  const earlier = doc.recent.slice(1)
  if (earlier.length === 0) return undefined
  const box = section(
    'recent',
    'Earlier sessions',
    'The app saves each visit as you play. Opening one carries on from where that visit stopped.',
  )
  const grid = el('ul', 'grid')
  for (const session of earlier) {
    const match = savedAs(doc, session)
    grid.append(
      card(
        session.query,
        sinceWords(session.at, now),
        match === undefined ? 'a session' : `saved as “${match.name}”`,
        () => {
          handOffSession(session.id)
        },
      ),
    )
  }
  box.append(grid)
  return box
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
