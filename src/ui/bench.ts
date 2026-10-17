import { createStore } from '../listeners.ts'
import { read, write } from './persist.ts'

const KEY = 'bender.bench'

// Which instruments the main area shows. `all` lays out every one whatever its
// fader says; `closed` is the stages the player has put away.
export interface Bench {
  all: boolean
  closed: readonly string[]
}

const EMPTY: Bench = { all: false, closed: [] }

export function sanitizeBench(value: unknown): Bench {
  if (typeof value !== 'object' || value === null) return EMPTY
  const all = 'all' in value ? value.all : undefined
  const closed = 'closed' in value ? value.closed : undefined
  return {
    all: all === true,
    closed: Array.isArray(closed)
      ? closed.filter(s => typeof s === 'string')
      : [],
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
