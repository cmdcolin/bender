import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'

import { ANY_CHOICE } from '../dsp/trigbus.ts'
import { engine } from '../engine/engine.ts'
import { createStore, type Store } from '../listeners.ts'
import {
  cableKey,
  cablesOn,
  gateInto,
  inEnd,
  jackKey,
  outEnd,
  parseCables,
  voicePlate,
  voiceIn,
  voiceName,
  writeCables,
  type End,
} from './benchCables.ts'
import { BenchCable, Held, Jack } from './BenchJack.tsx'
import { dragging, jacks } from './benchStores.ts'
import {
  gutterFor,
  layRuns,
  type Anchor,
  type Point,
  type Route,
} from './cablePaths.ts'
import {
  useBoardValue,
  useStoreSelect,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './GateCables.module.css'
import { ADSR, MODULES, sourcesInUse } from './modCables.ts'
import { CvJack, ModOut } from './ModJacks.tsx'
import { Tip } from './Tip.tsx'

import type { NoteDest } from '../engine/messages.ts'

// The patch cords on the bench, in lanes down a gutter beside the keyboards.
// benchCables.ts says what each line carries and how its jacks plug:
//
// - GATE (amber) carries Plinky's notes from its GATE jack to another
//   keyboard's GATE jack, or to the one on the kit's plate.
// - TRIG (purple) carries a kit voice from the plate on top of Clatter to a
//   keyboard's TRIG jack, or to the ADSR's gate on the MOD plate.
// - MOD (blue) carries a patch bay source from the MOD plate to a machine's CV
//   jack, one of the bay's four wires.

type Keyboard = 'fm' | 'pcm' | 'mono'

const TRIG_VOICES = Array.from({ length: ANY_CHOICE }, (_, i) => i + 1)

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
  const on = useBoardValue(c => gateInto(taker).plugged(c))
  const toySounding = useStoreValue(engine.chipNotes).size > 0
  const sounding = useStoreValue(notes).size > 0
  const end: End = { line: 'gate', side: 'in', id: taker }
  return (
    <Tip
      text={`${on ? solderedTip : cutTip}. The ring lights while Plinky’s notes are reaching it.`}
    >
      <Jack
        end={end}
        notes={notes}
        className={styles.jack}
        label={on ? 'with Plinky' : 'own keys only'}
        lamp={!on ? 'off' : toySounding && sounding ? 'sounding' : 'wired'}
      >
        <span className={styles.legend}>gate</span>
      </Jack>
    </Tip>
  )
}

/** A keyboard's TRIG input, under its GATE jack. Pressing it patches in every
    hit on the kit, or pulls the cable. */
export function TrigJack({ taker }: { taker: NoteDest }) {
  const voice = useBoardValue(c => voiceIn(taker, c))
  return (
    <Tip
      text={
        voice > 0
          ? `The kit’s ${voiceName(voice)} line strikes this keyboard. Press to pull the cable, or drag it to another TRIG jack`
          : 'The kit’s trigger input. Press to patch in every hit, or drag a cable here from a jack on top of the kit'
      }
    >
      <Jack
        end={{ line: 'trig', side: 'in', id: taker }}
        className={styles.trig}
        label="kit trigger"
      >
        <span className={voice > 0 ? styles.voice : styles.legend}>
          {voice > 0 ? voicePlate(voice) : 'trig'}
        </span>
      </Jack>
    </Tip>
  )
}

/** Plinky's GATE output, on its right edge where every other keyboard has its
    GATE input. Cables stack on it, one for each machine its notes reach. */
export function GateOut() {
  return (
    <Tip text="Plinky’s notes out. Drag a cable from here to a GATE jack on another machine, and that machine plays every note Plinky strikes">
      <Jack
        end={{ line: 'gate', side: 'out', id: 'plinky' }}
        className={styles.out}
      >
        <span className={styles.legend}>gate</span>
      </Jack>
    </Tip>
  )
}

function TrigOut({ voice }: { voice: number }) {
  const name = voiceName(voice)
  return (
    <Tip
      text={`The ${name} trigger line. Drag a cable from here to a TRIG jack and every ${voice === ANY_CHOICE ? 'hit' : name} strikes it`}
    >
      <Jack
        end={{ line: 'trig', side: 'out', id: String(voice) }}
        className={styles.trigOut}
      >
        <span className={styles.plateName}>{voicePlate(voice)}</span>
      </Jack>
    </Tip>
  )
}

