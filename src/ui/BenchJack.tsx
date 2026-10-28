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
import {
  carry,
  dragging,
  hasAny,
  placeJack,
  putDown,
  rewire,
  type Drag,
} from './benchStores.ts'
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

import type { Store } from '../listeners.ts'

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
    at => dragging.set(at && { fixed, carried, at }),
    over => rewire(c => dropped(c, fixed, carried, endOf(over?.dataset.jack))),
  )
}

const takes = (d: Drag | null, end: End) =>
  d !== null && d.fixed.line === end.line && d.fixed.side !== end.side

/** Plugs the cable a press on an output picked up into this input, or else
    plugs or pulls the input's own. */
function press(end: End) {
  const d = dragging.get()
  if (d?.at === null && takes(d, end)) {
    putDown()
    rewire(c => dropped(c, d.fixed, null, end))
  } else rewire(c => pressed(c, end))
}

/** One jack, a button either way. A press on an input plugs or pulls its
    cable; a press on an output picks up a cable for the next input pressed.
    A `full` output gives out no more cables. */
export function Jack({
  end,
  className,
  label,
  lamp,
  notes,
  full = false,
  children,
}: {
  end: End
  className: string | undefined
  label: string
  lamp?: string
  notes?: Store<ReadonlySet<number>>
  full?: boolean
  children?: ReactNode
}) {
  const kind = KINDS[end.line]
  const key = jackKey(end)
  const facing = kind.facing(end.side, end.id)
  const target = useStoreSelect(dragging, d => takes(d, end))
  const held = useStoreSelect(
    dragging,
    d => d?.at === null && jackKey(d.fixed) === key,
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
      target={target || held}
    />
  )
  const out = end.side === 'out'
  return (
    <button
      ref={place}
      className={className}
      aria-pressed={out ? held : lit}
      aria-label={label}
      aria-disabled={full || undefined}
      data-jack={key}
      data-full={full || undefined}
      onPointerDown={e => {
        if (!full) grab(end, e)
      }}
      onClick={() => {
        if (!pressIsClick() || full) return
        if (out) carry(end)
        else press(end)
      }}
    >
      {socket}
      {children}
    </button>
  )
}

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
  fixed,
  pointer,
  points,
}: {
  fixed: End
  pointer: Point
  points: ReadonlyMap<string, Point>
}) {
  const kind = KINDS[fixed.line]
  const at = points.get(jackKey(fixed))
  if (!at) return null
  const stays: Anchor = { at, facing: kind.facing(fixed.side, fixed.id) }
  const loose: Anchor = {
    at: pointer,
    facing: fixed.side === 'out' ? 'right' : kind.facing('out', ''),
  }
  const from = fixed.side === 'out' ? stays : loose
  const to = fixed.side === 'out' ? loose : stays
  return (
    <Wire path={hanging(from, to)} from={from} to={to} colour={kind.colour} />
  )
}
