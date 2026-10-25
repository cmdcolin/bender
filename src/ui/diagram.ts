import { createContext, use, useState } from 'react'

import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { CHANNELS, GROUPS, sliderFor, TRACK_NUMBERS } from './controls/index.ts'
import { useBoardValue, useStoreSelect } from './ControlsContext.ts'
import { useOnAim } from './reveal.ts'

// CROSS_REPO_SYNC(diagram-boxes)
export const LINE_H = 13
const PAD = 7

export interface BoxSpec {
  x: number
  y: number
  w: number
  /** Taller than its text needs, so a row of boxes shares one height. */
  h?: number
  /** A `\n` breaks the name over two lines. */
  name: string
  off?: boolean
  touched: boolean
  help: string
  /** Pressing the box picks it, and the rows under the drawing become its
      `keys`. A box with no keys is drawn and does nothing. */
  id?: string
  keys?: readonly ControlKey[]
  note?: string
}

// The group a drawing sits in, named so that the drawing reopens on the box it
// left open after its group folds and unmounts it.
export const BoxScope = createContext<string | null>(null)
const leftOpen = new Map<string, string | null>()

// Which box the drawing has open. A second press on it puts the rows away.
export function useSelectedBox(initial: string | null = null) {
  const scope = use(BoxScope)
  const [selected, setSelected] = useState<string | null>(() =>
    scope !== null && leftOpen.has(scope) ? leftOpen.get(scope)! : initial,
  )
  return {
    selected,
    toggle: (id: string) => {
      const next = selected === id ? null : id
      if (scope !== null) leftOpen.set(scope, next)
      setSelected(next)
    },
  }
}

export type BoxPick = ReturnType<typeof useSelectedBox>

export const CHAR_W = 5.8

export const boxWidth = (name: string) =>
  Math.ceil(
    Math.max(...name.split('\n').map(line => line.length * CHAR_W)) + 2 * PAD,
  )

export const boxHeight = (name: string) =>
  PAD + LINE_H * name.split('\n').length
// CROSS_REPO_SYNC_END(diagram-boxes)

/** The height of a box with a one-line name. */
export const ONE_LINE_H = boxHeight('')

export function useOpensOnAim(
  pick: BoxPick,
  holds:
    | readonly { id?: string; keys?: readonly ControlKey[] }[]
    | Readonly<Record<string, readonly ControlKey[]>>,
) {
  useOnAim(key => {
    const boxes: readonly { id?: string; keys?: readonly ControlKey[] }[] =
      Array.isArray(holds)
        ? holds
        : Object.entries(holds).map(([id, keys]) => ({ id, keys }))
    const box = boxes.find(b => b.id && b.keys?.some(k => k === key))
    if (box && pick.selected !== box.id) pick.toggle(box.id!)
  })
}

export const card = (pick: BoxPick, name = pick.selected) =>
  pick.selected === null || name === null
    ? undefined
    : { name, onHide: () => pick.toggle(pick.selected!) }

/** The knobs a group files under one heading. */
export const partKeys = (group: string, part: string): ControlKey[] =>
  GROUPS.find(g => g.name === group)!
    .sliders.filter(d => d.part === part)
    .map(d => d.key)

/** Whether a machine's signal is reaching the bus now, as a wire look. Left
    without a channel it asks whether any machine is. */
export function useFlow(channel?: string): 'on' | 'plain' {
  const mask = channel ? 1 << CHANNELS.find(c => c.name === channel)!.tap : 0
  return useStoreSelect(engine.sounding, lit => (mask ? lit & mask : lit) !== 0)
    ? 'on'
    : 'plain'
}

/** Opens `box` when the stage's editor appears, so the editor's rows show. */
export function useBoxWhileEditing(
  pick: BoxPick,
  editing: boolean,
  box: string,
) {
  const [was, setWas] = useState(editing)
  if (editing === was) return
  setWas(editing)
  if (editing && pick.selected !== box) pick.toggle(box)
}

