import { useEffect, useRef, useState } from 'react'

import {
  fetchHome,
  putVoices,
  signIn as cloudSignIn,
  signOut as cloudSignOut,
  wasSignedIn,
  watchAuth,
  type CloudUser,
} from './cloud'
import {
  markOpened,
  removeVoice,
  suggestVoiceName,
  upsertVoice,
} from './voiceModel'

import type { CurrentSession, SavedVoice } from './voiceModel'

// The voice library: who is signed in, what they have saved, and the verbs over
// it. Firestore is the only store, and the hook writes nothing to this device,
// so **signed out there is nowhere to save into**. `user === null` is the state
// where the library does not exist yet.
//
// `saveVoice` holds a save pressed in that state: it answers `needs-auth`,
// keeps the board, and writes it as soon as a sign-in lands. The caller's job
// is to ask why an account, which App does with the why-sign-in card.
//
// What it buys: a voice named on the laptop is on the phone, and clearing site
// data no longer loses the library. What it costs: no library without an
// account. Presets, the walk and the address bar are untouched, so a session
// that never signs in is the app it always was.
export type CloudStatus = 'signed-out' | 'loading' | 'ready' | 'error'

// What the save button says for a beat after a save. One value, because two
// booleans could contradict each other on screen. ctrl+S and the panel's save
// button both save with the popover shut, so the button is the only surface
// that can answer.
export type VoiceFlash = { kind: 'saved'; name: string } | { kind: 'failed' }

// What came of asking to save. On `needs-auth` the hook has kept the board, and
// the caller opens the why-sign-in card.
export type SaveOutcome = 'saving' | 'needs-auth'

/** A save waiting on a sign-in: the board as it was when the key was pressed. */
interface PendingSave {
  name: string
  query: string
}

