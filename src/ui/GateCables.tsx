import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { N_DRUM_VOICES, VOICE_LABELS } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import { createStore, type Store } from '../listeners.ts'
import {
  connectionInto,
  MACHINE_OF,
  SIGNAL_COLOUR,
  type Signal,
} from './connections.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreSelect,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './GateCables.module.css'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'

// The patch cords on the bench. Two kinds run down a gutter beside the stack of
// keyboards, each in a lane of its own, so none passes behind a case:
//
// - GATE: the jumper off Plinky's gate line. Plinky has an output jack per
//   keyboard on its right edge, and each keyboard that can take the gate has an
//   input jack on its right edge.
// - TRIG: the kit's trigger lines. A plate on top of Clatter has a jack per
//   voice and one for any hit, and every keyboard has a TRIG input under its
//   gate jack. The jack a cable leaves from picks the voice that strikes.
//
// Pressing an input jack plugs it in or pulls it out, and pressing a cable
// pulls it out. Dragging a jack carries a cable's end with the pointer: letting
// go over a jack at the other end of that kind of cable plugs it in, and
// letting go anywhere else pulls it out.

type Taker = Exclude<NoteDest, 'toy'>

const TAKERS: Taker[] = ['fm', 'pcm', 'mono']

const GATE_COLOUR = SIGNAL_COLOUR.notes
const TRIG_COLOUR = SIGNAL_COLOUR.hits

const TRIG_TAKERS: NoteDest[] = ['toy', 'fm', 'pcm', 'mono']

const controlInto = (taker: NoteDest, signal: Signal) =>
  connectionInto(MACHINE_OF[taker], signal)!.key

const trigControl = (taker: NoteDest) => controlInto(taker, 'hits')

const ANY_HIT = N_DRUM_VOICES + 1

const TRIG_VOICES = Array.from({ length: ANY_HIT }, (_, i) => i + 1)

const voiceName = (voice: number) =>
  voice === ANY_HIT ? 'any hit' : VOICE_LABELS[voice - 1]!

const PLATE_NAME: Record<string, string> = {
  'open hat': 'ohat',
  cymbal: 'cym',
  'any hit': 'any',
}

const PLUG = 18
const SLACK = 18
const LANE_IN = 8
const LANE_PITCH = 7
const CORNER = 10
const ARROW_LIFT = 14
const BAND_IN = 6
const BAND_PITCH = 6

interface Socket {
  el: HTMLElement
  control: ControlKey
  notes: Store<ReadonlySet<number>>
}

const inputs = createStore<ReadonlyMap<Taker, Socket>>(new Map())
const outputs = createStore<ReadonlyMap<Taker, HTMLElement>>(new Map())
const trigIns = createStore<ReadonlyMap<NoteDest, HTMLElement>>(new Map())
const trigOuts = createStore<ReadonlyMap<number, HTMLElement>>(new Map())

interface Point {
  x: number
  y: number
}

type Facing = 'right' | 'up'

/** Where a plug sits, and which way its boot points out of the jack. */
interface Anchor {
  at: Point
  facing: Facing
}

interface Route {
  from: Anchor
  to: Anchor
  /** The corners the cable turns, plug boot to plug boot. */
  bends: Point[]
  tag?: Point
}

interface Layout {
  routes: ReadonlyMap<string, Route>
  jacks: ReadonlyMap<string, Point>
}

const spots = createStore<Layout>({ routes: new Map(), jacks: new Map() })

