// The board of the day: one roll of the dice, seeded by the UTC date, so every
// visitor gets the same board until midnight UTC. Adding a preset or changing
// the roll changes the boards for days not yet shared; a shared link keeps the
// board it carries.
import { DEFAULT_CONTROLS } from '../controls'
import { mulberry32 } from '../dsp/util/rng'
import { randomLook } from './presets/roll'
import { PRESETS } from './presets/table'
import { boardHash } from './share'

export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10)

// FNV-1a over the key, so neighbouring dates seed unrelated rolls.
const seedOf = (key: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export interface DailyBoard {
  day: string
  query: string
  /** The preset the roll started from. */
  from: string
}

export function dailyBoard(now: number): DailyBoard {
  const day = dayKey(now)
  const board = randomLook(DEFAULT_CONTROLS, mulberry32(seedOf(day)))
  // randomLook picks its preset with the first draw.
  const first = mulberry32(seedOf(day))()
  const from = PRESETS[Math.floor(first * PRESETS.length)]!.name
  return { day, query: boardHash('', board), from }
}
