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
  cvIns,
  dragging,
  gateOut,
  inputs,
  keep,
  modOuts,
  trigIns,
  trigOuts,
  type Drag,
  type GateEnd,
  type GateIn,
  type Taker,
  type TrigEnd,
  type TrigTaker,
} from './benchStores.ts'
import { follow, pressIsClick } from './cableDrag.ts'
import { Socket, Wire } from './CableParts.tsx'
import {
  gutterFor,
  hanging,
  laid,
  layRuns,
  type Anchor,
  type Point,
  type Route,
  type Run,
} from './cablePaths.ts'
import {
  connectionInto,
  MACHINE_OF,
  PLINKY_TO_KIT,
  SIGNAL_COLOUR,
  type Connection,
  type Machine,
} from './connections.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreSelect,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './GateCables.module.css'
import {
  ADSR,
  CV_MACHINES,
  cvFacing,
  modCables,
  MODULES,
  sourcesInUse,
} from './modCables.ts'
import { CvJack, HeldMod, ModCable, ModOut } from './ModJacks.tsx'
import { Tip } from './Tip.tsx'

import type { Controls } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'

// The patch cords on the bench, in lanes down a gutter beside the keyboards:
//
// - GATE (amber) carries Plinky's notes from a jack on its right edge to each
//   keyboard's GATE jack, and to the GATE jack on the kit's plate.
// - TRIG (purple) carries a kit voice from the plate on top of Clatter to a
//   keyboard's TRIG jack. The jack a cable leaves from picks the voice.
// - MOD (blue) carries a patch bay source from the MOD plate to a machine's CV
//   jack, one of the bay's four wires (ModJacks.tsx).
//
// Pressing a jack plugs its cable in or pulls it out. Dragging an end carries
// it with the pointer: letting go over a jack that takes that kind of cable
// plugs it in there, and letting go anywhere else pulls it out.

type Keyboard = Exclude<Taker, 'kit'>

const TAKERS: Taker[] = ['fm', 'pcm', 'mono', 'kit']

const GATE_COLOUR = SIGNAL_COLOUR.notes
const TRIG_COLOUR = SIGNAL_COLOUR.hits

const TRIG_TAKERS: TrigTaker[] = ['toy', 'fm', 'pcm', 'mono', 'adsr']

const gateInto = (taker: Taker): Connection =>
  taker === 'kit' ? PLINKY_TO_KIT : connectionInto(MACHINE_OF[taker], 'notes')!

const trigControl = (taker: TrigTaker) =>
  taker === 'adsr'
    ? 'modEnvGate'
    : connectionInto(MACHINE_OF[taker], 'hits')!.key

const trigFacing = (taker: TrigTaker) => (taker === 'adsr' ? 'up' : 'right')

const ANY_HIT = N_DRUM_VOICES + 1

const TRIG_VOICES = Array.from({ length: ANY_HIT }, (_, i) => i + 1)

const voiceName = (voice: number) =>
  voice === ANY_HIT ? 'any hit' : VOICE_LABELS[voice - 1]!

const PLATE_NAME: Record<string, string> = {
  'open hat': 'ohat',
  cymbal: 'cym',
  'any hit': 'any',
}

const plateName = (voice: number) => {
  const name = voiceName(voice)
  return PLATE_NAME[name] ?? name
}

interface Layout {
  routes: ReadonlyMap<string, Route>
  jacks: ReadonlyMap<string, Point>
}

const spots = createStore<Layout>({ routes: new Map(), jacks: new Map() })

const plugged = (taker: Taker) => gateInto(taker).plugged(engine.controls.get())

const setGate = (taker: Taker, on: boolean) => {
  const x = gateInto(taker)
  engine.armStep()
  engine.set(x.key, on ? x.plugIn : x.pullOut)
}

const gateEndOf = (el: HTMLElement | null): GateEnd | null =>
  el?.dataset.gateOut !== undefined
    ? 'plinky'
    : (TAKERS.find(t => t === el?.dataset.gateTaker) ?? null)

/** Picks up a GATE cable: the one plugged into a machine's input, or a fresh
    one out of Plinky's output or an empty input. */
function grab(start: GateEnd, e: ReactPointerEvent) {
  const carried = start !== 'plinky' && plugged(start) ? start : null
  const fixed: GateEnd = carried ? 'plinky' : start
  follow(
    e,
    at => dragging.set(at && { line: 'gate', fixed, carried, ...at }),
    over => {
      const end = gateEndOf(over)
      const landed =
        end && (end === 'plinky') !== (fixed === 'plinky') ? end : null
      const taker = fixed === 'plinky' ? landed : fixed
      if (carried && carried !== taker) setGate(carried, false)
      if (landed && taker && taker !== 'plinky') setGate(taker, true)
    },
  )
}

