import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { engine } from '../engine/engine.ts'
import { createStore, type Store } from '../listeners.ts'
import {
  useControlValue,
  useStoreSelect,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './GateCables.module.css'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'

// The jumper off Plinky's gate line, drawn as the patch cord it stands for.
// Each keyboard that can take Plinky's gate has an input jack on the right edge
// of its case, Plinky has an output jack per keyboard on its right edge, and
// while the jumper is soldered a cable runs between the two down a gutter beside
// the stack, tagged GATE. Each cable keeps a lane of its own in the gutter, so
// none passes behind a case. Pressing the input jack, the tag or the cable
// pulls the plug.
// Dragging from either jack of a pair carries the cable's end with the pointer:
// letting go over the other jack of that colour plugs it in, and letting go
// anywhere else pulls it out.

type Taker = Exclude<NoteDest, 'toy'>

const TAKERS: Taker[] = ['fm', 'pcm', 'mono']

const CABLE_COLOUR: Record<Taker, string> = {
  fm: '#e3a72f',
  pcm: '#2fb3cf',
  mono: '#d9503c',
}

const PLUG = 18
const SLACK = 18
const LANE_IN = 8
const LANE_PITCH = 8
const CORNER = 10
const ARROW_LIFT = 14

interface Socket {
  el: HTMLElement
  control: ControlKey
  notes: Store<ReadonlySet<number>>
}

const inputs = createStore<ReadonlyMap<Taker, Socket>>(new Map())
const outputs = createStore<ReadonlyMap<Taker, HTMLElement>>(new Map())

interface Point {
  x: number
  y: number
}

interface Route {
  from: Point
  to: Point
  /** The x of this cable's lane in the gutter. */
  lane: number
  /** The top edge of the keyboard the cable runs to. */
  top: number
}

const spots = createStore<ReadonlyMap<Taker, Route>>(new Map())

function keep<V>(
  store: Store<ReadonlyMap<Taker, V>> & {
    set: (m: ReadonlyMap<Taker, V>) => void
  },
  taker: Taker,
  value: V | null,
) {
  const next = new Map(store.get())
  if (value === null) next.delete(taker)
  else next.set(taker, value)
  store.set(next)
}

type End = 'out' | 'in'

interface Drag {
  taker: Taker
  end: End
  x: number
  y: number
}

const dragging = createStore<Drag | null>(null)

// A drag that ends on the jack it started from still ends in a click.
let swallow = false

const DRAG_FROM = 5

function grab(taker: Taker, end: End, e: ReactPointerEvent) {
  if (e.button !== 0) return
  const x0 = e.clientX
  const y0 = e.clientY
  let moved = false
  const move = (m: PointerEvent) => {
    if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < DRAG_FROM) return
    const origin = document
      .querySelector('[data-gate-bench]')
      ?.getBoundingClientRect()
    if (!origin) return
    moved = true
    dragging.set({
      taker,
      end,
      x: m.clientX - origin.left,
      y: m.clientY - origin.top,
    })
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
  }
  const up = (m: PointerEvent) => {
    stop()
    if (!moved) return
    swallow = true
    setTimeout(() => {
      swallow = false
    }, 0)
    dragging.set(null)
    const socket = inputs.get().get(taker)
    if (!socket) return
    const over = document
      .elementFromPoint(m.clientX, m.clientY)
      ?.closest<HTMLElement>('[data-gate-jack]')
    const landed =
      over?.dataset.gateTaker === taker && over.dataset.gateEnd !== end
    const plugged = engine.controls.get()[socket.control] < 0.5
    if (landed !== plugged) setGate(socket.control, !landed)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
}

const setGate = (control: ControlKey, cut: boolean) => {
  engine.armStep()
  engine.set(control, cut ? 1 : 0)
}

/** The input jack on a keyboard's right edge. Pressing it plugs the cable in or
    pulls it out. */
export function GateJumper({
  taker,
  control,
  notes,
  cutTip,
  solderedTip,
}: {
  taker: Taker
  control: ControlKey
  /** What this machine is sounding, which includes the toy's notes with the jumper on. */
  notes: Store<ReadonlySet<number>>
  cutTip: string
  solderedTip: string
}) {
  const cut = useControlValue(control) > 0.5
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const sounding = useStoreValue(notes).size > 0
  const lamp = cut ? 'off' : toySounding && sounding ? 'sounding' : 'wired'
  const place = useCallback(
    (el: HTMLElement | null) => {
      if (el) keep(inputs, taker, { el, control, notes })
      else keep(inputs, taker, null)
    },
    [taker, control, notes],
  )
  return (
    <Tip
      text={`${cut ? cutTip : solderedTip}. The ring lights while Plinky’s notes are reaching it.`}
    >
      <button
        ref={place}
        className={styles.jack}
        aria-pressed={!cut}
        aria-label={cut ? 'own keys only' : 'with Plinky'}
        data-gate-jack=""
        data-gate-taker={taker}
        data-gate-end="in"
        onPointerDown={e => grab(taker, 'in', e)}
        onClick={() => {
          if (!swallow) setGate(control, !cut)
        }}
      >
        <Socket taker={taker} end="in" lamp={lamp} />
      </button>
    </Tip>
  )
}

function Socket({
  taker,
  end,
  lamp,
}: {
  taker: Taker
  end: End
  lamp?: string
}) {
  const target = useStoreSelect(
    dragging,
    d => d !== null && d.taker === taker && d.end !== end,
  )
  return (
    <svg
      className={styles.socket}
      viewBox="-10 -10 20 20"
      width="20"
      height="20"
      data-lamp={lamp}
      data-target={target}
      aria-hidden="true"
    >
      <circle
        className={styles.ring}
        r="9.6"
        style={{ stroke: CABLE_COLOUR[taker] }}
      />
      <circle className={styles.nut} r="8.4" />
      <circle className={styles.collar} r="6.4" />
      <circle className={styles.hole} r="3.6" />
      <path className={styles.glint} d="M-5 -2.6 A5.6 5.6 0 0 1 -1.6 -5.2" />
    </svg>
  )
}

function OutputSocket({ taker }: { taker: Taker }) {
  const place = useCallback(
    (el: HTMLElement | null) => keep(outputs, taker, el),
    [taker],
  )
  return (
    <span
      ref={place}
      className={styles.out}
      data-gate-jack=""
      data-gate-taker={taker}
      data-gate-end="out"
      onPointerDown={e => grab(taker, 'out', e)}
    >
      <Socket taker={taker} end="out" />
    </span>
  )
}

/** Plinky's right edge: one output jack for each keyboard on the bench, the
    nearest keyboard's lowest, so the cables nest in the gutter. */
export function GateOut() {
  const present = useStoreValue(inputs)
  return (
    <span className={styles.outs}>
      {TAKERS.filter(t => present.has(t))
        .toReversed()
        .map(t => (
          <OutputSocket key={t} taker={t} />
        ))}
    </span>
  )
}

const same = (a: ReadonlyMap<Taker, Route>, b: ReadonlyMap<Taker, Route>) =>
  JSON.stringify([...a]) === JSON.stringify([...b])

const centre = (el: HTMLElement, origin: DOMRect): Point => {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.left + r.width / 2 - origin.left),
    y: Math.round(r.top + r.height / 2 - origin.top),
  }
}

