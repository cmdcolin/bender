export interface Store<T> {
  subscribe: (fn: () => void) => () => void
  get: () => T
}

export function createStore<T>(initial: T): Store<T> & { set: (next: T) => void } {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    get: () => value,
    set(next) {
      value = next
      for (const fn of listeners) fn()
    },
  }
}
