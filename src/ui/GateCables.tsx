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
import { follow, pressIsClick } from './cableDrag.ts'
import { Socket, Wire } from './CableParts.tsx'
import {
  hanging,
  laid,
  boot,
  PLUG,
  type Anchor,
  type Point,
  type Route,
} from './cablePaths.ts'
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

const LANE_IN = 8
const LANE_PITCH = 7
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

function grab(taker: Taker, end: End, e: ReactPointerEvent) {
  follow(
    e,
    at => dragging.set(at && { line: 'gate', taker, end, ...at }),
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
    at => dragging.set(at && { line: 'trig', fixed, carried, ...at }),
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
          if (pressIsClick()) setGate(control, !cut)
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
          if (pressIsClick()) setTrig(taker, voice > 0 ? 0 : ANY_HIT)
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
