import { useSyncExternalStore } from 'react'
import type { ControlKey, Controls } from '../controls'
import { engine, type Meter } from '../engine/engine'

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

// The same bargain against the meter, which posts a fresh object every frame
// for as long as the audio thread runs. A component that takes the whole meter
// to read one figure off it redraws at frame rate for ever; one that reads a
// figure only hears the frames that moved it — and on a board with nothing
// wrong, most of what the meter carries does not move at all.
export function useMeterValue<T extends string | number | boolean | undefined>(
  read: (m: Meter) => T,
): T {
  return useSyncExternalStore(engine.meter.subscribe, () =>
    read(engine.meter.get()),
  )
}

export function useStoreValue<T>(store: {
  subscribe: (fn: () => void) => () => void
  get: () => T
}): T {
  return useSyncExternalStore(store.subscribe, store.get)
}
