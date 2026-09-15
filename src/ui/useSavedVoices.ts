import { useEffect, useState } from 'react'
import {
  fetchHome,
  putVoices,
  signIn as cloudSignIn,
  signOut as cloudSignOut,
  wasSignedIn,
  watchAuth,
  type CloudUser,
} from './cloud'
import { markOpened, removeVoice, upsertVoice } from './voiceModel'
import type { CurrentSession, SavedVoice } from './voiceModel'

// The voice library: who is signed in, what they have saved, and the verbs over
// it. Firestore is the only store — nothing is written to this device — so
// **signed out there is nothing to save into**, and that shapes the hook.
// `user === null` is not a degraded mode with a local fallback behind it; it is
// the state where saving does not exist yet, and the popover says so instead of
// taking a save that would go nowhere.
//
// What it buys: a voice named on the laptop is on the phone, and clearing site
// data no longer loses the library. What it costs: no saving without an
// account. Presets, the walk and the address bar are untouched, so a session
// that never signs in is the app exactly as it was.
export type CloudStatus = 'signed-out' | 'loading' | 'ready' | 'error'

// What the button says for a beat after a save. One value rather than three
// flags, because as separate booleans they could contradict each other on
// screen. All three exist because ctrl+S saves with the popover shut, so the
// button is the only surface that can answer.
export type VoiceFlash =
  { kind: 'saved'; name: string } | { kind: 'needs-auth' } | { kind: 'failed' }

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
      })
      .catch((e: unknown) => {
        console.error('loading saved voices failed', e)
        setStatus('error')
        setError('could not load your saved voices')
      })
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

  // Every write is cloud-only, and the list moves once the document has been
  // accepted rather than before: an optimistic row is a row that looks saved
  // and is not, which is the one thing a save must never show.
  const write = (next: SavedVoice[], landed?: string) => {
    if (user === null) return
    putVoices(user.uid, next)
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

  return {
    voices,
    /** The board this account last had open. The home page is what reads it. */
    current,
    user,
    status,
    error,
    lastName,
    flash,
    canSave: status === 'ready',
    saveVoice: (name: string, query: string) => {
      if (status !== 'ready') {
        showFlash({ kind: 'needs-auth' })
        return
      }
      write(upsertVoice(voices, name, query, Date.now()), name)
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
          setStatus('signed-out')
        } else {
          console.error('sign-in failed', e)
          setStatus('error')
          setError('sign-in failed — try again')
        }
      })
    },
    signOut: () => {
      cloudSignOut().catch((e: unknown) => {
        console.error('sign-out failed', e)
      })
    },
  }
}
