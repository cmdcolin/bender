// The page at `/`: a landing page for a stranger, and the same URL rendered as
// a home once Firebase says who is signed in.
//
// index.astro builds the landing markup, demo cards included, so a visitor
// gets it with no JavaScript run at all. cloud.ts fetches the SDK on the first
// call that needs it, so the only loads that reach Google are the ones that
// already know this browser signed in and the ones where somebody pressed the
// button.
//
// Everything below builds nodes and sets `textContent`. A voice's name is a
// string somebody typed, and `innerHTML` anywhere here would hand it to the
// parser.
import {
  editVoices,
  fetchHome,
  signIn,
  signOut,
  warmSignIn,
  wasSignedIn,
  watchAuth,
  type CloudUser,
  type HomeDoc,
} from '../ui/cloud'
import { sinceWords } from '../ui/relativeTime'
import {
  VOICE_NAME_MAX,
  cleanVoiceName,
  removeVoice,
  renameVoice,
} from '../ui/voiceModel'
import { markFor } from './mark'
import { appUrl, boardUrl, guideUrl, siteRoot } from './paths'

import type { SavedVoice } from '../ui/voiceModel'

// CROSS_REPO_SYNC(home-dom-helpers)
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
// CROSS_REPO_SYNC_END(home-dom-helpers)

const needOf = <T extends HTMLElement>(id: string, kind: new () => T): T => {
  const node = need(id)
  if (!(node instanceof kind)) throw new Error(`#${id} is not a ${kind.name}`)
  return node
}

const landing = need('landing')
const home = need('home')
const demos = need('demos')
const signInBtn = needOf('signIn', HTMLButtonElement)
const acct = need('acct')
const acctBtn = needOf('acctBtn', HTMLButtonElement)
const acctMenu = need('acctMenu')
const acctName = need('acctName')
const avatar = need('avatar')
const signOutBtn = needOf('signOut', HTMLButtonElement)
const whyCard = needOf('whyCard', HTMLDialogElement)
const whyBtns = [need('why'), need('whyBelow')]
const whySignInBtn = needOf('whySignIn', HTMLButtonElement)
const whyTrouble = need('whyTrouble')

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

// The link a copied card carries, whole, so it opens from a chat window.
const shareLink = (query: string) =>
  new URL(boardUrl(query), location.href).href

// A voice has nothing stored beside it to clean up.
const deleted = (_user: CloudUser, _voice: SavedVoice) => undefined

// CROSS_REPO_SYNC(home-card-actions)
// What a card's verbs need: who is signed in, and how to draw the home again
// from the list an edit left on the account.
interface CardEdits {
  user: CloudUser
  redraw: (voices: SavedVoice[]) => void
}

// Copy link, rename and delete, in a row under a saved card. The row sits
// beside the card's link, since a button inside an <a> follows the link. A
// rename or a delete runs through the same transaction the app saves with, and
// the home redraws from the list that landed.
function cardActions(voice: SavedVoice, edits: CardEdits): HTMLElement {
  const row = el('div', 'cardActions')
  const status = el('span', 'cardStatus')
  status.setAttribute('role', 'status')

  const act = (label: string, run: () => void) => {
    const button = el('button', 'cardAct', label)
    button.type = 'button'
    button.addEventListener('click', run)
    return button
  }
  const show = (...nodes: HTMLElement[]) => {
    row.replaceChildren(...nodes, status)
  }
  const busy = () => {
    for (const node of row.querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >('button, input'))
      node.disabled = true
  }

  const idle = (focus?: string) => {
    const buttons = [
      act('Copy link', copy),
      act('Rename', () => {
        rename(voice.name)
      }),
      act('Delete', askDelete),
    ]
    show(...buttons)
    buttons.find(button => button.textContent === focus)?.focus()
  }

  function copy() {
    const link = shareLink(voice.query)
    // An insecure origin has no clipboard at all, and reading it throws before
    // there is a promise to reject.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(link))
      .then(
        () => {
          status.textContent = 'Link copied'
        },
        () => {
          status.textContent = 'Could not copy the link'
        },
      )
  }

  function rename(start: string) {
    const input = el('input', 'cardRename')
    input.value = start
    input.maxLength = VOICE_NAME_MAX
    input.setAttribute('aria-label', `New name for ${voice.name}`)
    const save = () => {
      const to = cleanVoiceName(input.value)
      if (to === '' || to === voice.name) {
        idle('Rename')
        return
      }
      busy()
      editVoices(edits.user.uid, list =>
        renameVoice(list, voice.name, to),
      ).then(
        next => {
          if (next.some(p => p.name === voice.name)) {
            rename(to)
            status.textContent = `Another one is already called “${to}”`
          } else edits.redraw(next)
        },
        () => {
          rename(to)
          status.textContent = 'Could not rename. Try again.'
        },
      )
    }
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') save()
      if (event.key === 'Escape') idle('Rename')
    })
    status.textContent = ''
    show(
      input,
      act('Save', save),
      act('Cancel', () => idle('Rename')),
    )
    input.select()
  }

  function askDelete() {
    status.textContent = ''
    const keep = act('Keep', () => idle('Delete'))
    show(
      el('span', 'cardAsk', `Delete “${voice.name}”?`),
      act('Delete', remove),
      keep,
    )
    keep.focus()
  }

  function remove() {
    busy()
    editVoices(edits.user.uid, list => removeVoice(list, voice.name)).then(
      next => {
        deleted(edits.user, voice)
        edits.redraw(next)
      },
      () => {
        idle('Delete')
        status.textContent = 'Could not delete. Try again.'
      },
    )
  }

  idle()
  return row
}
// CROSS_REPO_SYNC_END(home-card-actions)