function keep<K, V>(
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

type End = 'out' | 'in'

/** One end of a TRIG cable: a keyboard's input, or a voice's jack on the kit. */
type TrigEnd =
  | { taker: NoteDest; voice?: undefined }
  | { voice: number; taker?: undefined }

type Drag = Point &
  (
    | { line: 'gate'; taker: Taker; end: End }
    | { line: 'trig'; fixed: TrigEnd; carried: NoteDest | null }
  )

const dragging = createStore<Drag | null>(null)

// A drag that ends on the jack it started from still ends in a click.
let swallow = false

const DRAG_FROM = 5

/** Carries a cable end with the pointer once it has moved far enough, and
    hands the drop to `drop`. A press that never moved stays a click. */
function follow(
  e: ReactPointerEvent,
  hold: (at: Point) => void,
  drop: (over: HTMLElement | null) => void,
) {
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
    hold({ x: m.clientX - origin.left, y: m.clientY - origin.top })
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', escape)
  }
  const cancel = () => {
    stop()
    dragging.set(null)
  }
  const escape = (k: KeyboardEvent) => {
    if (k.key === 'Escape') cancel()
  }
  const up = (m: PointerEvent) => {
    stop()
    if (!moved) return
    swallow = true
    setTimeout(() => {
      swallow = false
    }, 0)
    dragging.set(null)
    drop(
      document
        .elementFromPoint(m.clientX, m.clientY)
        ?.closest<HTMLElement>('[data-gate-jack]') ?? null,
    )
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', escape)
}

function grab(taker: Taker, end: End, e: ReactPointerEvent) {
  follow(
    e,
    at => dragging.set({ line: 'gate', taker, end, ...at }),
    over => {
      const socket = inputs.get().get(taker)
      if (!socket) return
      if (over?.dataset.gateTaker === taker && over.dataset.gateEnd === end)
        return
      const landed =
        over?.dataset.gateTaker === taker && over.dataset.gateEnd !== end
      const plugged = engine.controls.get()[socket.control] < 0.5
      if (landed !== plugged) setGate(socket.control, !landed)
    },
  )
}

const struckBy = (taker: NoteDest) =>
  Math.round(engine.controls.get()[trigControl(taker)])

const trigEndOf = (el: HTMLElement | null): TrigEnd | null => {
  const taker = TRIG_TAKERS.find(t => t === el?.dataset.trigTaker)
  if (taker) return { taker }
  if (el?.dataset.trigVoice) return { voice: Number(el.dataset.trigVoice) }
  return null
}

/** Picks up a TRIG cable: the one plugged into a keyboard's input, or a fresh
    one out of a voice's jack or an empty input. */
function grabTrig(start: TrigEnd, e: ReactPointerEvent) {
  const carried =
    start.taker !== undefined && struckBy(start.taker) > 0 ? start.taker : null
  const fixed: TrigEnd = carried ? { voice: struckBy(carried) } : start
  follow(
    e,
    at => dragging.set({ line: 'trig', fixed, carried, ...at }),
    over => {
      const end = trigEndOf(over)
      const landed =
        end && (end.taker === undefined) !== (fixed.taker === undefined)
          ? end
          : null
      engine.armStep()
      if (carried) engine.set(trigControl(carried), 0)
      const taker = fixed.taker ?? landed?.taker
      const voice = fixed.voice ?? landed?.voice
      if (taker && voice) engine.set(trigControl(taker), voice)
    },
  )
}

const setGate = (control: ControlKey, cut: boolean) => {
  engine.armStep()
  engine.set(control, cut ? 1 : 0)
}

const setTrig = (taker: NoteDest, voice: number) => {
  engine.armStep()
  engine.set(trigControl(taker), voice)
}

/** The input jack on a keyboard's right edge. Pressing it plugs the cable in or
    pulls it out. */
export function GateJumper({
  taker,
  notes,
  cutTip,
  solderedTip,
}: {
  taker: Taker
  /** What this machine is sounding, which includes the toy's notes with the jumper on. */
  notes: Store<ReadonlySet<number>>
  cutTip: string
  solderedTip: string
}) {
  const control = controlInto(taker, 'notes')
  const cut = useControlValue(control) > 0.5
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const sounding = useStoreValue(notes).size > 0
  const lamp = cut ? 'off' : toySounding && sounding ? 'sounding' : 'wired'
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'gate' && d.taker === taker && d.end === 'out',
  )
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
        <Socket colour={GATE_COLOUR} lamp={lamp} target={target} />
      </button>
    </Tip>
  )
}

/** A keyboard's TRIG input, under its gate jack, or at the top of Plinky's
    edge. Pressing it patches in every hit on the kit, or pulls the cable. */
