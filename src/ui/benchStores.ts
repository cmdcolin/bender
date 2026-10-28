import { createStore, type Store } from '../listeners.ts'

import type { NoteDest } from '../engine/messages.ts'
import type { Point } from './cablePaths.ts'
import type { Machine } from './connections.ts'

/** A machine whose GATE jack takes Plinky's notes. */
export type Taker = Exclude<NoteDest, 'toy'> | 'kit'

/** A TRIG input: a keyboard's, or the ADSR's gate on the MOD plate. */
export type TrigTaker = NoteDest | 'adsr'

export interface GateIn {
  el: HTMLElement
  notes?: Store<ReadonlySet<number>>
}

export const inputs = createStore<ReadonlyMap<Taker, GateIn>>(new Map())
export const gateOut = createStore<HTMLElement | null>(null)
export const trigIns = createStore<ReadonlyMap<TrigTaker, HTMLElement>>(
  new Map(),
)
export const trigOuts = createStore<ReadonlyMap<number, HTMLElement>>(new Map())
export const modOuts = createStore<ReadonlyMap<number, HTMLElement>>(new Map())
export const cvIns = createStore<ReadonlyMap<Machine, HTMLElement>>(new Map())

export function keep<K, V>(
  store: Store<ReadonlyMap<K, V>> & {
    set: (m: ReadonlyMap<K, V>) => void
  },
  key: K,
  value: V | null,
) {
  const next = new Map(store.get())
  if (value === null) next.delete(key)
  else next.set(key, value)
  store.set(next)
}

/** One end of a GATE cable: a machine's GATE input, or Plinky's output. */
export type GateEnd = Taker | 'plinky'

/** One end of a TRIG cable: a keyboard's input, or a voice's jack on the kit. */
export type TrigEnd =
  | { taker: TrigTaker; voice?: undefined }
  | { voice: number; taker?: undefined }

/** One end of a MOD cable: a source's jack on the MOD plate, or a CV input. */
export type ModEnd =
  | { src: number; machine?: undefined }
  | { machine: Machine; src?: undefined }

export type Drag = Point &
  (
    | { line: 'gate'; fixed: GateEnd; carried: Taker | null }
    | { line: 'trig'; fixed: TrigEnd; carried: TrigTaker | null }
    | { line: 'mod'; fixed: ModEnd; carried: number | null }
  )

export const dragging = createStore<Drag | null>(null)
