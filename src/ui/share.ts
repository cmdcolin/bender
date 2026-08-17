import { CONTROL_KEYS, DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { sliderFor, snapToStep } from './controls'

// A board as a link: every control that is off stock, by name, so a link keeps
// working when the param table grows or its order changes. Names cost more
// characters than indices and are worth it — a stale link decodes to the board
// it meant, and anything it names that no longer exists is simply dropped.

const HASH_KEY = 'b'

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
    out[key] = snapToStep(sliderFor(key), v)
  }
  return out
}

export function boardUrl(c: Controls): string {
  const url = new URL(window.location.href)
  url.hash = `${HASH_KEY}=${encodeControls(c)}`
  return url.toString()
}

// Whatever board the link carried, or nothing.
export function boardFromLocation(): Partial<Controls> | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.startsWith(`${HASH_KEY}=`)) return null
  const patch = decodeControls(hash.slice(HASH_KEY.length + 1))
  return Object.keys(patch).length > 0 ? patch : null
}