/** The GATE input on the kit's plate, where Plinky's notes strike the kit. */
function KitGate() {
  const on = useBoardValue(c => gateInto('kit').plugged(c))
  return (
    <Tip
      text={
        on
          ? 'Plinky’s notes strike the kit. Kit voice Plinky plays, in the trigger patch, picks the voice. Press to pull the cable'
          : 'The kit’s GATE input. Press to let every note Plinky plays strike the kit, or drag a cable here from Plinky'
      }
    >
      <Jack
        end={{ line: 'gate', side: 'in', id: 'kit' }}
        className={styles.kitGate}
        label="Plinky into the kit"
      >
        <span className={styles.plateName}>gate</span>
      </Jack>
    </Tip>
  )
}

const hasTrigIn = (m: ReadonlyMap<string, unknown>) =>
  [...m.keys()].some(k => k.startsWith('trig:in:'))

/** The jack plate on top of the kit: its CV and GATE inputs, then a trigger
    output per voice and one that fires on any hit. It shows while something
    on the bench has a TRIG input. */
export function TrigPlate() {
  const shows = useStoreSelect(jacks, hasTrigIn)
  if (!shows) return null
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
  return (
    <Tip
      text={
        voice > 0
          ? `The kit’s ${voiceName(voice)} line opens the ADSR. Press to pull the cable, and a held key opens it instead`
          : 'The ADSR’s gate. With no cable in, a key held on any keyboard opens it. Press to patch in every hit, or drag a cable here from a jack on top of the kit'
      }
    >
      <Jack
        end={{ line: 'trig', side: 'in', id: 'adsr' }}
        className={styles.plateIn}
        label="ADSR gate"
      >
        <span className={voice > 0 ? styles.plateVoice : styles.plateName}>
          {voice > 0 ? voicePlate(voice) : 'keys'}
        </span>
      </Jack>
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

interface Layout {
  routes: ReadonlyMap<string, Route>
  points: ReadonlyMap<string, Point>
}

const spots = createStore<Layout>({ routes: new Map(), points: new Map() })

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

const same = (a: Layout, b: Layout) =>
  JSON.stringify([[...a.routes], [...a.points]]) ===
  JSON.stringify([[...b.routes], [...b.points]])

/** The bench the machines sit on, with the cables laid down its gutter. The
    cables measure their own jacks, so they follow a case that grows or goes. */
export function GateBench({ children }: { children: ReactNode }) {
  const bench = useRef<HTMLDivElement>(null)
  const at = useStoreValue(jacks)
  const { routes, points } = useStoreValue(spots)
  const drag = useStoreValue(dragging)
  const shown = useBoardValue(c => writeCables(cablesOn(c)))
  const cables = useMemo(
    () =>
      parseCables(shown).filter(
        x => at.has(jackKey(outEnd(x))) && at.has(jackKey(inEnd(x))),
      ),
    [shown, at],
  )
  const gutter = at.size > 0 ? gutterFor(cables.length) : 0

  useLayoutEffect(() => {
    const root = bench.current
    if (!root) return undefined
    let frame = 0
    const measure = () => {
      const origin = root.getBoundingClientRect()
      const where = new Map(
        [...at].map(([key, j]) => [key, centre(socketOf(j.el), origin)]),
      )
      const anchor = (end: End): Anchor => ({
        at: where.get(jackKey(end))!,
        facing: at.get(jackKey(end))!.facing,
      })
      const runs = cables.map(x => {
        const from = anchor(outEnd(x))
        const to = anchor(inEnd(x))
        return {
          id: cableKey(x),
          from,
          to,
          inner: from.facing === 'right' && to.facing === 'right',
        }
      })
      const edges = [...at].flatMap(([key, j]) =>
        j.facing === 'right' ? [where.get(key)!.x] : [],
      )
      const edge = edges.length > 0 ? Math.max(...edges) : origin.width
      const next = { routes: layRuns(runs, edge), points: where }
      if (!same(spots.get(), next)) spots.set(next)
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const watch = new ResizeObserver(later)
    watch.observe(root)
    for (const { el } of at.values()) watch.observe(caseOf(el))
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
      window.removeEventListener('resize', later)
    }
  }, [at, cables])

  const held = drag?.carried ? cableKey(drag.carried) : null
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
        {cables.map(x => {
          const spot = routes.get(cableKey(x))
          return spot && cableKey(x) !== held ? (
            <BenchCable
              key={cableKey(x)}
              cable={x}
              spot={spot}
              notes={at.get(jackKey(inEnd(x)))?.notes}
            />
          ) : null
        })}
      </svg>
      {drag && (
        <svg className={styles.held} aria-hidden="true">
          <Held drag={drag} points={points} />
        </svg>
      )}
    </div>
  )
}
