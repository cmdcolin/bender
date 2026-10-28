import {
  useCallback,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { engine } from '../engine/engine.ts'
import {
  cvIns,
  dragging,
  keep,
  modOuts,
  type Drag,
  type ModEnd,
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
import styles from './GateCables.module.css'
import {
  cableSays,
  CV_MACHINES,
  cvFacing,
  MOD_COLOUR,
  LFO,
  modCables,
  MODULES,
  moveCv,
  patchCv,
  plateName,
  pullCv,
  sourceName,
  sourcesInUse,
  spareWire,
} from './modCables.ts'
import { Tip } from './Tip.tsx'

import type { Machine } from './connections.ts'

const lastInto = (machine: Machine) =>
  modCables(engine.controls.get()).findLast(m => m.machine === machine)

const write = (next: ReturnType<typeof engine.controls.get>) => {
  engine.armStep()
  engine.writeBoard(next)
}

const modEndOf = (el: HTMLElement | null): ModEnd | null => {
  if (el?.dataset.modSrc) return { src: Number(el.dataset.modSrc) }
  const machine = CV_MACHINES.find(m => m === el?.dataset.cvMachine)
  return machine ? { machine } : null
}

/** Picks up a MOD cable: one already in a CV jack, or a fresh one out of a
    source's jack or an empty CV jack. */
function grabMod(start: ModEnd, e: ReactPointerEvent, wire?: number) {
  const cable =
    wire === undefined
      ? start.machine && lastInto(start.machine)
      : modCables(engine.controls.get()).find(m => m.wire === wire)
  const carried = cable ? cable.wire : null
  const fixed: ModEnd = cable ? { src: cable.src } : start
  follow(
    e,
    at => dragging.set(at && { line: 'mod', fixed, carried, ...at }),
    over => {
      const end = modEndOf(over)
      const landed =
        end && (end.src === undefined) !== (fixed.src === undefined)
          ? end
          : null
      const c = engine.controls.get()
      if (carried !== null)
        write(
          landed?.machine
            ? moveCv(c, carried, landed.machine)
            : pullCv(c, carried),
        )
      else if (landed) {
        const src = fixed.src ?? landed.src!
        const machine = fixed.machine ?? landed.machine!
        write(patchCv(c, src, machine))
      }
    },
  )
}

function ModOut({ src }: { src: number }) {
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'mod' && d.fixed.machine !== undefined,
  )
  const lit = useBoardValue(c => sourcesInUse(c).has(src))
  const full = useBoardValue(c => spareWire(c) < 0)
  const place = useCallback(
    (el: HTMLElement | null) => keep(modOuts, src, el),
    [src],
  )
  const name = sourceName(src)
  return (
    <Tip
      text={
        full
          ? `The patch bay’s ${name}. All four of the bay’s cables are in use, so pull one before patching another`
          : `The patch bay’s ${name}. Drag a cable from here to a machine’s CV jack and it moves that machine`
      }
    >
      <span
        ref={place}
        className={styles.modOut}
        data-gate-jack=""
        data-mod-src={src}
        onPointerDown={e => grabMod({ src }, e)}
      >
        <Socket
          colour={MOD_COLOUR}
          lamp={lit ? 'wired' : undefined}
          target={target}
        />
        <span className={styles.plateName}>{plateName(src)}</span>
      </span>
    </Tip>
  )
}

/** The patch bay's sources as a jack plate over the keyboards: the bay's own
    modules, and any other source a wire picks up. */
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
      {sources.map(src => (
        <ModOut key={src} src={src} />
      ))}
    </div>
  )
}

/** A machine's CV input. Pressing it pulls the last cable in, or patches the
    bay's LFO in while it is empty. */
export function CvJack({ machine }: { machine: Machine }) {
  const says = useBoardValue(c =>
    modCables(c)
      .filter(m => m.machine === machine)
      .map(cableSays)
      .join('. '),
  )
  const target = useStoreSelect(
    dragging,
    d => d?.line === 'mod' && d.fixed.src !== undefined,
  )
  const place = useCallback(
    (el: HTMLElement | null) => keep(cvIns, machine, el),
    [machine],
  )
  const onPlate = cvFacing(machine) === 'up'
  return (
    <Tip
      text={
        says
          ? `${says}. Press to pull the last cable, or drag it to another CV jack`
          : `${machine}’s CV input. Press to patch the bay’s LFO in, or drag a cable here from the MOD plate`
      }
    >
      <button
        ref={place}
        className={onPlate ? styles.kitCv : styles.cv}
        aria-pressed={says !== ''}
        aria-label={`${machine} CV`}
        data-gate-jack=""
        data-cv-machine={machine}
        onPointerDown={e => grabMod({ machine }, e)}
        onClick={() => {
          if (!pressIsClick()) return
          const c = engine.controls.get()
          const last = lastInto(machine)
          write(last ? pullCv(c, last.wire) : patchCv(c, LFO, machine))
        }}
      >
        <Socket
          colour={MOD_COLOUR}
          lamp={says ? 'wired' : 'off'}
          target={target}
        />
        <span className={onPlate ? styles.plateName : styles.legend}>cv</span>
      </button>
    </Tip>
  )
}

export function ModCable({ wire, spot }: { wire: number; spot: Route }) {
  const says = useBoardValue(c => {
    const cable = modCables(c).find(m => m.wire === wire)
    return cable ? cableSays(cable) : ''
  })
  const machine = useBoardValue(
    c => modCables(c).find(m => m.wire === wire)?.machine,
  )
  const path = useMemo(() => laid(spot.bends), [spot])
  if (!says || !machine) return null
  return (
    <Wire
      path={path}
      from={spot.from}
      to={spot.to}
      colour={MOD_COLOUR}
      pull={{
        title: `${says}. Pull the plug, or drag the end to another CV jack`,
        run: () => write(pullCv(engine.controls.get(), wire)),
      }}
      onGrab={e => grabMod({ machine }, e, wire)}
    />
  )
}

/** A MOD cable in the hand, from the end still plugged in to the pointer. */
export function HeldMod({
  drag,
  jacks,
}: {
  drag: Extract<Drag, { line: 'mod' }>
  jacks: ReadonlyMap<string, Point>
}) {
  const { fixed } = drag
  const at =
    fixed.src !== undefined
      ? jacks.get(`mod:out:${fixed.src}`)
      : jacks.get(`cv:in:${fixed.machine}`)
  if (!at) return null
  const stays: Anchor = {
    at,
    facing: fixed.src !== undefined ? 'up' : cvFacing(fixed.machine),
  }
  const loose: Anchor = {
    at: drag,
    facing: fixed.src !== undefined ? 'right' : 'up',
  }
  const from = fixed.src !== undefined ? stays : loose
  const to = fixed.src !== undefined ? loose : stays
  return (
    <Wire path={hanging(from, to)} from={from} to={to} colour={MOD_COLOUR} />
  )
}
