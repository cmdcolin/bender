// The shelf the wire's maps are kept on. Every map the MIDI side holds — knobs,
// pads, the toggles either of them read — goes through here, so a browser that
// refuses to store anything costs a binding rather than a board.

export function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A board that will not persist its bindings is still a board.
  }
}

export function forget(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

/** A copy of a partial map without one key. */
export function omit<K extends string, V>(
  map: Partial<Record<K, V>>,
  key: K,
): Partial<Record<K, V>> {
  const out = { ...map }
  delete out[key]
  return out
}

// A stored map read back. Nothing in it is trusted: the JSON is whatever was on
// the shelf when the app last shipped a different set of keys, so `key` decides
// which names still mean something and `value` decides which entries are still
// shaped like a binding. Anything either one rejects is dropped rather than kept
// as an entry that fires into nothing — the panel lists a map by walking the
// keys it knows, so an entry it can't show could never be cleared by hand.
export function parseMap<K extends string, V>(
  raw: string | null,
  key: (name: string) => K | null,
  value: (stored: object) => V | null,
): Partial<Record<K, V>> {
  if (raw === null) return {}
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof stored !== 'object' || stored === null) return {}
  const out: Partial<Record<K, V>> = {}
  for (const [name, v] of Object.entries(stored)) {
    const k = key(name)
    if (k === null || typeof v !== 'object' || v === null) continue
    const parsed = value(v)
    if (parsed !== null) out[k] = parsed
  }
  return out
}
