// The page at `/`: a landing page for a stranger, and the same URL rendered as
// a home once Firebase says who is signed in. This file owns the choice between
// those two and the sign-in that decides it; the pieces each state is built
// from are in sections.ts, cards.ts and account.ts.
//
// index.astro builds the landing markup, demo cards included, so a visitor gets
// it with no JavaScript run at all. cloud.ts fetches the SDK on the first call
// that needs it, so the only loads that reach Google are the ones that already
// know this browser signed in and the ones where somebody pressed the button.
import {
  fetchHome,
  signIn,
  signOut,
  warmSignIn,
  wasSignedIn,
  watchAuth,
  type CloudUser,
  type HomeDoc,
} from '../ui/cloud'
import { closeMenu, paintAvatar } from './account'
import { el } from './dom'
import {
  acct,
  demos,
  home,
  landing,
  signInBtn,
  signOutBtn,
  whyBtns,
  whyCard,
  whySignInBtn,
  whyTrouble,
} from './els'
import { guideUrl, siteRoot } from './paths'
import {
  earlierSection,
  failedSection,
  resumeSection,
  voicesSection,
} from './sections'

import type { CardEdits } from './cards'

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
  showFrame(
    user,
    [
      resumeSection(doc, now),
      earlierSection(doc, now),
      voicesSection(doc, now, edits),
    ].filter(box => box !== undefined),
  )
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
let watching = wasSignedIn()

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
  }).catch(() => {
    watching = false
    showLanding()
  })
// CROSS_REPO_SYNC_END(home-sign-in)
