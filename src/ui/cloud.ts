import { createCloud } from 'skillet-shared/cloud'

import {
  forget as removeStored,
  read as readStored,
  write as writeString,
} from './persist.ts'
import { RECENT_MAX } from './voiceModel.ts'

import type { RecentSession, SavedVoice } from './voiceModel.ts'

// Sign-in and the one document a signed-in user keeps their voices and their
// last session in. skillet-shared/cloud loads the Firebase SDK on first use,
// and nothing else in the app imports `firebase`.
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

// The reCAPTCHA Enterprise key App Check attests with, out of the Firebase
// console's App Check page. Public in the way the config above is: it names the
// site to Google's reCAPTCHA endpoint, and it buys a token saying a request came
// from this app. Empty until somebody registers one, and an empty key installs
// nothing — requests then carry no App Check token, which is what every session
// has sent since the project was created.
//
// Outside the shared region because each site attests as itself.
const APPCHECK_SITE_KEY = '6LfXUr8tAAAAAAWJh1jC0NfYTmhiAmdq-Nd8c9nQ'

const cloud = createCloud({
  config: CONFIG,
  collection: COLLECTION,
  listField: 'voices',
  signedInHint: SIGNED_IN_HINT,
  appCheckSiteKey: APPCHECK_SITE_KEY,
  recentMax: RECENT_MAX,
  storage: { read: readStored, write: writeString, forget: removeStored },
})

export type { CloudUser } from 'skillet-shared/cloud'
export const { wasSignedIn, warmSignIn, watchAuth, signIn, signOut } = cloud
export const { putSession, dropSession } = cloud

export interface HomeDoc {
  voices: SavedVoice[]
  recent: RecentSession[]
}

export async function fetchHome(uid: string): Promise<HomeDoc> {
  const { items, recent } = await cloud.fetchHome(uid)
  return { voices: items, recent }
}

export const editVoices = cloud.editItems

// The player's setup, kept beside the voices. Outside the regions above: it is
// bender's own, and videoskillet's rules for `users/{uid}` have no `prefs`.
// Read raw, for prefs.ts to sanitise.
export async function fetchPrefs(uid: string): Promise<unknown> {
  const { fs, ref } = await cloud.userDoc(uid)
  const snap = await fs.getDoc(ref)
  return snap.exists() ? snap.data().prefs : undefined
}

// `mergeFields` rather than `merge`: a merge joins nested maps, so a bench the
// player emptied would come back with the old closed list under it.
export async function putPrefs(uid: string, prefs: object): Promise<void> {
  const { fs, ref } = await cloud.userDoc(uid)
  await fs.setDoc(ref, { prefs }, { mergeFields: ['prefs'] })
}
