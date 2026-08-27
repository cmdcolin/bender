import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls'
import { EDITOR_KEYS, sliderFor, snapToStep } from './controls'
import { asLen, asMask, LEN_KEYS } from '../drums'
import { asTuneLen, asTuneStep, TUNE_STEP_KEYS } from '../tune'
import { packControls, unpackControls } from './packed'

const TUNE_KEYS = new Set<ControlKey>(TUNE_STEP_KEYS)

// A board as a link, in two forms that say the same thing.
//
// The short one, `#p=`, is the board as bytes and is what the bar carries by
// default — four times shorter, which is the difference between a link that
// survives a chat window and one that arrives in three pieces. See packed.ts.
//
// The long one, `#set=`, names every control that is off stock. It costs the
// characters and buys two things back. A stale link still decodes to the board
// it meant when the param table grows or its order changes, and — the reason
// it is still written rather than only read — you can program the board by
// typing at the address bar: `#set=chipStarve:0.8,dlyFb:0.6` is a patch you
// wrote by hand. So a bar already carrying the long form keeps carrying it,
// and everything else gets the short one.
//
// Both ride in the hash, and the address bar carries the board at all times
// rather than only once someone presses share (see useBoardUrl). The board on
// screen is then always the board the url names: a reload keeps it, and copying
// out of the address bar is as good as a button. The hash keeps every board on
// one page as far as the server is concerned, so no host has to be taught to
// serve the app for a url it has never seen.

const PARAM = 'set'
const PACKED = 'p'

// Where a board rode before the hash: for a while in the query string under the
// same name, and before that in the hash under a shorter one. Read, never
// written, so links from those days still open the board they meant.
const LEGACY_HASH_KEY = 'b'

// Your finger is not part of the board.
const PRIVATE = new Set<ControlKey>(['bodyX', 'bodyY'])
const isPrivate = (key: ControlKey) => PRIVATE.has(key)

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
    // The controls a widget turns have no slider to snap to, and they are not
    // all the same shape: a pattern is sixteen bits or nothing, a row's length
    // is a whole number of steps it can play, and a step of the memory is a
    // note, a rest or a hold.
    out[key] = LEN_KEYS.has(key)
      ? asLen(v)
      : TUNE_KEYS.has(key)
        ? asTuneStep(v)
        : key === 'tuneLen'
          ? asTuneLen(v)
          : EDITOR_KEYS.has(key)
            ? asMask(v)
            : snapToStep(sliderFor(key), v)
  }
  return out
}

// Which form the bar is already in, and so which one the next write uses. A
// hash someone typed by hand is a hash they mean to keep typing into, so the
// long form is sticky: arrive on one, or type `#set=` into an empty bar, and
// the board stays readable for as long as you are working that way. Everything
// else — a fresh load, a short link, the legacy `b` — comes out short.
const wantsLong = (q: URLSearchParams) => q.has(PARAM) || q.has(LEGACY_HASH_KEY)

// The hash a board writes, over whatever the address bar already had. A stock
// board drops the param rather than writing an empty one: everything the link
// carries is a control off stock, so a board with none of those is the same
// board a bare url opens. The exception is a bar sitting in the long form,
// which keeps its empty `set=` — that marker is the only thing saying which
// form to write, and dropping it would snap the next control you move back to
// bytes under your cursor.
export function boardHash(hash: string, c: Controls): string {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const long = wantsLong(q)
  // The board is written under one name, so no other form rides along beside
  // it saying something staler.
  q.delete(LEGACY_HASH_KEY)
  q.delete(long ? PACKED : PARAM)
  const key = long ? PARAM : PACKED
  const set = long ? encodeControls(c) : packControls(c, isPrivate)
  if (set === '' && !long) q.delete(key)
  else q.set(key, set)
  // A fragment may carry ':' and ',' as themselves, and this one is read off
  // the address bar by people, so the separators go back to being one
  // character each. The reader takes them either way.
  return q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',')
}

// Whatever board the link carried, or nothing. The hash wins over the query so
// that a link made today reads as itself even when it lands on a tab whose bar
// still carries an older board, and a hash carrying both forms reads as the
// long one — the same one wantsLong picks, so what a mangled bar shows is what
// the next write keeps.
export function boardFromUrl(
  search: string,
  hash: string,
): Partial<Controls> | null {
  const h = new URLSearchParams(hash.replace(/^#/, ''))
  const packed = h.get(PACKED)
  const named =
    h.get(PARAM) ??
    h.get(LEGACY_HASH_KEY) ??
    (packed === null ? new URLSearchParams(search).get(PARAM) : null)
  if (named === null && packed === null) return null
  const patch =
    named === null
      ? unpackControls(packed ?? '', isPrivate)
      : decodeControls(named)
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
