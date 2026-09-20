// The account end of the bar — the avatar and the menu under it — and the card
// that answers "why sign in?". main.ts owns the sign-in itself; these are the
// two things on screen it drives.
import { el, need } from './dom'
import { acctBtn, acctMenu, acctName, avatar, whyBtns, whyCard } from './els'

import type { CloudUser } from '../ui/cloud'

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

// WhySignInCard.astro writes the card into the page at build time. This opens
// it, shuts it, and hands its button to the sign-in the bar's button uses.
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

export { closeMenu, paintAvatar }
