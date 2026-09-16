import { useEffect, useRef, useState } from 'react'

import {
  editVoices,
  fetchHome,
  signIn as cloudSignIn,
  signOut as cloudSignOut,
  wasSignedIn,
  watchAuth,
  type CloudUser,
} from './cloud'
import {
  QUERY_MAX,
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
// the caller opens the why-sign-in card. On `too-long` the hook sets `error`.
export type SaveOutcome = 'saving' | 'needs-auth' | 'too-long'

/** A save waiting on a sign-in: the board as it was when the key was pressed. */
interface PendingSave {
  name: string
  query: string
}

const errorCode = (e: unknown): unknown =>
  typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined

const saveError = (e: unknown): string => {
  switch (errorCode(e)) {
    case 'unavailable':
    case 'deadline-exceeded':
      return 'could not save — check your connection'
    case 'permission-denied':
    case 'unauthenticated':
      return 'could not save — sign-in expired, sign out and back in'
    case 'invalid-argument':
      return 'could not save — Firestore rejected the saved list'
    case 'resource-exhausted':
      return 'could not save — too many saves, try again in a minute'
    default:
      return 'could not save — try again'
  }
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

  // The uid signed in now. A fetch or write that resolves after sign-out, or
  // after a different account signs in, checks it and leaves the state alone.
  const uid = useRef<string | null>(null)

  // Bumped by every save and recall. A save that lands names the voice you are
  // in only if nothing was saved or recalled after it was pressed.
  const named = useRef(0)

  // Bumped by every sign-in press. Firebase rejects a popup when a second one
  // opens, so signIn handles a failure from the latest press only.
  const attempt = useRef(0)

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

  // The list updates after Firestore accepts the write, so a row on screen is a
  // saved row. Each write sends an edit, and editVoices applies it to the
  // stored list: two saves in quick succession both land.
  const commit = (
    owner: string,
    edit: (list: SavedVoice[]) => SavedVoice[],
    landed?: () => string,
  ) => {
    const mine = landed === undefined ? named.current : ++named.current
    editVoices(owner, edit)
      .then(next => {
        if (uid.current !== owner) return
        setVoices(next)
        setError(null)
        if (landed !== undefined) {
          const name = landed()
          if (named.current === mine) setLastName(name)
          showFlash({ kind: 'saved', name })
        }
      })
      .catch((e: unknown) => {
        console.error('saving voices failed', e)
        if (uid.current !== owner) return
        setError(saveError(e))
        showFlash({ kind: 'failed' })
      })
  }

  const write = (
    edit: (list: SavedVoice[]) => SavedVoice[],
    landed?: () => string,
  ) => {
    if (user !== null) commit(user.uid, edit, landed)
  }

  // Signing in, signing out and the restore-on-load all arrive here, so there
  // is one path that fetches the list rather than one per way in.
  const applyUser = (next: CloudUser | null) => {
    uid.current = next?.uid ?? null
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
        if (uid.current !== next.uid) return
        setVoices(home.voices)
        setCurrent(home.current)
        setStatus('ready')
        setError(null)
        landPending(next.uid)
      })
      .catch((e: unknown) => {
        console.error('loading saved voices failed', e)
        if (uid.current !== next.uid) return
        setStatus('error')
        setError('could not load your saved voices')
      })
  }

  // Writes the save pressed before sign-in. The name was suggested against an
  // empty list, so suggestVoiceName runs again over the stored list: a save
  // named "my voice" then lands as "my voice 2" beside an existing "my voice".
  const landPending = (owner: string) => {
    const want = pending.current
    pending.current = null
    if (want === null) return
    const at = Date.now()
    let name = want.name
    commit(
      owner,
      list => {
        name = suggestVoiceName(list, want.name)
        return upsertVoice(list, name, want.query, at)
      },
      () => name,
    )
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
          // A later sign-in press subscribes again.
          setWantAuth(false)
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
      if (query.length > QUERY_MAX) {
        setError(
          `could not save — this board is ${query.length} characters long, and the limit is ${QUERY_MAX}`,
        )
        showFlash({ kind: 'failed' })
        return 'too-long'
      }
      if (status !== 'ready') {
        pending.current = { name, query }
        if (user === null) return 'needs-auth'
        // Signed in with the list still loading, or with a failed load: the
        // save lands when the list arrives, and a failed load is retried.
        if (status === 'error') applyUser(user)
        return 'saving'
      }
      const at = Date.now()
      write(
        list => upsertVoice(list, name, query, at),
        () => name,
      )
      return 'saving'
    },
    deleteVoice: (name: string) => {
      write(list => removeVoice(list, name))
      // Deleting the voice you were in frees its name again: the next save
      // should offer "dying toy", not "dying toy 2" against a row that is gone.
      setLastName(cur => (cur === name ? null : cur))
    },
    // A recall makes that voice the one you are in, so the next save offers its
    // name rather than falling back to whichever preset the board still
    // matches. It writes nothing: a transaction per recall paid for a field
    // nothing read.
    markRecalled: (name: string) => {
      named.current++
      setLastName(name)
    },
    /** Forgets a save held for a sign-in that is no longer coming. */
    dropPending: () => {
      pending.current = null
    },
    signIn: () => {
      setError(null)
      // Signed in with a list that failed to load. Firebase reports no change
      // for a popup that signs the same account in, so fetch again directly.
      if (user !== null) {
        applyUser(user)
        return
      }
      setStatus('loading')
      setWantAuth(true)
      const mine = ++attempt.current
      cloudSignIn().catch((e: unknown) => {
        if (attempt.current !== mine || uid.current !== null) return
        // A popup somebody dismissed is not a failure worth a message: they
        // changed their mind, and the button they came from is the right thing
        // to be looking at again.
        const code = errorCode(e)
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
          setError(
            code === 'auth/popup-blocked'
              ? 'the browser blocked the sign-in window — allow pop-ups for this site and try again'
              : 'sign-in failed — try again',
          )
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