export function useSavedVoices() {
  const [voices, setVoices] = useState<SavedVoice[]>([])
  const [current, setCurrent] = useState<CurrentSession | null>(null)
  const [user, setUser] = useState<CloudUser | null>(null)
  const [status, setStatus] = useState<CloudStatus>(() =>
    wasSignedIn() ? 'loading' : 'signed-out',
  )
  const [error, setError] = useState<string | null>(null)
  const [lastName, setLastName] = useState<string | null>(null)
  const [flash, setFlash] = useState<VoiceFlash | null>(null)

  // A save pressed with nobody signed in, kept until the list it belongs in has
  // been fetched. Press save, sign in, and the board is saved, so keeping a
  // board costs one gesture and a popup.
  //
  // A ref, because the auth subscription's callback closes over the render that
  // installed it and has to read a press made since.
  const pending = useRef<PendingSave | null>(null)

  // Up for a beat, then down — but only if it is still the one this call put
  // up, compared by identity so a second save does not have its own answer cut
  // short by the first timer. A failure holds longer than a success: a ✓
  // confirms what you just asked for, while a ✕ has to survive a late glance.
  const showFlash = (next: VoiceFlash) => {
    setFlash(next)
    setTimeout(
      () => setFlash(cur => (cur === next ? null : cur)),
      next.kind === 'saved' ? 1600 : 2600,
    )
  }

  // Whether this session wants an auth subscription at all. It starts as "has
  // this browser signed in before", which is what keeps the SDK off an ordinary
  // visit, and a press on sign in flips it — the *first* sign-in of a browser
  // happens with no subscription installed, and without the flip the popup
  // would close on success with nothing listening.
  const [wantAuth, setWantAuth] = useState(wasSignedIn)

  // Every write is cloud-only, and the list moves once the document has been
  // accepted rather than before: an optimistic row is a row that looks saved
  // and is not, which is the one thing a save must never show.
  const commit = (uid: string, next: SavedVoice[], landed?: string) => {
    putVoices(uid, next)
      .then(() => {
        setVoices(next)
        setError(null)
        if (landed !== undefined) {
          setLastName(landed)
          showFlash({ kind: 'saved', name: landed })
        }
      })
      .catch((e: unknown) => {
        console.error('saving voices failed', e)
        setError('could not save — check your connection')
        showFlash({ kind: 'failed' })
      })
  }

  const write = (next: SavedVoice[], landed?: string) => {
    if (user !== null) commit(user.uid, next, landed)
  }

  // Signing in, signing out and the restore-on-load all arrive here, so there
  // is one path that fetches the list rather than one per way in.
  const applyUser = (next: CloudUser | null) => {
    setUser(next)
    if (next === null) {
      setVoices([])
      setCurrent(null)
      setLastName(null)
      setStatus('signed-out')
      return
    }
    setStatus('loading')
    fetchHome(next.uid)
      .then(home => {
        setVoices(home.voices)
        setCurrent(home.current)
        setStatus('ready')
        setError(null)
        landPending(next.uid, home.voices)
      })
      .catch((e: unknown) => {
        console.error('loading saved voices failed', e)
        setStatus('error')
        setError('could not load your saved voices')
      })
  }

  // The save somebody pressed on the way in, written now that there is an
  // account to write it to. suggestVoiceName runs again over the list that just
  // arrived, because the first run had an empty list to work from: without the
  // second one, a save named "my voice" would overwrite the "my voice" the
  // account already held.
  const landPending = (uid: string, arrived: readonly SavedVoice[]) => {
    const want = pending.current
    pending.current = null
    if (want === null) return
    const name = suggestVoiceName(arrived, want.name)
    commit(uid, upsertVoice(arrived, name, want.query, Date.now()), name)
  }

  // Firebase resolves the unsubscribe asynchronously, so teardown covers both
  // the window before it exists and the call after.
  useEffect(() => {
    if (!wantAuth) return undefined
    let cancelled = false
    let stop: (() => void) | undefined
    watchAuth(next => {
      if (!cancelled) applyUser(next)
    })
      .then(unsub => {
        stop = unsub
        if (cancelled) unsub()
      })
      .catch((e: unknown) => {
        console.error('auth subscribe failed', e)
        if (!cancelled) {
          setStatus('error')
          setError('could not reach the sign-in service')
        }
      })
    return () => {
      cancelled = true
      stop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantAuth])

  return {
    voices,
    /** The board this account last had open. The home page is what reads it. */
    current,
    user,
    status,
    error,
    lastName,
    flash,
    saveVoice: (name: string, query: string): SaveOutcome => {
      if (status !== 'ready') {
        pending.current = { name, query }
        return 'needs-auth'
      }
      write(upsertVoice(voices, name, query, Date.now()), name)
      return 'saving'
    },
    deleteVoice: (name: string) => {
      write(removeVoice(voices, name))
      // Deleting the voice you were in frees its name again: the next save
      // should offer "dying toy", not "dying toy 2" against a row that is gone.
      setLastName(cur => (cur === name ? null : cur))
    },
    // A recall makes that voice the one you are in, so the next save offers its
    // name rather than falling back to whichever preset the board still
    // matches. It stamps `openedAt`, which is what the home page reads.
    markRecalled: (name: string) => {
      setLastName(name)
      write(markOpened(voices, name, Date.now()))
    },
    signIn: () => {
      setStatus('loading')
      setError(null)
      setWantAuth(true)
      cloudSignIn().catch((e: unknown) => {
        // A popup somebody dismissed is not a failure worth a message: they
        // changed their mind, and the button they came from is the right thing
        // to be looking at again.
        const code =
          typeof e === 'object' && e !== null && 'code' in e ? e.code : ''
        if (
          code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request'
        ) {
          pending.current = null
          setStatus('signed-out')
        } else {
          console.error('sign-in failed', e)
          pending.current = null
          setStatus('error')
          setError('sign-in failed — try again')
        }
      })
    },
    signOut: () => {
      pending.current = null
      cloudSignOut().catch((e: unknown) => {
        console.error('sign-out failed', e)
      })
    },
  }
}
