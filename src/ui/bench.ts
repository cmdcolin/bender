import { createStore } from '../listeners.ts'
import { read, write } from './persist.ts'

const KEY = 'bender.bench'

// What the main area shows. `all` lays out every instrument whatever its fader
// says; `closed` is the instruments the player has put away; `pedals` is the
// pedals the player has brought up, none until asked for. `roll` and `grid`
// are the piano roll and the drum pattern in the stage panels, which stay out
// of the panel until asked for.
export interface Bench {
  all: boolean
  closed: readonly string[]
  pedals: readonly string[]
  roll: boolean
  grid: boolean
}

export const INSTRUMENTS = [
  'Toy keyboard',
  'Toy drums',
  'FM chip',
  'Home keyboard',
  'Mono synth',
  'Tape loop',
] as const

const EMPTY: Bench = {
  all: false,
  closed: [],
  pedals: [],
  roll: false,
  grid: false,
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(s => typeof s === 'string') : []

export function sanitizeBench(value: unknown): Bench {
  if (typeof value !== 'object' || value === null) return EMPTY
  const all = 'all' in value ? value.all : undefined
  const closed = 'closed' in value ? value.closed : undefined
  const pedals = 'pedals' in value ? value.pedals : undefined
  const roll = 'roll' in value ? value.roll : undefined
  const grid = 'grid' in value ? value.grid : undefined
  return {
    all: all === true,
    closed: strings(closed),
    pedals: strings(pedals),
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
