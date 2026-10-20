import { useSyncExternalStore } from 'react'

import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { createStore } from '../listeners.ts'
import {
  groupKeys,
  HOLD_KEYS,
  touchedCount,
  type Group,
} from './controls/index.ts'
import { useBoardValue } from './ControlsContext.ts'
import { cutStands, resetKeys, type CutDef } from './presets/index.ts'

// For each stage and fold, the values its rolls overwrote. Undo there puts the
// last roll's controls back and leaves every other control where it stands.

type Was = readonly (readonly [ControlKey, number])[]

const DEPTH = 16

const stashes = createStore<ReadonlyMap<string, readonly Was[]>>(new Map())

const put = (scope: string, stack: readonly Was[]) => {
  const next = new Map(stashes.get())
  if (stack.length === 0) next.delete(scope)
  else next.set(scope, stack)
  stashes.set(next)
}

export function rollIn(scope: string, target: Controls, seconds: number) {
  const now = engine.controls.get()
  const was = CONTROL_KEYS.filter(
    k => !HOLD_KEYS.has(k) && target[k] !== now[k],
  ).map(k => [k, now[k]] as const)
  if (was.length > 0)
    put(scope, [...(stashes.get().get(scope) ?? []), was].slice(-DEPTH))
  engine.morphTo(target, seconds)
}

const moves = (was: Was, c: Controls) => was.some(([k, v]) => c[k] !== v)

// undoRoll skips an entry the board already matches, such as one a ctrl+z or a
// hand has put back.
export function undoRoll(scope: string, seconds: number) {
  const stack = [...(stashes.get().get(scope) ?? [])]
  const now = engine.controls.get()
  let was = stack.pop()
  while (was && !moves(was, now)) was = stack.pop()
  put(scope, stack)
  if (!was) return
  const back = { ...now }
  for (const [k, v] of was) back[k] = v
  engine.morphTo(back, seconds)
}

const live = (scope: string) =>
  (stashes.get().get(scope) ?? []).some(was =>
    moves(was, engine.controls.get()),
  )

export function useCanUndoRoll(scope: string): boolean {
  useSyncExternalStore(stashes.subscribe, stashes.get)
  return useBoardValue(() => live(scope))
}

export function resetIn(keys: readonly ControlKey[], seconds: number) {
  engine.morphTo(resetKeys(engine.controls.get(), keys), seconds, new Set(keys))
}

export const useMovedCount = (keys: readonly ControlKey[]): number =>
  useBoardValue(c => keys.filter(k => c[k] !== DEFAULT_CONTROLS[k]).length)

export function useTouchedCount(group: Group): number {
  return useBoardValue(c => touchedCount(group, c))
}

export function putBack(group: Group, seconds: number) {
  resetIn(groupKeys(group), seconds)
}

export const putBackTitle = (group: Group, touched: number) =>
  `put all ${touched} of ${group.name}'s moved controls back where they booted — ctrl+z brings them again`

export const useStanding = (cuts: CutDef[]) =>
  useBoardValue(c => cuts.find(cut => cutStands(cut, c))?.name ?? '')
