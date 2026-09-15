import {
  forget as removeStored,
  read as readStored,
  write as writeString,
} from './persist'
import { readCurrent, readVoices, VOICE_MAX } from './voiceModel'

import type { CurrentSession, SavedVoice } from './voiceModel'
import type { FirebaseApp } from 'firebase/app'
import type { Auth, User } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore/lite'

// Sign-in, and the one document a signed-in user keeps their voices and their
// last session in. Nothing else in the app imports `firebase`.
//
// **Every firebase import here is dynamic, and that is the point.** The three
// entry points come to about 110 kB gzipped, and the overwhelming majority of
// sessions never sign in — a board arrives from a link, gets played, and goes.
// So the SDK is fetched on the first call that needs it: a press on sign in, or
// a load that already knows this browser was signed in. The type-only imports
// above are erased before the bundler sees them and cost nothing.
//
// Bender shares videoskillet's Firebase project, and its own data lives under
// `benderUsers/{uid}`. The rules for that collection are deployed from the
// videoskillet repository's `firestore.rules`; there is no rules file here.
//
// The config is committed on purpose. A Firebase web config is a set of public
// identifiers rather than credentials: it ships inside the bundle of every
// Firebase web app ever deployed, and the apiKey only names the project to
// Google's endpoints. The rules are what stop a stranger writing, and the
// authorized-domains list is what stops one using the project as their own auth
// backend.
// CROSS_REPO_SYNC(firebase-config)
const CONFIG = {
  apiKey: 'AIzaSyBHZnQdnaDc5BEYbqwKO8zs0t_wyzLaGFo',
  authDomain: 'ntscjs-d4f56.firebaseapp.com',
  projectId: 'ntscjs-d4f56',
  storageBucket: 'ntscjs-d4f56.firebasestorage.app',
  messagingSenderId: '881016589781',
  appId: '1:881016589781:web:9eabd469a30d89b6d7815c',
  measurementId: 'G-ZFH59EM495',
}
// CROSS_REPO_SYNC_END(firebase-config)

const COLLECTION = 'benderUsers'

// Whether this browser has been signed in before. Not a credential and trusted
// for nothing — the session itself lives in Firebase's IndexedDB store, and this
// is only the hint saying whether a fresh load should fetch the SDK to go and
// look. Wrong in the harmless direction either way: stale-true costs one fetch,
// stale-false costs one click.
export const SIGNED_IN_HINT = 'bender_signed_in'
// CROSS_REPO_SYNC(firebase-auth)
export const wasSignedIn = () => readStored(SIGNED_IN_HINT) === '1'

// What the popover needs to know about who is signed in. Deliberately not the
// firebase User, which carries tokens and a dozen methods where all anything
// here shows is a name and a picture.
export interface CloudUser {
  uid: string
  name: string | null
  photo: string | null
}

const asCloudUser = (user: User): CloudUser => ({
  uid: user.uid,
  name: user.displayName,
  photo: user.photoURL,
})

interface Sdk {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  fs: typeof import('firebase/firestore/lite')
  authMod: typeof import('firebase/auth')
}

// One SDK per page, and one *load* per page even when several callers race for
// it: the promise is the singleton rather than the resolved value.
// initializeApp throws on a second call under the same name, and the auth
// instance has to be the object the sign-in popup resolved against.
let sdk: Promise<Sdk> | null = null

function loadSdk(): Promise<Sdk> {
  sdk ??= (async () => {
    const [appMod, authMod, fs] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      // The `lite` build: it drops onSnapshot and the offline queue, and there
      // is no live document here. The list is read once when a session signs in
      // and written when someone presses save, and another machine's changes
      // matter at the next load rather than mid-set.
      import('firebase/firestore/lite'),
    ])
    const app = appMod.initializeApp(CONFIG)
    return {
      app,
      auth: authMod.getAuth(app),
      db: fs.getFirestore(app),
      fs,
      authMod,
    }
  })()
  return sdk
}

// Subscribe to who is signed in. Resolves to the unsubscribe once the SDK is
// up; the callback fires immediately after that with the restored session (or
// null), and again on every sign-in and sign-out.
export async function watchAuth(
  onUser: (user: CloudUser | null) => void,
): Promise<() => void> {
  const { auth, authMod } = await loadSdk()
  return authMod.onAuthStateChanged(auth, user => {
    if (user === null) removeStored(SIGNED_IN_HINT)
    else writeString(SIGNED_IN_HINT, '1')
    onUser(user === null ? null : asCloudUser(user))
  })
}

// A popup rather than a redirect. A redirect takes the tab away and comes back
// to a cold page, which here means an audio graph torn down and rebuilt and a
// board nobody asked to restart.
export async function signIn(): Promise<CloudUser> {
  const { auth, authMod } = await loadSdk()
  const provider = new authMod.GoogleAuthProvider()
  const result = await authMod.signInWithPopup(auth, provider)
  writeString(SIGNED_IN_HINT, '1')
  return asCloudUser(result.user)
}

export async function signOut(): Promise<void> {
  const { auth } = await loadSdk()
  removeStored(SIGNED_IN_HINT)
  await auth.signOut()
}
// CROSS_REPO_SYNC_END(firebase-auth)

// CROSS_REPO_SYNC(saved-list-cloud)
// Everything the user document holds.
export interface HomeDoc {
  voices: SavedVoice[]
  current: CurrentSession | null
}

// Read through the same sanitizers the list always uses: a document is exactly
// as untrusted as a localStorage value was.
export async function fetchHome(uid: string): Promise<HomeDoc> {
  const { db, fs } = await loadSdk()
  const snap = await fs.getDoc(fs.doc(db, COLLECTION, uid))
  if (!snap.exists()) return { voices: [], current: null }
  const data = snap.data()
  return {
    voices: readVoices(data.voices),
    current: readCurrent(data.current),
  }
}

// Firestore refuses a field set to undefined, so an entry carries only the
// fields it has.
const voiceEntry = (item: SavedVoice) => ({
  name: item.name,
  query: item.query,
  ...(item.id === undefined ? {} : { id: item.id }),
  ...(item.savedAt === undefined ? {} : { savedAt: item.savedAt }),
  ...(item.openedAt === undefined ? {} : { openedAt: item.openedAt }),
})

// The whole list in one write. A document per voice would make two machines
// editing different voices conflict-free, and it would turn one save into a
// write plus a delete-detection pass to protect a case — the same person on two
// machines inside the same second — that costs a re-save. Merged, so the write
// leaves `current` standing.
export async function putVoices(
  uid: string,
  voices: readonly SavedVoice[],
): Promise<void> {
  const { db, fs } = await loadSdk()
  await fs.setDoc(
    fs.doc(db, COLLECTION, uid),
    { voices: voices.slice(0, VOICE_MAX).map(voiceEntry) },
    { merge: true },
  )
}

// The session last open, or null to clear it. Merged for the same reason.
export async function putCurrent(
  uid: string,
  current: CurrentSession | null,
): Promise<void> {
  const { db, fs } = await loadSdk()
  await fs.setDoc(fs.doc(db, COLLECTION, uid), { current }, { merge: true })
}
// CROSS_REPO_SYNC_END(saved-list-cloud)