export function TrigJack({ taker }: { taker: NoteDest }) {
  const voice = Math.round(useControlValue(trigControl(taker)))
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'trig' && d.fixed.voice !== undefined,
  )
  const place = useCallback(
    (el: HTMLElement | null) => keep(trigIns, taker, el),
    [taker],
  )
  return (
    <Tip
      text={
        voice > 0
          ? `The kit’s ${voiceName(voice)} line strikes this keyboard. Press to pull the cable, or drag it to another jack on the kit`
          : 'The kit’s trigger input. Press to patch in every hit, or drag a cable here from a jack on top of the kit'
      }
    >
      <button
        ref={place}
        className={taker === 'toy' ? styles.trigTop : styles.trig}
        aria-pressed={voice > 0}
        aria-label="kit trigger"
        data-gate-jack=""
        data-trig-taker={taker}
        onPointerDown={e => grabTrig({ taker }, e)}
        onClick={() => {
          if (!swallow) setTrig(taker, voice > 0 ? 0 : ANY_HIT)
        }}
      >
        <Socket
          colour={TRIG_COLOUR}
          lamp={voice > 0 ? 'wired' : 'off'}
          target={target}
        />
      </button>
    </Tip>
  )
}

function Socket({
  colour,
  lamp,
  target,
}: {
  colour: string
  lamp?: string
  target: boolean
}) {
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
      <circle className={styles.ring} r="9.6" style={{ stroke: colour }} />
      <circle className={styles.nut} r="8.4" />
      <circle className={styles.collar} r="6.4" />
      <circle className={styles.hole} r="3.6" />
      <path className={styles.glint} d="M-5 -2.6 A5.6 5.6 0 0 1 -1.6 -5.2" />
    </svg>
  )
}

function OutputSocket({ taker }: { taker: Taker }) {
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'gate' && d.taker === taker && d.end === 'in',
  )
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
      <Socket colour={GATE_COLOUR} target={target} />
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

function TrigOut({ voice }: { voice: number }) {
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'trig' && d.fixed.taker !== undefined,
  )
  const lit = useBoardValue(c =>
    TRIG_TAKERS.some(t => Math.round(c[trigControl(t)]) === voice),
  )
  const place = useCallback(
    (el: HTMLElement | null) => keep(trigOuts, voice, el),
    [voice],
  )
  const name = voiceName(voice)
  return (
    <Tip
      text={`The ${name} trigger line. Drag a cable from here to a keyboard’s TRIG jack and every ${voice === ANY_HIT ? 'hit' : name} strikes it`}
    >
      <span
        ref={place}
        className={styles.trigOut}
        data-gate-jack=""
        data-trig-voice={voice}
        onPointerDown={e => grabTrig({ voice }, e)}
      >
        <Socket
          colour={TRIG_COLOUR}
          lamp={lit ? 'wired' : undefined}
          target={target}
        />
        <span className={styles.plateName}>{PLATE_NAME[name] ?? name}</span>
      </span>
    </Tip>
  )
}

/** The jack plate on top of the kit: a trigger output per voice, and one that
    fires on any hit. It shows while a keyboard with a TRIG jack is out. */
export function TrigPlate() {
  const takers = useStoreValue(trigIns)
  if (takers.size === 0) return null
  return (
    <div className={styles.plate} data-trig-plate="">
      {TRIG_VOICES.map(v => (
        <TrigOut key={v} voice={v} />
      ))}
    </div>
  )
}

const centre = (el: Element, origin: DOMRect): Point => {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.left + r.width / 2 - origin.left),
    y: Math.round(r.top + r.height / 2 - origin.top),
  }
}

const socketOf = (el: HTMLElement) => el.querySelector('svg') ?? el

const caseOf = (el: HTMLElement) =>
  el.closest<HTMLElement>('[role=group]') ?? el

const boot = ({ at, facing }: Anchor): Point =>
  facing === 'right' ? { x: at.x + PLUG, y: at.y } : { x: at.x, y: at.y - PLUG }

/** Every cable's lane in the gutter past the widest keyboard. GATE cables take
    the inner lanes, the nearest keyboard's innermost; TRIG cables take the
    outer lanes, the keyboard nearest the kit's innermost, and each crosses to
    the gutter at a height of its own over the kit. */
