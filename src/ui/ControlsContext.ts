import { useSyncExternalStore } from 'react'
import type { ControlKey, Controls } from '../controls'
import { engine } from '../engine/engine'

// One figure read off the board, rather than the board. Every write hands the
// store a fresh object — and a morph writes one per animation frame for as long
// as it travels — so a component that takes the whole board to read one number
// out of it redraws sixty times a second to print the same number. Working the
// figure out inside the snapshot puts React's own Object.is between the store
// and the render, and the component only hears about the writes that moved it.
//
// Whatever `read` returns has to be comparable that way: a number, a string, a
// flag. Anything built fresh each call is a new object every frame again.
export function useBoardValue<T extends string | number | boolean | undefined>(
  read: (c: Controls) => T,
): T {
  return useSyncExternalStore(engine.controls.subscribe, () =>
    read(engine.controls.get()),
  )
}

export function useControlValue(key: ControlKey): number {
  return useBoardValue(c => c[key])
}

export function useStoreValue<T>(store: {
  subscribe: (fn: () => void) => () => void
  get: () => T
}): T {
  return useSyncExternalStore(store.subscribe, store.get)
}
