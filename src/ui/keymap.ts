import { createStore } from '../listeners.ts'
import { LETTERS } from './keyboard.ts'
import { forget, read, write } from './persist.ts'
import { THROWS } from './throws.ts'

/** The keys the computer keyboard can give away: three rows of ten. */
export const KEY_ROWS = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./']
const CAPS = KEY_ROWS.join('')

const KEYMAP_KEY = 'bender.keymap'
const NOTE_COUNT = LETTERS.length

/** One letter per job, no two alike: the sixteen notes (which are also the
    sixteen bend keys), octave down and up, then the throws in order. */
export const DEFAULT_KEYMAP: readonly string[] = [
  ...LETTERS,
  'z',
  'x',
  ...THROWS.map(t => t.key),
]

export const isKeymap = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length === DEFAULT_KEYMAP.length &&
  value.every(
    k => typeof k === 'string' && k.length === 1 && CAPS.includes(k),
  ) &&
  new Set(value).size === value.length

// A layout saved before newer throws existed is the same layout with those
// throws on their own letters, or on a free one where the layout took theirs.
function grown(parsed: unknown): unknown {
  if (!Array.isArray(parsed) || parsed.length >= DEFAULT_KEYMAP.length)
    return parsed
  const out: unknown[] = [...parsed]
  for (const k of DEFAULT_KEYMAP.slice(parsed.length))
    out.push(out.includes(k) ? CAPS.split('').find(c => !out.includes(c)) : k)
  return out
}

function storedKeymap(): readonly string[] | null {
  const raw = read(KEYMAP_KEY)
  if (raw === null) return null
  try {
    const parsed = grown(JSON.parse(raw))
    return isKeymap(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const keymap = createStore<readonly string[]>(
  storedKeymap() ?? DEFAULT_KEYMAP,
)

/** Whether the remap dialog is up, so a button anywhere can open it. */
export const remapOpen = createStore(false)

export const noteKeys = (map: readonly string[]) => map.slice(0, NOTE_COUNT)
export const octaveKeys = (map: readonly string[]) => ({
  down: map[NOTE_COUNT]!,
  up: map[NOTE_COUNT + 1]!,
})
export const throwKeys = (map: readonly string[]) => map.slice(NOTE_COUNT + 2)

export const throwForKey = (key: string) =>
  THROWS[throwKeys(keymap.get()).indexOf(key.toLowerCase())]

export type KeyRole =
  | { kind: 'note'; index: number }
  | { kind: 'octave'; step: -1 | 1 }
  | { kind: 'throw'; name: string }

export function roleOf(
  map: readonly string[],
  letter: string,
): KeyRole | undefined {
  const at = map.indexOf(letter)
  if (at < 0) return undefined
  if (at < NOTE_COUNT) return { kind: 'note', index: at }
  if (at < NOTE_COUNT + 2)
    return { kind: 'octave', step: at === NOTE_COUNT ? -1 : 1 }
  return { kind: 'throw', name: THROWS[at - NOTE_COUNT - 2]!.name }
}

/** Put the job on `from` onto `to`. A job already on `to` takes the letter
    `from` freed, so every job keeps a key and no two share one. */
export function moveKey(from: string, to: string) {
  const next = [...keymap.get()]
  const i = next.indexOf(from)
  if (i < 0 || from === to || !CAPS.includes(to)) return
  const j = next.indexOf(to)
  next[i] = to
  if (j >= 0) next[j] = from
  setKeymap(next)
}

export function setKeymap(next: readonly string[]) {
  keymap.set(next)
  write(KEYMAP_KEY, JSON.stringify(next))
}

export function resetKeymap() {
  keymap.set(DEFAULT_KEYMAP)
  forget(KEYMAP_KEY)
}