function route(
  origin: DOMRect,
  ends: {
    ins: ReadonlyMap<Taker, Socket>
    outs: ReadonlyMap<Taker, HTMLElement>
    tIns: ReadonlyMap<NoteDest, HTMLElement>
    tOuts: ReadonlyMap<number, HTMLElement>
  },
  plugged: ReadonlyMap<NoteDest, number>,
): Layout {
  const { ins, outs, tIns, tOuts } = ends
  const jacks = new Map<string, Point>()
  for (const [t, s] of ins) jacks.set(`gate:in:${t}`, centre(s.el, origin))
  for (const [t, el] of outs) jacks.set(`gate:out:${t}`, centre(el, origin))
  for (const [t, el] of tIns) jacks.set(`trig:in:${t}`, centre(el, origin))
  for (const [v, el] of tOuts)
    jacks.set(`trig:out:${v}`, centre(socketOf(el), origin))

  const gates = TAKERS.flatMap(taker => {
    const socket = ins.get(taker)
    const from = jacks.get(`gate:out:${taker}`)
    const to = jacks.get(`gate:in:${taker}`)
    if (!socket || !from || !to) return []
    const top = caseOf(socket.el).getBoundingClientRect().top - origin.top
    return [{ taker, from, to, top: Math.round(top) }]
  }).toSorted((a, b) => a.to.y - b.to.y)

  const trigs = TRIG_TAKERS.flatMap(taker => {
    const from = jacks.get(`trig:out:${plugged.get(taker)}`)
    const to = jacks.get(`trig:in:${taker}`)
    return from && to ? [{ taker, from, to }] : []
  })
  const plate = Math.min(...trigs.map(t => t.from.y))
  const nearest = trigs.toSorted(
    (a, b) => Math.abs(a.to.y - plate) - Math.abs(b.to.y - plate),
  )

  const edge = Math.max(
    ...gates.flatMap(g => [g.from.x, g.to.x]),
    ...trigs.map(t => t.to.x),
  )
  const lane = (i: number) => edge + PLUG + LANE_IN + i * LANE_PITCH

  const routes = new Map<string, Route>()
  gates.forEach(({ taker, from, to, top }, i) => {
    const a = boot({ at: from, facing: 'right' })
    const b = boot({ at: to, facing: 'right' })
    routes.set(`gate:${taker}`, {
      from: { at: from, facing: 'right' },
      to: { at: to, facing: 'right' },
      bends: [a, { x: lane(i), y: a.y }, { x: lane(i), y: b.y }, b],
      tag: { x: lane(i) - 34, y: top - 18 },
    })
  })
  nearest.forEach(({ taker, from, to }, i) => {
    const x = lane(gates.length + i)
    const band = plate - PLUG - BAND_IN - (nearest.length - 1 - i) * BAND_PITCH
    const a = boot({ at: from, facing: 'up' })
    const b = boot({ at: to, facing: 'right' })
    routes.set(`trig:${taker}`, {
      from: { at: from, facing: 'up' },
      to: { at: to, facing: 'right' },
      bends: [a, { x: a.x, y: band }, { x, y: band }, { x, y: b.y }, b],
    })
  })
  return { routes, jacks }
}

const same = (a: Layout, b: Layout) =>
  JSON.stringify([[...a.routes], [...a.jacks]]) ===
  JSON.stringify([[...b.routes], [...b.jacks]])

/** The bench the machines sit on, with the cables laid down its gutter. The
    cables measure their own jacks, so they follow a case that grows or goes. */
