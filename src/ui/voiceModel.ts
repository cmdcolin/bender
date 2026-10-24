// A voice is a whole board under a name, the way a synth calls a patch: dial
// something in, name it, get it back on the next machine you sign in on.
//
// The stored form is the board hash without its `#` — exactly what
// `boardHash(hash, controls)` writes into the address bar. The parser drops
// controls it no longer recognises, so a voice that outlives a renamed knob
// loses the knob instead of failing to open, and a voice is a link for free.
//
// The list algebra and the name rules live in skillet-shared/saved-list; this
// file gives them bender's names and its session cap.
import {
  ITEM_MAX,
  ITEM_NAME_MAX,
  cleanItemName,
  newItemId,
  pushRecent as pushItemRecent,
  readItems,
  readRecent as readItemRecent,
  removeItem,
  renameItem,
  suggestItemName,
  upsertItem,
} from 'skillet-shared/saved-list'

export type {
  CurrentSession,
  RecentSession,
  SavedItem as SavedVoice,
} from 'skillet-shared/saved-list'
export { QUERY_MAX, readCurrent, removeRecent } from 'skillet-shared/saved-list'

import type { RecentSession } from 'skillet-shared/saved-list'

// How many sessions one account keeps. The rules refuse a longer list.
export const RECENT_MAX = 8

export const VOICE_MAX = ITEM_MAX
export const VOICE_NAME_MAX = ITEM_NAME_MAX
export const newVoiceId = newItemId
export const cleanVoiceName = cleanItemName
export const readVoices = readItems
export const removeVoice = removeItem
export const renameVoice = renameItem
export const upsertVoice = upsertItem

export const suggestVoiceName = (
  voices: Parameters<typeof suggestItemName>[0],
  base: string,
) => suggestItemName(voices, base, 'my voice')

export const readRecent = (raw: unknown, legacy?: unknown) =>
  readItemRecent(raw, RECENT_MAX, legacy)

export const pushRecent = (
  recent: readonly RecentSession[],
  entry: RecentSession,
) => pushItemRecent(recent, entry, RECENT_MAX)
