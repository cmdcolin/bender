import { useSyncExternalStore } from 'react'
import type { ControlKey } from '../controls'
import { engine } from '../engine/engine'

export function useControlValue(key: ControlKey): number {
  return useSyncExternalStore(
    engine.controls.subscribe,
    () => engine.controls.get()[key],
  )
}

export function useStoreValue<T>(store: {
  subscribe: (fn: () => void) => () => void
  get: () => T
}): T {
  return useSyncExternalStore(store.subscribe, store.get)
}
