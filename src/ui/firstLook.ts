import { read, write } from './persist.ts'

const KEY = 'bender.lookedAt'

function lookedAt(): string[] {
  try {
    const saved: unknown = JSON.parse(read(KEY) ?? '[]')
    return Array.isArray(saved)
      ? saved.filter((s): s is string => typeof s === 'string')
      : []
  } catch {
    return []
  }
}

/** Whether this browser has never opened the stage before. */
export const firstLook = (stage: string) => !lookedAt().includes(stage)

export function markLooked(stage: string) {
  const seen = lookedAt()
  if (!seen.includes(stage)) write(KEY, JSON.stringify([...seen, stage]))
}