/** The kit voice in a TRIG input, from its control. The ADSR's gate counts
    keys as 0, any hit as 1 and the voices after. */
const voiceIn = (taker: TrigTaker, c: Controls) => {
  const v = Math.round(c[trigControl(taker)])
  if (taker !== 'adsr' || v === 0) return v
  return v === 1 ? ANY_HIT : v - 1
}

const valueFor = (taker: TrigTaker, voice: number) => {
  if (taker !== 'adsr' || voice === 0) return voice
  return voice === ANY_HIT ? 1 : voice + 1
}

const struckBy = (taker: TrigTaker) => voiceIn(taker, engine.controls.get())

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
      if (taker && voice) engine.set(trigControl(taker), valueFor(taker, voice))
    },
  )
}

const setTrig = (taker: TrigTaker, voice: number) => {
  engine.armStep()
  engine.set(trigControl(taker), valueFor(taker, voice))
}

const useGatePlugged = (taker: Taker) =>
  useBoardValue(c => gateInto(taker).plugged(c))

/** Whether a GATE input lights as somewhere to drop the cable in the hand. */
const useGateTarget = (taker: Taker, on: boolean) =>
  useStoreSelect(
    dragging,
    d =>
      d?.line === 'gate' &&
      d.fixed === 'plinky' &&
      (!on || d.carried === taker),
  )

function useGateIn(taker: Taker, notes?: Store<ReadonlySet<number>>) {
  return useCallback(
    (el: HTMLElement | null) => keep(inputs, taker, el && { el, notes }),
    [taker, notes],
  )
}

/** The GATE jack on a keyboard's right edge. */
export function GateJumper({
  taker,
  notes,
  cutTip,
  solderedTip,
}: {
  taker: Keyboard
  /** What this machine is sounding, which includes Plinky's notes while the cable is in. */
  notes: Store<ReadonlySet<number>>
  cutTip: string
  solderedTip: string
}) {
  const on = useGatePlugged(taker)
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const sounding = useStoreValue(notes).size > 0
  const lamp = !on ? 'off' : toySounding && sounding ? 'sounding' : 'wired'
  const target = useGateTarget(taker, on)
  const place = useGateIn(taker, notes)
  return (
    <Tip
      text={`${on ? solderedTip : cutTip}. The ring lights while Plinky’s notes are reaching it.`}
    >
      <button
        ref={place}
        className={styles.jack}
        aria-pressed={on}
        aria-label={on ? 'with Plinky' : 'own keys only'}
        data-gate-jack=""
        data-gate-taker={taker}
        data-gate-end="in"
        onPointerDown={e => grab(taker, e)}
        onClick={() => {
          if (pressIsClick()) setGate(taker, !on)
        }}
      >
        <Socket colour={GATE_COLOUR} lamp={lamp} target={target} />
        <span className={styles.legend}>gate</span>
      </button>
    </Tip>
  )
}

/** A keyboard's TRIG input, under its GATE jack. Pressing it patches in every
    hit on the kit, or pulls the cable. */
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
        className={styles.trig}
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
        <span className={voice > 0 ? styles.voice : styles.legend}>
          {voice > 0 ? plateName(voice) : 'trig'}
        </span>
      </button>
    </Tip>
  )
}

/** Plinky's GATE output, on its right edge where every other keyboard has its
    GATE input. Cables stack on it, one for each machine its notes reach. */
export function GateOut() {
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'gate' && d.fixed !== 'plinky',
  )
  const lit = useBoardValue(c => TAKERS.some(t => gateInto(t).plugged(c)))
  const place = useCallback((el: HTMLElement | null) => gateOut.set(el), [])
  return (
    <Tip text="Plinky’s notes out. Drag a cable from here to a GATE jack on another machine, and that machine plays every note Plinky strikes">
      <span
        ref={place}
        className={styles.out}
        data-gate-jack=""
        data-gate-out=""
        onPointerDown={e => grab('plinky', e)}
      >
        <Socket
          colour={GATE_COLOUR}
          lamp={lit ? 'wired' : undefined}
          target={target}
        />
        <span className={styles.legend}>gate</span>
      </span>
    </Tip>
  )
}

