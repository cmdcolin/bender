import {
  useCallback,
  useMemo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { engine } from '../engine/engine.ts'
import {
  dropped,
  endOf,
  inEnd,
  jackKey,
  KINDS,
  lastInto,
  outEnd,
  pressed,
  touches,
  type Cable,
  type End,
} from './benchCables.ts'
import { dragging, placeJack, type Drag } from './benchStores.ts'
import { follow, pressIsClick } from './cableDrag.ts'
import { Socket, Wire } from './CableParts.tsx'
import {
  hanging,
  laid,
  type Anchor,
  type Point,
  type Route,
} from './cablePaths.ts'
import { useBoardValue, useStoreSelect } from './ControlsContext.ts'

import type { Controls } from '../controls.ts'
import type { Store } from '../listeners.ts'

/** Writes the board a change makes, as one step to walk back. */
export function rewire(change: (c: Controls) => Controls) {
  const was = engine.controls.get()
  const next = change(was)
  if (next === was) return
  engine.armStep()
  engine.writeBoard(next)
}

/** Picks up a cable: the last one in an input, the one pressed along its
    length, or a fresh one out of an output or an empty input while the line
    has one to spare. */
function grab(start: End, e: ReactPointerEvent, cable?: Cable) {
  const board = engine.controls.get()
  const carried =
    cable ?? (start.side === 'in' ? lastInto(board, start) : null) ?? null
  if (!carried && KINDS[start.line].full?.(board)) return
  const fixed = carried ? outEnd(carried) : start
  follow(
    e,
    at => dragging.set(at && { fixed, carried, ...at }),
    over => rewire(c => dropped(c, fixed, carried, endOf(over?.dataset.jack))),
  )
}

/** One jack. An input is a button that a press plugs or pulls; an output is a
    socket to drag cables out of. */
export function Jack({
  end,
  className,
  label,
  lamp,
  notes,
  children,
}: {
  end: End
  className: string | undefined
  label?: string
  lamp?: string
  notes?: Store<ReadonlySet<number>>
  children?: ReactNode
}) {
  const kind = KINDS[end.line]
  const key = jackKey(end)
  const facing = kind.facing(end.side, end.id)
  const target = useStoreSelect(
    dragging,
    d => d !== null && d.fixed.line === end.line && d.fixed.side !== end.side,
  )
  const lit = useBoardValue(c => touches(c, end))
  const place = useCallback(
    (el: HTMLElement | null) => placeJack(key, el && { el, facing, notes }),
    [key, facing, notes],
  )
  const socket = (
    <Socket
      colour={kind.colour}
      lamp={lamp ?? (lit ? 'wired' : end.side === 'in' ? 'off' : undefined)}
      target={target}
    />
  )
  if (end.side === 'out')
    return (
      <span
        ref={place}
        className={className}
        data-jack={key}
        onPointerDown={e => grab(end, e)}
      >
        {socket}
        {children}
      </span>
    )
  return (
    <button
      ref={place}
      className={className}
      aria-pressed={lit}
      aria-label={label}
      data-jack={key}
      onPointerDown={e => grab(end, e)}
      onClick={() => {
        if (pressIsClick()) rewire(c => pressed(c, end))
      }}
    >
      {socket}
      {children}
    </button>
  )
}

export const hasAny = (s: ReadonlySet<number>) => s.size > 0

/** A cable laid down the gutter, glowing while the machine it feeds sounds
    the notes it carries. */
export function BenchCable({
  cable,
  spot,
  notes,
}: {
  cable: Cable
  spot: Route
  notes?: Store<ReadonlySet<number>>
}) {
  const kind = KINDS[cable.line]
  const says = useBoardValue(c => kind.says(c, cable))
  const toySounding = useStoreSelect(engine.chipNotes, hasAny)
  const heard = useStoreSelect(notes ?? engine.chipNotes, hasAny)
  const path = useMemo(() => laid(spot.bends), [spot])
  return (
    <Wire
      path={path}
      from={spot.from}
      to={spot.to}
      colour={kind.colour}
      sounding={notes !== undefined && heard && toySounding}
      pull={{
        title: `${says}. Pull the plug, or drag the end to another ${kind.jack} jack`,
        run: () => rewire(c => kind.pull(c, cable)),
      }}
      onGrab={e => grab(inEnd(cable), e, cable)}
    />
  )
}

/** The cable in the hand, from the end still plugged in to the pointer. */
export function Held({
  drag,
  points,
}: {
  drag: Drag
  points: ReadonlyMap<string, Point>
}) {
  const { fixed } = drag
  const kind = KINDS[fixed.line]
  const at = points.get(jackKey(fixed))
  if (!at) return null
  const stays: Anchor = { at, facing: kind.facing(fixed.side, fixed.id) }
  const loose: Anchor = {
    at: drag,
    facing: fixed.side === 'out' ? 'right' : kind.facing('out', ''),
  }
  const from = fixed.side === 'out' ? stays : loose
  const to = fixed.side === 'out' ? loose : stays
  return (
    <Wire path={hanging(from, to)} from={from} to={to} colour={kind.colour} />
  )
}
