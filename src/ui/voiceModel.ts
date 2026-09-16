// A voice is a whole board under a name, the way a synth calls a patch: dial
// something in, name it, get it back on the next machine you sign in on.
//
// The stored form is the board hash without its `#` — exactly what
// `boardHash(hash, controls)` writes into the address bar. That buys two
// things. The parser already drops controls it no longer recognises, so a voice
// that outlives a renamed knob loses the knob instead of failing to open; and a
// voice is a link for free, since prefixing the origin and a `#` is all a share
// takes.
//
// This file is the storage-agnostic half — the list algebra and the name rules.
// cloud.ts reads and writes it.
// CROSS_REPO_SYNC(saved-list-model)
export interface SavedVoice {
  name: string
  query: string
  id?: string
  savedAt?: number
}

// The board a signed-in user last had open, offered back by the home page.
export interface CurrentSession {
  query: string
  at: number
}

// How many voices one account has. The rules refuse a longer list.
export const VOICE_MAX = 200

// The longest query the rules accept, which a packed board never approaches.
export const QUERY_MAX = 8000

export const VOICE_NAME_MAX = 40

export const newVoiceId = (): string => Math.random().toString(36).slice(2, 10)

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

// Collapse the whitespace a paste brings, and cap the length.
export const cleanVoiceName = (raw: string): string =>
  raw.replaceAll(/\s+/g, ' ').trim().slice(0, VOICE_NAME_MAX).trim()

// Nothing out of the document is trusted: it can carry a shape an older build
// wrote, or one a hand-rolled request did. Both fields have to be strings — the
// name is rendered and the query goes to URLSearchParams.
function readVoice(raw: unknown): SavedVoice | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const name = 'name' in raw ? raw.name : undefined
  const query = 'query' in raw ? raw.query : undefined
  if (typeof name !== 'string' || typeof query !== 'string') return undefined
  if (query.length > QUERY_MAX) return undefined
  const clean = cleanVoiceName(name)
  if (clean === '') return undefined
  const id = 'id' in raw && typeof raw.id === 'string' ? raw.id : undefined
  const savedAt = 'savedAt' in raw ? num(raw.savedAt) : undefined
  return {
    name: clean,
    query,
    ...(id === undefined ? {} : { id }),
    ...(savedAt === undefined ? {} : { savedAt }),
  }
}

export const readVoices = (raw: unknown): SavedVoice[] =>
  (Array.isArray(raw) ? raw : [])
    .flatMap(item => {
      const voice = readVoice(item)
      return voice === undefined ? [] : [voice]
    })
    .slice(0, VOICE_MAX)

export function readCurrent(raw: unknown): CurrentSession | null {
  if (typeof raw !== 'object' || raw === null) return null
  const query = 'query' in raw ? raw.query : undefined
  const at = 'at' in raw ? num(raw.at) : undefined
  if (typeof query !== 'string' || query.length > QUERY_MAX) return null
  return at === undefined ? null : { query, at }
}

// Save under a name, overwriting any voice already using it **in place**. The
// list is read by eye during a set, so a re-save must not reshuffle everything
// above it. `at` stamps the save and mints an id for a voice that has none; an
// overwrite keeps the id it already had.
export function upsertVoice(
  voices: readonly SavedVoice[],
  name: string,
  query: string,
  at?: number,
): SavedVoice[] {
  const clean = cleanVoiceName(name)
  if (clean === '') return [...voices]
  const index = voices.findIndex(item => item.name === clean)
  const prior = index === -1 ? undefined : voices[index]
  const entry: SavedVoice = { name: clean, query }
  if (prior?.id !== undefined) entry.id = prior.id
  if (at !== undefined) {
    entry.id ??= newVoiceId()
    entry.savedAt = at
  }
  if (index !== -1) return voices.map((item, i) => (i === index ? entry : item))
  return [...voices, entry].slice(-VOICE_MAX)
}

export const removeVoice = (
  voices: readonly SavedVoice[],
  name: string,
): SavedVoice[] => voices.filter(item => item.name !== name)

// What the name box offers, so saving is type-nothing-and-press-save. `base` is
// whatever the board is already called — the preset it matches, or the voice
// last saved — and the counter only appears once that name is taken.
export function suggestVoiceName(
  voices: readonly SavedVoice[],
  base: string,
): string {
  const clean = cleanVoiceName(base)
  const stem = clean === '' ? 'my voice' : clean
  if (!voices.some(item => item.name === stem)) return stem
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} ${n}`
    if (!voices.some(item => item.name === candidate)) return candidate
  }
  return stem
}
// CROSS_REPO_SYNC_END(saved-list-model)
