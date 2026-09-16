import { useState } from 'react'

import styles from './Account.module.css'
import { warmSignIn } from './cloud'
import { Menu } from './Menu'
import { menuItem } from './menuItems'
import { Tip } from './Tip'

import type { CloudUser } from './cloud'
import type { CloudStatus } from './useSavedVoices'

// The account control: who is signed in, and the way in and out. It sits beside
// the library button, because a list of boards and an account are two facts and
// one button can label only one of them. The library button used to relabel
// itself `sign in`, so answering it left you looking at a save form you had not
// opened.
//
// Signed in the control shows the account photo, which is the shape the site
// bar on the home page already takes. Signed out it shows the ask.
export function Account(props: {
  user: CloudUser | null
  status: CloudStatus
  onSignIn: () => void
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [broken, setBroken] = useState(false)

  // `sign in` would flash false for as long as Firebase takes to confirm what
  // the last visit already recorded, so a session still being restored says `…`.
  if (props.user === null) {
    const checking = props.status === 'loading'
    return (
      <Tip
        text={
          checking
            ? 'Checking your account…'
            : 'Sign in to keep boards under a name on your account. Everything else here works signed out.'
        }
      >
        <button
          className={styles.signIn}
          disabled={checking}
          // The popup has to open inside the browser's allowance for the click
          // that asked for it, and a first sign-in that spent it downloading
          // the SDK got the window blocked. Pointing at the button is reason
          // enough to fetch.
          onPointerEnter={warmSignIn}
          onFocus={warmSignIn}
          onClick={props.onSignIn}
        >
          {checking ? '…' : 'sign in'}
        </button>
      </Tip>
    )
  }

  const name = props.user.name ?? props.user.uid.slice(0, 6)
  const photo = props.user.photo
  return (
    <>
      <Tip text={`Signed in as ${name}. Opens sign out.`}>
        <button
          ref={setAnchor}
          className={styles.acctBtn}
          aria-label={name}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {photo === null || broken ? (
            <span className={styles.initial} aria-hidden>
              {(name.trim()[0] ?? '?').toUpperCase()}
            </span>
          ) : (
            <img
              className={styles.avatar}
              src={photo}
              alt=""
              // Google serves an avatar only to a request that names no
              // referrer.
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
            />
          )}
        </button>
      </Tip>
      {open && (
        <Menu
          anchor={anchor}
          toggle={anchor}
          role="menu"
          label="account"
          onClose={() => setOpen(false)}
        >
          <p className={styles.who}>{name}</p>
          <button
            role="menuitem"
            className={menuItem(false)}
            onClick={() => {
              setOpen(false)
              props.onSignOut()
            }}
          >
            sign out
          </button>
        </Menu>
      )}
    </>
  )
}