const caseOf = (el: HTMLElement) =>
  el.closest<HTMLElement>('[role=group]') ?? el

/** Every cable's lane in the gutter past the widest case, the nearest
    keyboard's innermost. */
function route(
  ins: ReadonlyMap<Taker, Socket>,
  outs: ReadonlyMap<Taker, HTMLElement>,
  origin: DOMRect,
): Map<Taker, Route> {
  const ends = TAKERS.flatMap(taker => {
    const socket = ins.get(taker)
    const out = outs.get(taker)
    if (!socket || !out) return []
    const top = caseOf(socket.el).getBoundingClientRect().top - origin.top
    return [
      {
        taker,
        from: centre(out, origin),
        to: centre(socket.el, origin),
        top: Math.round(top),
      },
    ]
  }).toSorted((a, b) => a.to.y - b.to.y)
  const edge = Math.max(...ends.flatMap(e => [e.from.x, e.to.x]))
  return new Map(
    ends.map(({ taker, ...e }, i) => [
      taker,
      { ...e, lane: edge + PLUG + LANE_IN + i * LANE_PITCH },
    ]),
  )
}

/** The bench the keyboards sit on, with the cables laid down its gutter. The
    cables measure their own jacks, so they follow a case that grows or goes. */
export function GateBench({ children }: { children: ReactNode }) {
  const bench = useRef<HTMLDivElement>(null)
  const ins = useStoreValue(inputs)
  const outs = useStoreValue(outputs)
  const wired = useStoreValue(spots)
  const drag = useStoreValue(dragging)

  useLayoutEffect(() => {
    const root = bench.current
    if (!root) return undefined
    let frame = 0
    const measure = () => {
      const next = route(ins, outs, root.getBoundingClientRect())
      if (!same(spots.get(), next)) spots.set(next)
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const watch = new ResizeObserver(later)
    watch.observe(root)
    for (const { el } of ins.values()) watch.observe(caseOf(el))
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
      window.removeEventListener('resize', later)
    }
  }, [ins, outs])

  const held = drag ? wired.get(drag.taker) : undefined
  const from = drag?.end === 'out' ? drag : held?.from
  const to = drag?.end === 'in' ? drag : held?.to

  return (
    <div
      ref={bench}
      className={styles.bench}
      data-gate-bench=""
      data-dragging={drag !== null}
    >
      {children}
      <svg className={styles.cables} aria-hidden="true">
        {TAKERS.filter(
          t => ins.has(t) && wired.has(t) && drag?.taker !== t,
        ).map(t => (
          <Cable key={t} taker={t} socket={ins.get(t)!} spot={wired.get(t)!} />
        ))}
        {drag && from && to && (
          <Wire
            path={hanging(from, to)}
            from={from}
            to={to}
            colour={CABLE_COLOUR[drag.taker]}
          />
        )}
      </svg>
    </div>
  )
}