function section(id: string, heading: string, sub?: string): HTMLElement {
  const box = el('section', 'homeSec')
  box.id = id
  box.append(el('h2', 'head', heading))
  if (sub !== undefined) box.append(el('p', 'sub', sub))
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
      'resumeSays',
      'Resuming brings back the whole board — the bends, the pattern, the pedals and the tape.',
    ),
  )
  const row = el('p', 'resumeCta')
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

function failedSection(retry: () => void): HTMLElement {
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

function voicesSection(
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

// --- the account end of the bar ---------------------------------------------

// CROSS_REPO_SYNC(home-account)
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
// A disclosure, so Escape hands focus back to the button that opened it.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || acctMenu.hidden) return
  closeMenu()
  acctBtn.focus()
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
// CROSS_REPO_SYNC_END(home-account)

// --- the two states ---------------------------------------------------------

function showFrame(user: CloudUser, sections: HTMLElement[]) {
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
    ['#demos', 'Demos', false],
    [guideUrl, 'User guide', false],
  ]
  for (const [href, label, on] of links) {
    const link = el('a', on ? 'on' : undefined, label)
    link.href = href
    if (on) link.setAttribute('aria-current', 'page')
    rail.append(link)
  }

  const main = el('div', 'homeMain')
  // The build already rendered the demo cards into the landing page; signed
  // in, the same section moves over rather than being drawn a second time.
  demos.classList.add('homeSec')
  main.append(...sections, demos)

  const inner = el('div', 'homeIn')
  inner.append(rail, main)
  home.textContent = ''
  home.append(inner)
  home.hidden = false
  landing.hidden = true
  delete document.documentElement.dataset.home
}

export function showHome(user: CloudUser, doc: HomeDoc, now = Date.now()) {
  const edits: CardEdits = {
    user,
    // An edit that lands after a sign-out has nothing left to draw on.
    redraw: voices => {
      if (signedIn?.uid === user.uid) showHome(user, { ...doc, voices })
    },
  }
  const resume = resumeSection(doc, now)
  const voices = voicesSection(doc, now, edits)
  showFrame(user, resume === undefined ? [voices] : [resume, voices])
}

export function showLanding(): void {
  closeMenu()
  acct.hidden = true
  signInBtn.hidden = false
  for (const button of whyBtns) button.hidden = false
  demos.classList.remove('homeSec')
  landing.append(demos)
  home.textContent = ''
  home.hidden = true
  landing.hidden = false
  delete document.documentElement.dataset.home
}

// A sign-out during the fetch has already shown the landing page, so paint
// draws only for the account still signed in.
async function paint(user: CloudUser) {
  let doc: HomeDoc
  try {
    doc = await fetchHome(user.uid)
  } catch {
    if (signedIn?.uid === user.uid)
      showFrame(user, [failedSection(() => void paint(user))])
    return
  }
  if (signedIn?.uid !== user.uid) return
  showHome(user, doc)
}

// scripts/dash.ts paints the signed-in home for its screenshot without an
// account. Only the dev server hands it over; the built site never does.
if (import.meta.env.DEV) Object.assign(window, { benderShowHome: showHome })

// CROSS_REPO_SYNC(home-sign-in)
let signedIn: CloudUser | null = null

// Whether the subscription at the bottom is installed. It paints a sign-in by
// itself, and a second paint from the button fetched the whole home twice.
const watching = wasSignedIn()

// What the why card says about a sign-in that did not finish, or undefined for
// a popup the reader closed: they changed their mind, and the page they are
// looking at is already the right one.
function signInTrouble(e: unknown): string | undefined {
  const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : ''
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  )
    return undefined
  if (code === 'auth/popup-blocked')
    return 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
  return 'Signing in did not finish. Check the connection and try again.'
}

const startSignIn = (button: HTMLButtonElement) => {
  button.disabled = true
  whyTrouble.hidden = true
  signIn()
    .then(user => {
      signedIn = user
      return watching ? undefined : paint(user)
    })
    .catch((e: unknown) => {
      const trouble = signInTrouble(e)
      if (trouble === undefined) return
      console.error('sign-in failed', e)
      whyTrouble.textContent = trouble
      whyTrouble.hidden = false
      if (!whyCard.open) whyCard.showModal()
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

for (const button of [signInBtn, whySignInBtn, ...whyBtns])
  for (const type of ['pointerenter', 'focus'])
    button.addEventListener(type, warmSignIn, { once: true })

signOutBtn.addEventListener('click', () => {
  signedIn = null
  showLanding()
  void signOut()
})

// Back from the app restores this page from the back-forward cache as it was,
// so a voice saved in the app would be missing until a reload.
addEventListener('pageshow', event => {
  if (event.persisted && signedIn !== null) void paint(signedIn)
})

// The one path that costs a load anything: a browser that has signed in before
// subscribes here, which is what fetches the SDK. Everyone else waits for the
// button. A failure here is the SDK failing to load, and a page with no SDK can
// only be the landing page.
if (wasSignedIn())
  watchAuth(user => {
    signedIn = user
    if (user === null) showLanding()
    else void paint(user)
  }).catch(showLanding)
// CROSS_REPO_SYNC_END(home-sign-in)
