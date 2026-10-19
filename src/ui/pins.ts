import { isControlKey, type ControlKey } from '../controls.ts'
import { createStore } from '../listeners.ts'
import { SLIDER_BY_KEY } from './controls/index.ts'
import { read, write } from './persist.ts'

const PINS_KEY = 'bender.pins'

function load(): ControlKey[] {
  try {
    const saved: unknown = JSON.parse(read(PINS_KEY) ?? '[]')
    return Array.isArray(saved)
      ? saved.filter(
          (k): k is ControlKey =>
            typeof k === 'string' && isControlKey(k) && SLIDER_BY_KEY.has(k),
        )
      : []
  } catch {
    return []
  }
}

/** The controls pinned to the strip beside the instruments, in pin order. */
export const pins = createStore<readonly ControlKey[]>(load())

export function togglePin(key: ControlKey) {
  const now = pins.get()
  const next = now.includes(key) ? now.filter(k => k !== key) : [...now, key]
  pins.set(next)
  write(PINS_KEY, JSON.stringify(next))
}