export function GateBench({ children }: { children: ReactNode }) {
  const bench = useRef<HTMLDivElement>(null)
  const ins = useStoreValue(inputs)
  const outs = useStoreValue(outputs)
  const tIns = useStoreValue(trigIns)
  const tOuts = useStoreValue(trigOuts)
  const { routes, jacks } = useStoreValue(spots)
  const drag = useStoreValue(dragging)
  const struck = useBoardValue(c =>
    TRIG_TAKERS.map(t => Math.round(c[trigControl(t)])).join(','),
  )
  const plugged = useMemo(() => {
    const voices = struck.split(',').map(Number)
    return new Map(TRIG_TAKERS.map((t, i) => [t, voices[i]!]))
  }, [struck])

  const lanes =
    TAKERS.filter(t => ins.has(t) && outs.has(t)).length +
    TRIG_TAKERS.filter(t => tIns.has(t) && tOuts.has(plugged.get(t)!)).length
  const gutter =
    ins.size + tIns.size > 0
      ? PLUG + LANE_IN + Math.max(1, lanes) * LANE_PITCH + 6
      : 0

  useLayoutEffect(() => {
    const root = bench.current
    if (!root) return undefined
    let frame = 0
    const measure = () => {
      const next = route(
        root.getBoundingClientRect(),
        { ins, outs, tIns, tOuts },
        plugged,
      )
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
    for (const el of [...tIns.values(), ...tOuts.values()])
      watch.observe(caseOf(el))
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
      window.removeEventListener('resize', later)
    }
  }, [ins, outs, tIns, tOuts, plugged])

  return (
    <div
      ref={bench}
      className={styles.bench}
      style={{ ['--gutter' as string]: `${gutter}px` }}
      data-gate-bench=""
      data-dragging={drag !== null}
    >
      {children}
      <svg className={styles.cables} aria-hidden="true">
        {TAKERS.map(t => {
          const spot = routes.get(`gate:${t}`)
          const socket = ins.get(t)
          return spot &&
            socket &&
            !(drag?.line === 'gate' && drag.taker === t) ? (
            <Cable key={t} taker={t} socket={socket} spot={spot} />
          ) : null
        })}
        {TRIG_TAKERS.map(t => {
          const spot = routes.get(`trig:${t}`)
          return spot &&
            plugged.get(t)! > 0 &&
            !(drag?.line === 'trig' && drag.carried === t) ? (
            <TrigCable key={t} taker={t} spot={spot} />
          ) : null
        })}
      </svg>
      {drag && (
        <svg className={styles.held} aria-hidden="true">
          <Held drag={drag} routes={routes} jacks={jacks} />
        </svg>
      )}
    </div>
  )
}

/** The cable in the hand, from the end still plugged in to the pointer. */
function Held({
  drag,
  routes,
  jacks,
}: {
  drag: Drag
  routes: ReadonlyMap<string, Route>
  jacks: ReadonlyMap<string, Point>
}) {
  if (drag.line === 'gate') {
    const held = routes.get(`gate:${drag.taker}`)
    if (!held) return null
    const loose: Anchor = { at: drag, facing: 'right' }
    const from = drag.end === 'out' ? loose : held.from
    const to = drag.end === 'in' ? loose : held.to
    return (
      <Wire path={hanging(from, to)} from={from} to={to} colour={GATE_COLOUR} />
    )
  }
  const { fixed } = drag
  const at =
    fixed.voice !== undefined
      ? jacks.get(`trig:out:${fixed.voice}`)
      : jacks.get(`trig:in:${fixed.taker}`)
  if (!at) return null
  const stays: Anchor = { at, facing: fixed.voice ? 'up' : 'right' }
  const loose: Anchor = { at: drag, facing: fixed.voice ? 'right' : 'up' }
  const from = fixed.voice ? stays : loose
  const to = fixed.voice ? loose : stays
  return (
    <Wire path={hanging(from, to)} from={from} to={to} colour={TRIG_COLOUR} />
  )
}

