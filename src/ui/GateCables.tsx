import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

import { engine } from '../engine/engine.ts'
import { createStore, type Store } from '../listeners.ts'
import { useControlValue, useStoreValue } from './ControlsContext.ts'
import styles from './GateCables.module.css'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'

// The jumper off Plinky's gate line, drawn as the patch cord it stands for.
// Each keyboard that can take Plinky's gate has an input jack on the top edge
// of its case, Plinky has an output jack per keyboard on its bottom edge, and
// while the jumper is soldered a cable runs between the two across the bench,
// tagged GATE. Pressing the input jack or the tag pulls the plug.

type Taker = Exclude<NoteDest, 'toy'>

const TAKERS: Taker[] = ['fm', 'pcm', 'mono']

const CABLE_COLOUR: Record<Taker, string> = {
  fm: '#e3a72f',
  pcm: '#2fb3cf',
  mono: '#d9503c',
}

const PLUG = 18
const SLACK = 18

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

const spots = createStore<ReadonlyMap<Taker, { from: Point; to: Point }>>(
  new Map(),
)

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

const setGate = (control: ControlKey, cut: boolean) => {
  engine.armStep()
  engine.set(control, cut ? 1 : 0)
}

/** The input jack on a keyboard's top edge. Pressing it plugs the cable in or
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
        onClick={() => setGate(control, !cut)}
      >
        <Socket lamp={lamp} />
      </button>
    </Tip>
  )
}

function Socket({ lamp }: { lamp?: string }) {
  return (
    <svg
      className={styles.socket}
      viewBox="-10 -10 20 20"
      width="20"
      height="20"
      data-lamp={lamp}
      aria-hidden="true"
    >
      <circle className={styles.nut} r="9" />
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
    <span ref={place} className={styles.out}>
      <Socket />
    </span>
  )
}

/** Plinky's bottom edge: one output jack for each keyboard on the bench. */
export function GateOut() {
  const present = useStoreValue(inputs)
  return (
    <span className={styles.outs}>
      {TAKERS.filter(t => present.has(t)).map(t => (
        <OutputSocket key={t} taker={t} />
      ))}
    </span>
  )
}

const same = (
  a: ReadonlyMap<Taker, { from: Point; to: Point }>,
  b: ReadonlyMap<Taker, { from: Point; to: Point }>,
) =>
  a.size === b.size &&
  [...a].every(([k, v]) => {
    const w = b.get(k)
    return (
      w !== undefined &&
      v.from.x === w.from.x &&
      v.from.y === w.from.y &&
      v.to.x === w.to.x &&
      v.to.y === w.to.y
    )
  })

const centre = (el: HTMLElement, origin: DOMRect): Point => {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.left + r.width / 2 - origin.left),
    y: Math.round(r.top + r.height / 2 - origin.top),
  }
}

/** The bench the keyboards sit on, with the cables laid across it. The cables
    measure their own jacks, so a face that wraps onto another row takes its
    cable with it. */
export function GateBench({ children }: { children: ReactNode }) {
  const bench = useRef<HTMLDivElement>(null)
  const ins = useStoreValue(inputs)
  const outs = useStoreValue(outputs)
  const wired = useStoreValue(spots)

  useLayoutEffect(() => {
    const root = bench.current
    if (!root) return undefined
    let frame = 0
    const measure = () => {
      const origin = root.getBoundingClientRect()
      const next = new Map<Taker, { from: Point; to: Point }>()
      for (const [taker, socket] of ins) {
        const out = outs.get(taker)
        if (out) {
          next.set(taker, {
            from: centre(out, origin),
            to: centre(socket.el, origin),
          })
        }
      }
      if (!same(spots.get(), next)) spots.set(next)
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const watch = new ResizeObserver(later)
    watch.observe(root)
    for (const { el } of ins.values())
      watch.observe(el.closest('[role=group]') ?? el)
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
      window.removeEventListener('resize', later)
    }
  }, [ins, outs])

  return (
    <div ref={bench} className={styles.bench}>
      {children}
      <svg className={styles.cables} aria-hidden="true">
        {TAKERS.filter(t => ins.has(t) && wired.has(t)).map(t => (
          <Cable key={t} taker={t} socket={ins.get(t)!} spot={wired.get(t)!} />
        ))}
      </svg>
    </div>
  )
}

function Plug({ at, up, colour }: { at: Point; up: boolean; colour: string }) {
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${up ? 180 : 0})`}>
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

function Cable({
  taker,
  socket,
  spot,
}: {
  taker: Taker
  socket: Socket
  spot: { from: Point; to: Point }
}) {
  const cut = useControlValue(socket.control) > 0.5
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const sounding = useStoreValue(socket.notes).size > 0 && toySounding
  const colour = CABLE_COLOUR[taker]
  const geometry = useMemo(() => {
    const a = { x: spot.from.x, y: spot.from.y + PLUG }
    const b = { x: spot.to.x, y: spot.to.y - PLUG }
    const reach = SLACK + Math.min(Math.abs(a.x - b.x), 220) * 0.14
    const c1 = { x: a.x, y: a.y + reach }
    const c2 = { x: b.x, y: b.y - reach }
    const t = 0.9
    const u = 1 - t
    const mid = {
      x:
        u ** 3 * a.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t ** 3 * b.x,
      y:
        u ** 3 * a.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t ** 3 * b.y,
    }
    const at = 0.72
    const w = 1 - at
    const point = (p0: number, p1: number, p2: number, p3: number) =>
      w ** 3 * p0 + 3 * w * w * at * p1 + 3 * w * at * at * p2 + at ** 3 * p3
    const slope = (p0: number, p1: number, p2: number, p3: number) =>
      3 * w * w * (p1 - p0) + 6 * w * at * (p2 - p1) + 3 * at * at * (p3 - p2)
    const arrow = {
      x: point(a.x, c1.x, c2.x, b.x),
      y: point(a.y, c1.y, c2.y, b.y),
      angle:
        (Math.atan2(slope(a.y, c1.y, c2.y, b.y), slope(a.x, c1.x, c2.x, b.x)) *
          180) /
        Math.PI,
    }
    const d = `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`
    return { d, mid, arrow }
  }, [spot])
  if (cut) return null
  return (
    <g
      className={sounding ? styles.cableOn : styles.cable}
      style={{ ['--cable' as string]: colour }}
    >
      <path className={styles.sheath} d={geometry.d} />
      <path className={styles.core} d={geometry.d} />
      <path className={styles.sheen} d={geometry.d} />
      <path
        className={styles.grab}
        d={geometry.d}
        onClick={() => setGate(socket.control, true)}
      >
        <title>Pull the plug: Plinky’s gate stops reaching this keyboard</title>
      </path>
      <polygon
        className={styles.arrow}
        points="-4.5,-4 4.5,0 -4.5,4"
        transform={`translate(${geometry.arrow.x} ${geometry.arrow.y}) rotate(${geometry.arrow.angle})`}
      />
      <Plug at={spot.from} up={false} colour={colour} />
      <Plug at={spot.to} up colour={colour} />
      <g
        className={styles.tag}
        transform={`translate(${geometry.mid.x} ${geometry.mid.y}) rotate(-4)`}
        onClick={() => setGate(socket.control, true)}
      >
        <title>Pull the plug: Plinky’s gate stops reaching this keyboard</title>
        <rect x="-20" y="-7" width="40" height="14" rx="3" />
        <circle cx="-15" cy="0" r="1.6" />
        <text x="3" y="3" textAnchor="middle">
          GATE ↓
        </text>
      </g>
    </g>
  )
}