function TrigOut({ voice }: { voice: number }) {
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'trig' && d.fixed.taker !== undefined,
  )
  const lit = useBoardValue(c => TRIG_TAKERS.some(t => voiceIn(t, c) === voice))
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
        <span className={styles.plateName}>{plateName(voice)}</span>
      </span>
    </Tip>
  )
}

/** The GATE input on the kit's plate, where Plinky's notes strike the kit. */
function KitGate() {
  const on = useGatePlugged('kit')
  const target = useGateTarget('kit', on)
  const place = useGateIn('kit')
  return (
    <Tip
      text={
        on
          ? 'Plinky’s notes strike the kit. Kit voice Plinky plays, in the trigger patch, picks the voice. Press to pull the cable'
          : 'The kit’s GATE input. Press to let every note Plinky plays strike the kit, or drag a cable here from Plinky'
      }
    >
      <button
        ref={place}
        className={styles.kitGate}
        aria-pressed={on}
        aria-label="Plinky into the kit"
        data-gate-jack=""
        data-gate-taker="kit"
        data-gate-end="in"
        onPointerDown={e => grab('kit', e)}
        onClick={() => {
          if (pressIsClick()) setGate('kit', !on)
        }}
      >
        <Socket
          colour={GATE_COLOUR}
          lamp={on ? 'wired' : 'off'}
          target={target}
        />
        <span className={styles.plateName}>gate</span>
      </button>
    </Tip>
  )
}

/** The jack plate on top of the kit: Plinky's GATE input, then a trigger
    output per voice and one that fires on any hit. It shows while a keyboard
    with a TRIG jack is out. */
export function TrigPlate() {
  const takers = useStoreValue(trigIns)
  if (takers.size === 0) return null
  return (
    <div className={styles.plate} data-trig-plate="">
      <CvJack machine="Clatter" />
      <KitGate />
      {TRIG_VOICES.map(v => (
        <TrigOut key={v} voice={v} />
      ))}
    </div>
  )
}

/** The ADSR's gate input, beside its output on the MOD plate. With no cable
    in, it opens on a key held on any keyboard. */
function AdsrGate() {
  const voice = useBoardValue(c => voiceIn('adsr', c))
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'trig' && d.fixed.voice !== undefined,
  )
  const place = useCallback(
    (el: HTMLElement | null) => keep(trigIns, 'adsr', el),
    [],
  )
  return (
    <Tip
      text={
        voice > 0
          ? `The kit’s ${voiceName(voice)} line opens the ADSR. Press to pull the cable, and a held key opens it instead`
          : 'The ADSR’s gate. With no cable in, a key held on any keyboard opens it. Press to patch in every hit, or drag a cable here from a jack on top of the kit'
      }
    >
      <span className={styles.adsrGate}>
        <button
          ref={place}
          className={styles.plateJack}
          aria-pressed={voice > 0}
          aria-label="ADSR gate"
          data-gate-jack=""
          data-trig-taker="adsr"
          onPointerDown={e => grabTrig({ taker: 'adsr' }, e)}
          onClick={() => {
            if (pressIsClick()) setTrig('adsr', voice > 0 ? 0 : ANY_HIT)
          }}
        >
          <Socket
            colour={TRIG_COLOUR}
            lamp={voice > 0 ? 'wired' : 'off'}
            target={target}
          />
        </button>
        <span className={voice > 0 ? styles.plateVoice : styles.plateName}>
          {voice > 0 ? plateName(voice) : 'keys'}
        </span>
      </span>
    </Tip>
  )
}

/** The patch bay's sources as a jack plate over the keyboards: the bay's own
    modules, the ADSR's gate, and any other source a wire picks up. */
