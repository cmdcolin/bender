import { createStore } from '../listeners.ts'
import { read, write } from './persist.ts'
import { RENAMED } from './stageNames.ts'

const KEY = 'bender.bench'

// What the main area shows. `instruments`, `pedals` and `bends` are the faces
// the player has brought up, none until asked for; an instrument whose fader is up shows
// without being asked, unless it is in `closed`, the ones put away. `roll` and `grid` are the piano roll and the drum
// pattern in the stage panels, which stay out of the panel until asked for.
export interface Bench {
  instruments: readonly string[]
  closed: readonly string[]
  pedals: readonly string[]
  bends: readonly string[]
  roll: boolean
  grid: boolean
}

export const INSTRUMENTS = [
  'Plinky',
  'Clatter',
  'Glint',
  'Parlor',
  'Growler',
  'Spool',
  'Layercake',
] as const

const EMPTY: Bench = {
  instruments: [],
  closed: [],
  pedals: [],
  bends: [],
  roll: false,
  grid: false,
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(s => typeof s === 'string').map(s => RENAMED[s] ?? s)
    : []

export function sanitizeBench(value: unknown): Bench {
  if (typeof value !== 'object' || value === null) return EMPTY
  const instruments = 'instruments' in value ? value.instruments : undefined
  const closed = 'closed' in value ? value.closed : undefined
  const pedals = 'pedals' in value ? value.pedals : undefined
  const bends = 'bends' in value ? value.bends : undefined
  const roll = 'roll' in value ? value.roll : undefined
  const grid = 'grid' in value ? value.grid : undefined
  return {
    instruments: strings(instruments),
    closed: strings(closed),
    pedals: strings(pedals),
    bends: strings(bends),
    roll: roll === true,
    grid: grid === true,
  }
}

export function parseBench(raw: string | null): Bench {
  if (raw === null) return EMPTY
  try {
    return sanitizeBench(JSON.parse(raw))
  } catch {
    return EMPTY
  }
}

export const bench = createStore<Bench>(parseBench(read(KEY)))

export function setBench(next: Bench) {
  bench.set(next)
  write(KEY, JSON.stringify(next))
}
