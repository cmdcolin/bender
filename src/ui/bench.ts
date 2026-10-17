const KEY = 'bender.bench'

export interface Bench {
  all: boolean
  closed: readonly string[]
}

const EMPTY: Bench = { all: false, closed: [] }

export function parseBench(raw: string | null): Bench {
  if (raw === null) return EMPTY
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return EMPTY
    const { all, closed } = value as Record<string, unknown>
    return {
      all: all === true,
      closed: Array.isArray(closed)
        ? closed.filter(s => typeof s === 'string')
        : [],
    }
  } catch {
    return EMPTY
  }
}

export function loadBench(): Bench {
  try {
    return parseBench(localStorage.getItem(KEY))
  } catch {
    return EMPTY
  }
}

export function saveBench(bench: Bench) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bench))
  } catch {
    // A bench that will not persist is still a bench.
  }
}