/** A plug pushed into the jack at `at`, its boot pointing out to the right. */
function Plug({ at, colour }: { at: Point; colour: string }) {
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(-90)`}>
      <rect
        className={styles.tip}
        x="-2.4"
        y="0"
        width="4.8"
        height="7.5"
        rx="1.4"
      />
      <rect
        className={styles.barrel}
        x="-4.6"
        y="7.5"
        width="9.2"
        height="5.5"
        rx="1.6"
      />
      <rect
        className={styles.boot}
        x="-3.2"
        y="13"
        width="6.4"
        height={PLUG - 13 + 1}
        rx="1.4"
        style={{ fill: colour }}
      />
    </g>
  )
}

interface Path {
  d: string
  arrow: Point & { angle: number }
  tag?: Point
}

/** Out of one plug, down the cable's gutter lane, and into the other. The tag
    hangs in the gap over the keyboard the cable feeds. */
function laid({ from, to, lane, top }: Route): Path {
  const a = { x: from.x + PLUG, y: from.y }
  const b = { x: to.x + PLUG, y: to.y }
  const dir = b.y >= a.y ? 1 : -1
  const r = Math.max(
    0,
    Math.min(CORNER, lane - Math.max(a.x, b.x), Math.abs(b.y - a.y) / 2),
  )
  return {
    d: `M${a.x} ${a.y} H${lane - r} Q${lane} ${a.y} ${lane} ${a.y + dir * r} V${b.y - dir * r} Q${lane} ${b.y} ${lane - r} ${b.y} H${b.x}`,
    arrow: {
      x: lane,
      y: b.y - dir * Math.min(r + ARROW_LIFT, Math.abs(b.y - a.y) / 2),
      angle: dir * 90,
    },
    tag: { x: lane - 34, y: top - 18 },
  }
}

const bezier = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  (1 - t) ** 3 * p0 +
  3 * (1 - t) ** 2 * t * p1 +
  3 * (1 - t) * t * t * p2 +
  t ** 3 * p3

const slope = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  3 * (1 - t) ** 2 * (p1 - p0) +
  6 * (1 - t) * t * (p2 - p1) +
  3 * t * t * (p3 - p2)

/** A cable with one end in the hand, sagging out to the right of both plugs. */
function hanging(from: Point, to: Point): Path {
  const a = { x: from.x + PLUG, y: from.y }
  const b = { x: to.x + PLUG, y: to.y }
  const reach = SLACK + Math.min(Math.abs(a.y - b.y), 220) * 0.14
  const c1 = { x: a.x + reach, y: a.y }
  const c2 = { x: b.x + reach, y: b.y }
  const heading = Math.atan2(
    slope(0.5, a.y, c1.y, c2.y, b.y),
    slope(0.5, a.x, c1.x, c2.x, b.x),
  )
  return {
    d: `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`,
    arrow: {
      x: bezier(0.5, a.x, c1.x, c2.x, b.x),
      y: bezier(0.5, a.y, c1.y, c2.y, b.y),
      angle: (heading * 180) / Math.PI,
    },
  }
}

/** One cable between two plugs, with an arrowhead pointing the way the gate
    runs. A cable with a `pull` also takes a press anywhere along it, and wears
    the tag. */
function Wire({
  path,
  from,
  to,
  colour,
  sounding = false,
  pull,
  onGrab,
}: {
  path: Path
  from: Point
  to: Point
  colour: string
  sounding?: boolean
  pull?: () => void
  onGrab?: (e: ReactPointerEvent) => void
}) {
  return (
    <g
      className={sounding ? styles.cableOn : styles.cable}
      style={{ ['--cable' as string]: colour }}
    >
      <path className={styles.sheath} d={path.d} />
      <path className={styles.core} d={path.d} />
      <path className={styles.sheen} d={path.d} />
      {pull && (
        <path
          className={styles.grab}
          d={path.d}
          onPointerDown={onGrab}
          onClick={() => {
            if (!swallow) pull()
          }}
        >
          <title>
            Pull the plug, or drag the end off: Plinky’s gate stops reaching
            this keyboard
          </title>
        </path>
      )}
      <polygon
        className={styles.arrow}
        points="-6,-5 6,0 -6,5"
        transform={`translate(${path.arrow.x} ${path.arrow.y}) rotate(${path.arrow.angle})`}
      />
      <Plug at={from} colour={colour} />
      <Plug at={to} colour={colour} />
      {pull && path.tag && (
        <g
          className={styles.tag}
          transform={`translate(${path.tag.x} ${path.tag.y}) rotate(-4)`}
          onPointerDown={onGrab}
          onClick={() => {
            if (!swallow) pull()
          }}
        >
          <title>
            Pull the plug, or drag the end off: Plinky’s gate stops reaching
            this keyboard
          </title>
          <rect x="-21" y="-8" width="45" height="16" rx="3" />
          <circle cx="-16" cy="0" r="1.6" />
          <text x="-2" y="3" textAnchor="middle">
            GATE
          </text>
          <polygon
            className={styles.drop}
            points="-4.5,-3.5 4.5,-3.5 0,4.5"
            transform="translate(15 0)"
          />
        </g>
      )}
    </g>
  )
}

function Cable({
  taker,
  socket,
  spot,
}: {
  taker: Taker
  socket: Socket
  spot: Route
}) {
  const cut = useControlValue(socket.control) > 0.5
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const sounding = useStoreValue(socket.notes).size > 0 && toySounding
  const path = useMemo(() => laid(spot), [spot])
  if (cut) return null
  return (
    <Wire
      path={path}
      from={spot.from}
      to={spot.to}
      colour={CABLE_COLOUR[taker]}
      sounding={sounding}
      pull={() => setGate(socket.control, true)}
      onGrab={e => grab(taker, 'in', e)}
    />
  )
}
