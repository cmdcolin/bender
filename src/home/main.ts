// The page at `/`: a landing page for a stranger, and the same URL rendered as
// a home once Firebase says who is signed in.
//
// index.astro builds the landing markup, preset cards included, so a visitor
// gets it with no JavaScript run at all. cloud.ts fetches the SDK on the first
// call that needs it, so the only loads that reach Google are the ones that
// already know this browser signed in and the ones where somebody pressed the
// button.
//
// Everything below builds nodes and sets `textContent`. A voice's name is a
// string somebody typed, and `innerHTML` anywhere here would hand it to the
// parser.
import {
  fetchHome,
  signIn,
  signOut,
  wasSignedIn,
  watchAuth,
  type CloudUser,
  type HomeDoc,
} from '../ui/cloud'
import { sinceWords } from '../ui/relativeTime'
import { markFor } from './mark'
import { appUrl, boardUrl, siteRoot } from './paths'
import type { SavedVoice } from '../ui/voiceModel'

const need = (id: string): HTMLElement => {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`no #${id}`)
  return node
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const landing = need('landing')
const home = need('home')
const presets = need('presets')
const signInBtn = need('signIn') as HTMLButtonElement
const acct = need('acct')
const acctBtn = need('acctBtn') as HTMLButtonElement
const acctMenu = need('acctMenu')
const acctName = need('acctName')
const avatar = need('avatar')
const signOutBtn = need('signOut') as HTMLButtonElement
const whyCard = need('whyCard') as HTMLDialogElement
const whyBtns = [need('why'), need('whyBelow')]
const whySignInBtn = need('whySignIn') as HTMLButtonElement

// --- cards ------------------------------------------------------------------

function card(query: string, name: string, says: string): HTMLElement {
  const item = el('li')
  const link = el('a', 'card')
  link.href = boardUrl(query)
  const top = el('span', 'cardTop')
  top.append(markFor(query), el('span', 'open', 'open →'))
  link.append(top, el('span', 'cardName', name), el('span', 'says', says))
  item.append(link)
  return item
}

function section(id: string, heading: string, sub?: string): HTMLElement {
  const box = el('section', 'sec')
  box.id = id
  box.append(el('h2', 'secHead', heading))
  if (sub !== undefined) box.append(el('p', 'secSub', sub))
  return box
}

// --- the signed-in sections -------------------------------------------------

function resumeSection(doc: HomeDoc, now: number) {
  const current = doc.current
  if (current === null) return undefined
  const box = section('resume', 'Continue where you left off')
  const cardBox = el('div', 'resumeCard')
  cardBox.append(markFor(current.query))

  const body = el('div', 'resumeBody')
  body.append(
    el('p', 'when', sinceWords(current.at, now)),
    el(
      'p',
      'says',
      'Resuming brings back the whole board — the bends, the pattern, the pedals and the tape.',
    ),
  )
  const row = el('p', 'cta')
  const go = el('a', 'btn primary')
  go.href = boardUrl(current.query)
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

function emptyVoices(): HTMLElement {
  const box = el('div', 'empty')
  box.append(
    el('h3', 'emptyHead', 'Nothing saved yet'),
    el(
      'p',
      'says',
      'Open the app, bend something, and press ctrl+S — or open the saved menu in the panel and press save. The board lands here under the name you give it, on every machine you sign in on.',
    ),
  )
  const go = el('a', 'btn primary')
  go.href = appUrl
  go.textContent = 'Open the app →'
  box.append(go)
  return box
}

function voicesSection(doc: HomeDoc, now: number): HTMLElement {
  const box = section('voices', 'Your voices')
  if (doc.voices.length === 0) {
    box.append(emptyVoices())
    return box
  }
  // Newest save first: the list is stored in insertion order, which is what
  // keeps a re-save where it was in the app's own popover, and is the wrong
  // order for a page you come back to.
  const sorted = [...doc.voices].sort(
    (a: SavedVoice, b: SavedVoice) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
  )
  const grid = el('ul', 'grid')
  for (const voice of sorted) {
    const says =
      voice.savedAt === undefined
        ? 'saved'
        : `saved ${sinceWords(voice.savedAt, now)}`
    grid.append(card(voice.query, voice.name, says))
  }
  box.append(grid)
  return box
}

// --- the account end of the bar ---------------------------------------------

function paintAvatar(user: CloudUser) {
  avatar.textContent = ''
  avatar.classList.remove('initial')
  const name = user.name ?? ''
  const initial = () => {
    avatar.textContent = (name.trim()[0] ?? '?').toUpperCase()
    avatar.classList.add('initial')
  }
  if (user.photo === null) initial()
  else {
    const img = el('img')
    img.src = user.photo
    img.alt = ''
    img.width = 28
    img.height = 28
    // Google serves an avatar only to a request that names no referrer.
    img.referrerPolicy = 'no-referrer'
    img.addEventListener('error', initial)
    avatar.append(img)
  }
  acctName.textContent = name === '' ? 'Signed in' : name
  acctBtn.setAttribute('aria-label', name === '' ? 'Account' : name)
}

const closeMenu = () => {
  acctMenu.hidden = true
  acctBtn.setAttribute('aria-expanded', 'false')
}

acctBtn.addEventListener('click', event => {
  event.stopPropagation()
  acctMenu.hidden = !acctMenu.hidden
  acctBtn.setAttribute('aria-expanded', String(!acctMenu.hidden))
})
document.addEventListener('click', closeMenu)
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu()
})

