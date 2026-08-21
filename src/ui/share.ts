import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls'
import { EDITOR_KEYS, sliderFor, snapToStep } from './controls'
import { asLen, asMask, LEN_KEYS } from '../drums'

// A board as a link: every control that is off stock, by name, so a link keeps
// working when the param table grows or its order changes. Names cost more
// characters than indices and are worth it — a stale link decodes to the board
// it meant, and anything it names that no longer exists is simply dropped.
//
// It rides in the hash, and the address bar carries it at all times rather than
// only once someone presses share (see useBoardUrl). The board on screen is
// then always the board the url names: a reload keeps it, and copying out of
// the address bar is as good as the button. The hash keeps every board on one
// page as far as the server is concerned, so no host has to be taught to serve
// the app for a url it has never seen.

const PARAM = 'set'

// Where a board rode before the hash: for a while in the query string under the
// same name, and before that in the hash under a shorter one. Read, never
// written, so links from those days still open the board they meant.
const LEGACY_HASH_KEY = 'b'

// Your finger is not part of the board.
const PRIVATE = new Set<ControlKey>(['bodyX', 'bodyY'])

export function encodeControls(c: Controls): string {
  const parts: string[] = []
  for (const key of CONTROL_KEYS) {
    if (PRIVATE.has(key)) continue
    const v = c[key]
    if (v === DEFAULT_CONTROLS[key] || !Number.isFinite(v)) continue
    parts.push(`${key}:${Number(v.toFixed(4))}`)
  }
  return parts.join(',')
}

export function decodeControls(encoded: string): Partial<Controls> {
  const out: Partial<Controls> = {}
  for (const part of encoded.split(',')) {
    const at = part.indexOf(':')
    if (at <= 0) continue
    const key = part.slice(0, at) as ControlKey
    // Own keys only: `in` also answers yes to every name Object's prototype
    // carries, so `#set=toString:1` used to get past here and take the whole
    // app down on the way to a slider that was never going to exist.
    if (!Object.hasOwn(DEFAULT_CONTROLS, key) || PRIVATE.has(key)) continue
    const raw = part.slice(at + 1).trim()
    const v = Number(raw)
    if (raw === '' || !Number.isFinite(v)) continue
    // The grid's controls have no slider to snap to: a pattern is sixteen bits
    // or nothing, and a row's length is a whole number of steps it can play.
    out[key] = LEN_KEYS.has(key)
      ? asLen(v)
      : EDITOR_KEYS.has(key)
        ? asMask(v)
        : snapToStep(sliderFor(key), v)
  }
  return out
}

// The hash a board writes, over whatever the address bar already had. A stock
// board drops the param rather than writing an empty one: everything the link
// carries is a control off stock, so a board with none of those is the same
// board a bare url opens.
export function boardHash(hash: string, c: Controls): string {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  // The board is written under one name, so the older one does not ride along
  // beside it saying something staler.
  q.delete(LEGACY_HASH_KEY)
  const set = encodeControls(c)
  if (set === '') q.delete(PARAM)
  else q.set(PARAM, set)
  // A fragment may carry ':' and ',' as themselves, and this one is read off
  // the address bar by people, so the separators go back to being one
  // character each. The reader takes them either way.
  return q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')
}

// Whatever board the link carried, or nothing. The hash wins over the query so
// that a link made today reads as itself even when it lands on a tab whose bar
// still carries an older board.
export function boardFromUrl(
  search: string,
  hash: string,
): Partial<Controls> | null {
  const h = new URLSearchParams(hash.replace(/^#/, ''))
  const raw =
    h.get(PARAM) ??
    h.get(LEGACY_HASH_KEY) ??
    new URLSearchParams(search).get(PARAM)
  if (raw === null) return null
  const patch = decodeControls(raw)
  return Object.keys(patch).length > 0 ? patch : null
}

// The whole board a link names, not just the controls it lists. Everything it
// leaves out is at stock — that is what makes a link a board rather than an
// edit — so a hash arriving in a tab that is already on a board has to put the
// rest back, or the board on screen is neither the one the link names nor the
// one it replaced. A load gets this for free by starting from stock; a
// hashchange does not.
//
// Your finger is the exception, because the link never carried it either way.
export function boardFrom(
  patch: Partial<Controls>,
  current: Controls,
): Controls {
  const next: Controls = { ...DEFAULT_CONTROLS, ...patch }
  for (const key of PRIVATE) next[key] = current[key]
  return next
}

export function boardUrl(c: Controls): string {
  const hash = boardHash(window.location.hash, c)
  const { origin, pathname, search } = window.location
  // Assembled from the parts rather than edited in place, so a link read out of
  // the old query comes back as a hash and the query goes with it.
  const query = new URLSearchParams(search)
  query.delete(PARAM)
  const q = query.toString()
  return `${origin}${pathname}${q ? `?${q}` : ''}${hash ? `#${hash}` : ''}`
}

export function boardFromLocation(): Partial<Controls> | null {
  return boardFromUrl(window.location.search, window.location.hash)
}
