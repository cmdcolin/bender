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
// It rides in the query string, and the address bar carries it at all times
// rather than only once someone presses share (see useBoardUrl). The board on
// screen is then always the board the url names: a reload keeps it, and copying
// out of the address bar is as good as the button.

const PARAM = 'set'

// Where a board rode before the query string. Read, never written, so links
// from that day still open the board they meant.
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
    if (!(key in DEFAULT_CONTROLS) || PRIVATE.has(key)) continue
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

// The query a board writes, over whatever the address bar already had. A stock
// board drops the param rather than writing an empty one: everything the link
// carries is a control off stock, so a board with none of those is the same
// board a bare url opens.
export function boardQuery(search: string, c: Controls): string {
  const q = new URLSearchParams(search)
  const set = encodeControls(c)
  if (set === '') q.delete(PARAM)
  else q.set(PARAM, set)
  return q.toString()
}

// Whatever board the link carried, or nothing.
export function boardFromUrl(
  search: string,
  hash: string,
): Partial<Controls> | null {
  const legacy = hash.replace(/^#/, '')
  const raw =
    new URLSearchParams(search).get(PARAM) ??
    (legacy.startsWith(`${LEGACY_HASH_KEY}=`)
      ? legacy.slice(LEGACY_HASH_KEY.length + 1)
      : null)
  if (raw === null) return null
  const patch = decodeControls(raw)
  return Object.keys(patch).length > 0 ? patch : null
}

export function boardUrl(c: Controls): string {
  const query = boardQuery(window.location.search, c)
  // Assembled from the origin and path rather than edited in place, so a link
  // read out of the old hash comes back as a query and the hash goes with it.
  return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`
}

export function boardFromLocation(): Partial<Controls> | null {
  return boardFromUrl(window.location.search, window.location.hash)
}