/** A plug pushed into the jack at `at`, its boot pointing out of it. */
function Plug({ at, facing, colour }: Anchor & { colour: string }) {
  return (
    <g
      transform={`translate(${at.x} ${at.y}) rotate(${facing === 'right' ? -90 : 180})`}
    >
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
}

/** Straight runs through `bends` with rounded corners, and an arrowhead on the
    last upright run, just short of the turn into the input jack. */
function laid(bends: Point[]): Path {
  const radius = (i: number) => {
    const p = bends[i - 1]!
    const q = bends[i]!
    const r = bends[i + 1]!
    const into = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
    const out = Math.abs(r.x - q.x) + Math.abs(r.y - q.y)
    return Math.min(CORNER, into / 2, out / 2)
  }
  const toward = (from: Point, to: Point, by: number) => {
    const len = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) || 1
    return {
      x: from.x + ((to.x - from.x) * by) / len,
      y: from.y + ((to.y - from.y) * by) / len,
    }
  }
  let d = `M${bends[0]!.x} ${bends[0]!.y}`
  for (let i = 1; i < bends.length - 1; i++) {
    const r = radius(i)
    const q = bends[i]!
    const enter = toward(q, bends[i - 1]!, r)
    const leave = toward(q, bends[i + 1]!, r)
    d += ` L${enter.x} ${enter.y} Q${q.x} ${q.y} ${leave.x} ${leave.y}`
  }
  const last = bends.at(-1)!
  d += ` L${last.x} ${last.y}`

  const corner = bends.length - 2
  const top = bends[corner - 1]!
  const turn = bends[corner]!
  const run = Math.abs(turn.y - top.y)
  const dir = turn.y >= top.y ? 1 : -1
  return {
    d,
    arrow: {
      x: turn.x,
      y: turn.y - dir * Math.min(radius(corner) + ARROW_LIFT, run / 2),
      angle: dir * 90,
    },
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

/** A cable with one end in the hand, sagging out the way both plugs face. */
function hanging(from: Anchor, to: Anchor): Path {
  const a = boot(from)
  const b = boot(to)
  const reach = SLACK + Math.min(Math.hypot(a.x - b.x, a.y - b.y), 220) * 0.14
  const out = (anchor: Anchor, p: Point) =>
    anchor.facing === 'right'
      ? { x: p.x + reach, y: p.y }
      : { x: p.x, y: p.y - reach }
  const c1 = out(from, a)
  const c2 = out(to, b)
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

/** One cable between two plugs, with an arrowhead pointing the way the signal
    runs. A cable with a `pull` also takes a press anywhere along it. */
function Wire({
  path,
  from,
  to,
  colour,
  sounding = false,
  pull,
  onGrab,
  tag,
}: {
  path: Path
  from: Anchor
  to: Anchor
  colour: string
  sounding?: boolean
  pull?: { title: string; run: () => void }
  onGrab?: (e: ReactPointerEvent) => void
  tag?: Point
}) {
  const press = pull && {
    onPointerDown: onGrab,
    onClick: () => {
      if (!swallow) pull.run()
    },
  }
  return (
    <g
      className={sounding ? styles.cableOn : styles.cable}
      style={{ ['--cable' as string]: colour }}
    >
      <path className={styles.sheath} d={path.d} />
      <path className={styles.core} d={path.d} />
      <path className={styles.sheen} d={path.d} />
      {pull && (
        <path className={styles.grab} d={path.d} {...press}>
          <title>{pull.title}</title>
        </path>
      )}
      <polygon
        className={styles.arrow}
        points="-6,-5 6,0 -6,5"
        transform={`translate(${path.arrow.x} ${path.arrow.y}) rotate(${path.arrow.angle})`}
      />
      <Plug {...from} colour={colour} />
      <Plug {...to} colour={colour} />
      {pull && tag && (
        <g
          className={styles.tag}
          transform={`translate(${tag.x} ${tag.y}) rotate(-4)`}
          {...press}
        >
          <title>{pull.title}</title>
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
  const path = useMemo(() => laid(spot.bends), [spot])
  if (cut) return null
  return (
    <Wire
      path={path}
      from={spot.from}
      to={spot.to}
      colour={GATE_COLOUR}
      sounding={sounding}
      pull={{
        title:
          'Pull the plug, or drag the end off: Plinky’s gate stops reaching this keyboard',
        run: () => setGate(socket.control, true),
      }}
      onGrab={e => grab(taker, 'in', e)}
      tag={spot.tag}
    />
  )
}

function TrigCable({ taker, spot }: { taker: NoteDest; spot: Route }) {
  const path = useMemo(() => laid(spot.bends), [spot])
  return (
    <Wire
      path={path}
      from={spot.from}
      to={spot.to}
      colour={TRIG_COLOUR}
      pull={{
        title:
          'Pull the plug, or drag the end to another jack: the kit stops striking this keyboard',
        run: () => setTrig(taker, 0),
      }}
      onGrab={e => grabTrig({ taker }, e)}
    />
  )
}