// Whether a row has anything to act on yet: a fault waits for a wire to be cut,
// and a row you have already moved stays whatever the switch beside it says.
export const rowShown = (key: ControlKey, c: Controls) => {
  const needs = sliderFor(key).needs
  return !needs || needs(c) || c[key] !== DEFAULT_CONTROLS[key]
}

// The knobs a drawing reads, off the board as one string so the drawing redraws
// only for a write that moved one of them.
export function useReadings<K extends ControlKey>(keys: readonly K[]) {
  const joined = useBoardValue(c => keys.map(k => c[k]).join('|'))
  const values = joined.split('|').map(Number)
  const value = (key: K) => values[keys.indexOf(key)]!
  return {
    value,
    touched: (...ks: K[]) => ks.some(k => value(k) !== DEFAULT_CONTROLS[k]),
  }
}

// The knobs of a strip that no lane carries: the input and the fader are in the
// lane, so every other control of the channel sits in one of the boxes.
const STRIP_SUFFIXES = [
  'Trim',
  'Low',
  'MidHz',
  'Mid',
  'High',
  'Send',
  'Pan',
  'Rec',
  'Erase',
  'Cue',
  'Len',
] as const

export const STRIP_KEYS = TRACK_NUMBERS.flatMap(t =>
  STRIP_SUFFIXES.map(n => `four${t}${n}` as const),
)

export const GLYPH_GAP = 4

/** The width of a box holding a glyph `glyphW` wide beside its name. */
export const glyphBoxWidth = (name: string, glyphW: number) =>
  boxWidth(name) + glyphW + GLYPH_GAP

/** Left edges of a row of boxes `widths` wide, from `start`, with `gaps`
    between them: one gap for all, or one per space. */
export const lefts = (
  widths: readonly number[],
  gaps: number | readonly number[],
  start = 0,
) =>
  widths.map((_, i) =>
    widths
      .slice(0, i)
      .reduce(
        (x, w, j) => x + w + (typeof gaps === 'number' ? gaps : gaps[j]!),
        start,
      ),
  )

/** A row of boxes `widths` wide spread so it spans `span` from `start`, with
    rounded left edges and the gap it took. */
export function spread(widths: readonly number[], span: number, start = 0) {
  const gap = (span - widths.reduce((a, b) => a + b, 0)) / (widths.length - 1)
  return { gap, xs: lefts(widths, gap, start).map(Math.round) }
}

/** The wire from each box's right edge to the next box's left edge, at `y`. */
export const chainPaths = (
  boxes: readonly { x: number; w: number }[],
  y: number,
) =>
  boxes.slice(1).map((to, i) => `M${boxes[i]!.x + boxes[i]!.w} ${y} H${to.x}`)

/** Builds a box named by its id that opens `keys` and lights when one of them
    is off stock. */
export const boxMaker =
  <K extends ControlKey>(touched: (...keys: K[]) => boolean) =>
  (
    id: string,
    x: number,
    y: number,
    w: number,
    keys: readonly K[],
    help: string,
  ): BoxSpec => ({
    id,
    keys,
    x,
    y,
    w,
    name: id,
    touched: touched(...keys),
    help,
  })

/** The rows each box of a drawing opens. */
export type Opens = Readonly<Record<string, readonly ControlKey[]>>

export const opensOf = (
  boxes: readonly { id?: string; keys?: readonly ControlKey[] }[],
): Opens =>
  Object.fromEntries(
    boxes.flatMap(b => (b.id && b.keys ? [[b.id, b.keys] as const] : [])),
  )

/** For each box that opens only a row or two, the boxes it is wired to. Its
    card shows their rows under its own, so no card is a dead end. */
export type Wiring = Readonly<Record<string, readonly string[]>>

export interface Beside {
  names: readonly string[]
  keys: readonly ControlKey[]
}

/** The rows a thin box's card borrows from the boxes `wiring` ties it to. */
export function besideOf(
  opens: Opens,
  wiring: Wiring,
  id: string | null | undefined,
): Beside | undefined {
  const names = id ? wiring[id] : undefined
  if (!names) return undefined
  const own = opens[id!] ?? []
  const keys = [...new Set(names.flatMap(n => opens[n] ?? []))].filter(
    k => !own.includes(k),
  )
  return { names, keys }
}