// --- why sign in ------------------------------------------------------------

// index.astro writes the card into the page at build time. This opens it, shuts
// it, and hands its button to the sign-in the bar's button uses.
for (const button of whyBtns)
  button.addEventListener('click', () => {
    whyCard.showModal()
  })

need('whyClose').addEventListener('click', () => {
  whyCard.close()
})

whyCard.addEventListener('click', event => {
  // A press that landed on the dialog element and on none of its children
  // landed on the backdrop.
  if (event.target === whyCard) whyCard.close()
})

// --- the two states ---------------------------------------------------------

export function showHome(
  user: CloudUser,
  doc: HomeDoc,
  now = Date.now(),
): void {
  paintAvatar(user)
  whyCard.close()
  signInBtn.hidden = true
  for (const button of whyBtns) button.hidden = true
  acct.hidden = false

  const rail = el('nav', 'rail')
  rail.setAttribute('aria-label', 'Home')
  const links: [string, string, boolean][] = [
    [siteRoot, 'Home', true],
    ['#voices', 'Voices', false],
    ['#presets', 'Presets', false],
    [
      'https://github.com/cmdcolin/bender/blob/main/docs/USER-GUIDE.md',
      'User guide',
      false,
    ],
  ]
  for (const [href, label, on] of links) {
    const link = el('a', on ? 'on' : undefined, label)
    link.href = href
    if (on) link.setAttribute('aria-current', 'page')
    rail.append(link)
  }

  const main = el('div', 'homeMain')
  const resume = resumeSection(doc, now)
  if (resume !== undefined) main.append(resume)
  // The build already rendered the preset cards into the landing page; signed
  // in, the same section moves over rather than being drawn a second time.
  main.append(voicesSection(doc, now), presets)

  const inner = el('div', 'homeIn')
  inner.append(rail, main)
  home.textContent = ''
  home.append(inner)
  home.hidden = false
  landing.hidden = true
}

export function showLanding(): void {
  closeMenu()
  acct.hidden = true
  signInBtn.hidden = false
  for (const button of whyBtns) button.hidden = false
  landing.append(presets)
  home.textContent = ''
  home.hidden = true
  landing.hidden = false
}

async function paint(user: CloudUser | null) {
  if (user === null) showLanding()
  else showHome(user, await fetchHome(user.uid))
}

const startSignIn = (button: HTMLButtonElement) => {
  button.disabled = true
  signIn()
    .then(paint)
    .catch(() => {
      // A popup the reader closed, or one the browser blocked. The page is the
      // landing page already and there is nothing to report.
    })
    .finally(() => {
      button.disabled = false
    })
}

signInBtn.addEventListener('click', () => {
  startSignIn(signInBtn)
})

whySignInBtn.addEventListener('click', () => {
  startSignIn(whySignInBtn)
})

signOutBtn.addEventListener('click', () => {
  showLanding()
  void signOut()
})

// The one path that costs a load anything: a browser that has signed in before
// subscribes here, which is what fetches the SDK. Everyone else waits for the
// button.
if (wasSignedIn()) void watchAuth(user => void paint(user))