export function ModPlate() {
  const used = useBoardValue(c => [...sourcesInUse(c)].join(','))
  const sources = useMemo(() => {
    const extra = used
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter(s => !MODULES.includes(s))
    return [...MODULES, ...extra.toSorted((a, b) => a - b)]
  }, [used])
  return (
    <div className={styles.modPlate} data-mod-plate="">
      <span className={styles.modName}>mod</span>
      {sources.map(src =>
        src === ADSR ? (
          <span key={src} className={styles.adsrPair}>
            <ModOut src={src} />
            <AdsrGate />
          </span>
        ) : (
          <ModOut key={src} src={src} />
        ),
      )}
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

const run = (
  id: string,
  from: Anchor | undefined,
  to: Anchor | undefined,
  inner = false,
): Run[] => (from && to ? [{ id, from, to, inner }] : [])

interface Ends {
  ins: ReadonlyMap<Taker, GateIn>
  out: HTMLElement | null
  tIns: ReadonlyMap<TrigTaker, HTMLElement>
  tOuts: ReadonlyMap<number, HTMLElement>
  mOuts: ReadonlyMap<number, HTMLElement>
  cvs: ReadonlyMap<Machine, HTMLElement>
}

interface Patched {
  struck: ReadonlyMap<TrigTaker, number>
  mods: readonly { wire: number; src: number; machine: Machine }[]
}

/** Every cable on the bench, measured off its jacks. A GATE cable to a
    keyboard keeps its lane whether or not it is plugged in, so plugging one
    does not shift the cases. */
function route(origin: DOMRect, ends: Ends, patched: Patched): Layout {
  const { ins, out, tIns, tOuts, mOuts, cvs } = ends
  const jacks = new Map<string, Point>()
  const at = (key: string, el: HTMLElement) =>
    jacks.set(key, centre(socketOf(el), origin))
  for (const [t, s] of ins) at(`gate:in:${t}`, s.el)
  if (out) at('gate:out', out)
  for (const [t, el] of tIns) at(`trig:in:${t}`, el)
  for (const [v, el] of tOuts) at(`trig:out:${v}`, el)
  for (const [src, el] of mOuts) at(`mod:out:${src}`, el)
  for (const [m, el] of cvs) at(`cv:in:${m}`, el)

  const edge = (key: string): Anchor | undefined => {
    const p = jacks.get(key)
    return p && { at: p, facing: 'right' }
  }
  const plate = (key: string): Anchor | undefined => {
    const p = jacks.get(key)
    return p && { at: p, facing: 'up' }
  }

  const runs = [
    ...TAKERS.flatMap(t =>
      t === 'kit'
        ? run('gate:kit', edge('gate:out'), plate('gate:in:kit'))
        : run(`gate:${t}`, edge('gate:out'), edge(`gate:in:${t}`), true),
    ),
    ...TRIG_TAKERS.flatMap(t =>
      run(
        `trig:${t}`,
        plate(`trig:out:${patched.struck.get(t)}`),
        trigFacing(t) === 'up' ? plate(`trig:in:${t}`) : edge(`trig:in:${t}`),
      ),
    ),
    ...patched.mods.flatMap(m =>
      run(
        `mod:${m.wire}`,
        plate(`mod:out:${m.src}`),
        cvFacing(m.machine) === 'up'
          ? plate(`cv:in:${m.machine}`)
          : edge(`cv:in:${m.machine}`),
      ),
    ),
  ]
  const x = Math.max(
    ...runs.flatMap(r =>
      [r.from, r.to].flatMap(a => (a.facing === 'right' ? [a.at.x] : [])),
    ),
  )
  return { routes: layRuns(runs, x), jacks }
}

const same = (a: Layout, b: Layout) =>
  JSON.stringify([[...a.routes], [...a.jacks]]) ===
  JSON.stringify([[...b.routes], [...b.jacks]])

/** The bench the machines sit on, with the cables laid down its gutter. The
    cables measure their own jacks, so they follow a case that grows or goes. */
export function GateBench({ children }: { children: ReactNode }) {
  const bench = useRef<HTMLDivElement>(null)
  const ins = useStoreValue(inputs)
  const out = useStoreValue(gateOut)
  const tIns = useStoreValue(trigIns)
  const tOuts = useStoreValue(trigOuts)
  const mOuts = useStoreValue(modOuts)
  const cvs = useStoreValue(cvIns)
  const { routes, jacks } = useStoreValue(spots)
  const drag = useStoreValue(dragging)
  const voices = useBoardValue(c =>
    TRIG_TAKERS.map(t =>
      t === 'adsr' && !sourcesInUse(c).has(ADSR) ? 0 : voiceIn(t, c),
    ).join(','),
  )
  const wired = useBoardValue(c =>
    modCables(c)
      .map(m => `${m.wire}:${m.src}:${m.machine}`)
      .join(','),
  )
  const patched = useMemo((): Patched => {
    const each = voices.split(',').map(Number)
    return {
      struck: new Map(TRIG_TAKERS.map((t, i) => [t, each[i]!])),
      mods: wired
        .split(',')
        .filter(Boolean)
        .flatMap(w => {
          const [wire, src, machine] = w.split(':')
          const m = CV_MACHINES.find(n => n === machine)
          return m ? [{ wire: Number(wire), src: Number(src), machine: m }] : []
        }),
    }
  }, [voices, wired])

  const lanes =
    (out ? TAKERS.filter(t => ins.has(t)).length : 0) +
    TRIG_TAKERS.filter(t => tIns.has(t) && tOuts.has(patched.struck.get(t)!))
      .length +
    patched.mods.filter(m => mOuts.has(m.src) && cvs.has(m.machine)).length
  const gutter = ins.size + tIns.size + cvs.size > 0 ? gutterFor(lanes) : 0

  useLayoutEffect(() => {
    const root = bench.current
    if (!root) return undefined
    let frame = 0
    const measure = () => {
      const next = route(
        root.getBoundingClientRect(),
        { ins, out, tIns, tOuts, mOuts, cvs },
        patched,
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
    for (const el of [
      ...tIns.values(),
      ...tOuts.values(),
      ...mOuts.values(),
      ...cvs.values(),
    ])
      watch.observe(caseOf(el))
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
      window.removeEventListener('resize', later)
    }
  }, [ins, out, tIns, tOuts, mOuts, cvs, patched])

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
          const gateIn = ins.get(t)
          return spot &&
            gateIn &&
            !(drag?.line === 'gate' && drag.carried === t) ? (
            <Cable key={t} taker={t} notes={gateIn.notes} spot={spot} />
          ) : null
        })}
        {TRIG_TAKERS.map(t => {
          const spot = routes.get(`trig:${t}`)
          return spot &&
            patched.struck.get(t)! > 0 &&
            !(drag?.line === 'trig' && drag.carried === t) ? (
            <TrigCable key={t} taker={t} spot={spot} />
          ) : null
        })}
        {patched.mods.map(m => {
          const spot = routes.get(`mod:${m.wire}`)
          return spot && !(drag?.line === 'mod' && drag.carried === m.wire) ? (
            <ModCable key={m.wire} wire={m.wire} spot={spot} />
          ) : null
        })}
      </svg>
      {drag && (
        <svg className={styles.held} aria-hidden="true">
          <Held drag={drag} jacks={jacks} />
        </svg>
      )}
    </div>
  )
}

