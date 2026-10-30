import { bench, sanitizeBench, setBench, type Bench } from './bench.ts'
import { isKeymap, keymap, setKeymap } from './keymap.ts'
import {
  MORPH_SECONDS,
  morphSetting,
  setMorph,
  type MorphSeconds,
} from './morph.ts'
import { read, write } from './persist.ts'

const AT_KEY = 'bender.prefsAt'

// The setup a signed-in player takes from machine to machine: how the
// instruments sit, how long a new board takes to arrive, which computer keys
// play what. The sound itself is a voice. `at` is the clock of the last change,
// which is how two machines pick a winner.
export interface Prefs {
  at: number
  bench: Bench
  morph: MorphSeconds
  keys: readonly string[]
}

/** A stored document is as untrusted as a localStorage value: each field comes
    back only if it is the right shape, and a field that is not falls to what
    this machine already has. Null where there is no clock to compare. */
export function readPrefs(
  value: unknown,
): (Partial<Prefs> & { at: number }) | null {
  if (typeof value !== 'object' || value === null) return null
  const at = 'at' in value ? value.at : undefined
  if (typeof at !== 'number') return null
  const stored = 'bench' in value ? value.bench : undefined
  const morph = MORPH_SECONDS.find(
    s => s === ('morph' in value ? value.morph : undefined),
  )
  const keys = 'keys' in value ? value.keys : undefined
  return {
    at,
    ...(stored === undefined ? {} : { bench: sanitizeBench(stored) }),
    ...(morph === undefined ? {} : { morph }),
    ...(isKeymap(keys) ? { keys } : {}),
  }
}

export const localAt = (): number => Number(read(AT_KEY)) || 0

export const stampLocal = (at: number) => write(AT_KEY, String(at))

export const collectPrefs = (at: number): Prefs => ({
  at,
  bench: bench.get(),
  morph: morphSetting.get(),
  keys: keymap.get(),
})

let applying = false

/** Whether the stores are being written from the account rather than by a hand,
    so a listener can tell the two apart. */
export const isApplying = () => applying

export function applyPrefs(prefs: Partial<Prefs>) {
  applying = true
  try {
    if (prefs.bench) setBench(prefs.bench)
    if (prefs.morph !== undefined) setMorph(prefs.morph)
    if (prefs.keys) setKeymap(prefs.keys)
  } finally {
    applying = false
  }
}

/** What to do on signing in. The account wins when it is newer. This machine
    wins when it has been changed since the account last heard, and a machine
    never changed says nothing, so a fresh one takes whatever the account has. */
export const decide = <P extends { at: number }>(
  local: number,
  remote: P | null,
): { kind: 'adopt'; prefs: P } | { kind: 'push' } | { kind: 'none' } =>
  remote !== null && remote.at > local
    ? { kind: 'adopt', prefs: remote }
    : local > 0 && local > (remote === null ? 0 : remote.at)
      ? { kind: 'push' }
      : { kind: 'none' }