/** The cable in the hand, from the end still plugged in to the pointer. */
function Held({
  drag,
  jacks,
}: {
  drag: Drag
  jacks: ReadonlyMap<string, Point>
}) {
  if (drag.line === 'mod') return <HeldMod drag={drag} jacks={jacks} />
  if (drag.line === 'gate') {
    const at =
      drag.fixed === 'plinky'
        ? jacks.get('gate:out')
        : jacks.get(`gate:in:${drag.fixed}`)
    if (!at) return null
    const stays: Anchor = {
      at,
      facing: drag.fixed === 'kit' ? 'up' : 'right',
    }
    const loose: Anchor = { at: drag, facing: 'right' }
    const from = drag.fixed === 'plinky' ? stays : loose
    const to = drag.fixed === 'plinky' ? loose : stays
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
  const stays: Anchor = {
    at,
    facing: fixed.taker === undefined ? 'up' : trigFacing(fixed.taker),
  }
  const loose: Anchor = { at: drag, facing: fixed.voice ? 'right' : 'up' }
  const from = fixed.voice ? stays : loose
  const to = fixed.voice ? loose : stays
  return (
    <Wire path={hanging(from, to)} from={from} to={to} colour={TRIG_COLOUR} />
  )
}

function Cable({
  taker,
  notes,
  spot,
}: {
  taker: Taker
  notes?: Store<ReadonlySet<number>>
  spot: Route
}) {
  const on = useGatePlugged(taker)
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const heard = useStoreValue(notes ?? engine.chipNotes).size > 0
  const path = useMemo(() => laid(spot.bends), [spot])
  if (!on) return null
  return (
    <Wire
      path={path}
      from={spot.from}
      to={spot.to}
      colour={GATE_COLOUR}
      sounding={notes !== undefined && heard && toySounding}
      pull={{
        title: `Pull the plug, or drag the end to another GATE jack: Plinky’s notes stop reaching ${MACHINE_NAME[taker]}`,
        run: () => setGate(taker, false),
      }}
      onGrab={e => grab(taker, e)}
    />
  )
}

const MACHINE_NAME: Record<Taker, string> = {
  fm: 'Glint',
  pcm: 'Parlor',
  mono: 'Growler',
  kit: 'the kit',
}

function TrigCable({ taker, spot }: { taker: TrigTaker; spot: Route }) {
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
