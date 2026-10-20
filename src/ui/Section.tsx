import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { isPedal } from '../pedals.ts'
import { AmpPathDiagram } from './AmpPathDiagram.tsx'
import { bench, setBench } from './bench.ts'
import { groupAnchor } from './chain-map.ts'
import {
  groupKeys,
  SLIDER_BY_KEY,
  type Group,
  type SliderDef,
} from './controls/index.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { foldDrawing, zoomFor } from './drawingFor.tsx'
import { DrumGrid } from './DrumGrid.tsx'
import { FeedbackLoops } from './FeedbackLoops.tsx'
import { firstLook, markLooked } from './firstLook.ts'
import { FmChipDiagram } from './FmChipDiagram.tsx'
import { Fold } from './Fold.tsx'
import { FoldDrawing } from './foldDrawings.tsx'
import {
  DRAWN_ROWS,
  hostedBy,
  isHosted,
  STAGE_DRAWINGS,
  type Verbs,
} from './foldHosting.ts'
import { FourTrack } from './FourTrack.tsx'
import { listView } from './listView.ts'
import { MicCap } from './MicJacks.tsx'
import { MicPatch, MicSwitch } from './MicPatch.tsx'
import { Mixer } from './Mixer.tsx'
import { MonoPathDiagram } from './MonoPathDiagram.tsx'
import { MonoRoll } from './MonoRoll.tsx'
import { OrderRack } from './OrderRack.tsx'
import { PatchBay } from './PatchBay.tsx'
import { PcmKeysDiagram } from './PcmKeysDiagram.tsx'
import { BenchToggle } from './Pedals.tsx'
import { cutsFor } from './presets/index.ts'
import { scrollIntoPanel } from './reveal.ts'
import { useStanding } from './rollBack.ts'
import styles from './Section.module.css'
import { ControlSlider, ReserveReadout } from './Slider.tsx'
import { slidersFirst } from './slidersFirst.ts'
import { formerName } from './stageNames.ts'
import {
  BoxVerbs,
  MoreMenu,
  PartVerbs,
  Rigs,
  StageVerbs,
} from './StageVerbs.tsx'
import { SupplyReading } from './SupplyReading.tsx'
import { TapeLoopDiagram } from './TapeLoopDiagram.tsx'
import { TapePathDiagram } from './TapePathDiagram.tsx'
import { Tip } from './Tip.tsx'
import { TriggerPatch } from './TriggerPatch.tsx'
import { TuneRoll } from './TuneRoll.tsx'

const ROWS_BY_GROUP = new Map<string, SliderDef[]>()

function panelRows(group: Group): SliderDef[] {
  let rows = ROWS_BY_GROUP.get(group.name)
  if (!rows) {
    rows = groupKeys(group)
      .map(key => SLIDER_BY_KEY.get(key))
      .filter(def => def !== undefined)
    ROWS_BY_GROUP.set(group.name, rows)
  }
  return rows
}

function shown(def: SliderDef, c: Controls): boolean {
  return !def.needs || def.needs(c) || c[def.key] !== DEFAULT_CONTROLS[def.key]
}

const useShownKeys = (defs: SliderDef[]): Set<string> =>
  new Set(
    useBoardValue(c =>
      defs
        .filter(d => shown(d, c))
        .map(d => d.key)
        .join(','),
    ).split(','),
  )

interface Part {
  name: string | null
  sliders: SliderDef[]
}

function parts(group: Group): Part[] {
  const out: Part[] = []
  for (const def of group.sliders) {
    if ((group.lead ?? []).includes(def.key)) continue
    if ((group.handled ?? []).includes(def.key)) continue
    const name = def.part ?? null
    const last = out[out.length - 1]
    if (last?.name === name) last.sliders.push(def)
    else out.push({ name, sliders: [def] })
  }
  return out
}

const movedIn = (sliders: SliderDef[], c: Controls) =>
  sliders.filter(d => c[d.key] !== DEFAULT_CONTROLS[d.key]).length

function PartFold({
  name,
  rows,
  group,
  hosted,
  seconds,
  listed,
  startOpen,
}: {
  name: string
  rows: SliderDef[]
  hosted: SliderDef[]
  group: Group
  seconds: number
  listed: boolean
  startOpen: boolean
}) {
  const own = useBoardValue(c => movedIn(rows, c))
  const moved = useBoardValue(c => movedIn([...rows, ...hosted], c))
  const cuts = cutsFor(group.name, name)
  const standing = useStanding(cuts)
  const hostedCuts = hostedBy(group.name, name).flatMap(part =>
    cutsFor(group.name, part),
  )
  const hostedStanding = useStanding(hostedCuts)
  const badge = standing || hostedStanding
  const says = badge || (moved > 0 ? `${moved} moved` : undefined)
  const caution = group.caution?.part === name ? group.caution.text : null
  return (
    <Fold name={name} badge={says} startOpen={startOpen}>
      {caution && <p className={styles.caution}>{caution}</p>}
      <PartVerbs
        cuts={cuts}
        group={group}
        part={name}
        rows={rows}
        moved={own}
        standing={standing}
        seconds={seconds}
      />
      {!listed && (
        <FoldDrawing
          group={group.name}
          part={name}
          verbs={verbsFor(group, seconds)}
        />
      )}
      {(listed || !DRAWN_ROWS.has(`${group.name}|${name}`)) &&
        slidersFirst(rows).map(def => (
          <ControlSlider key={def.key} def={def} />
        ))}
    </Fold>
  )
}

const verbsFor =
  (group: Group, seconds: number): Verbs =>
  part => <BoxVerbs group={group} part={part} seconds={seconds} />

type EditorKind = NonNullable<Group['editor']>['kind']

const PANELS: Partial<Record<EditorKind, ComponentType>> = {
  mixer: Mixer,
  feedback: FeedbackLoops,
  order: OrderRack,
  patch: PatchBay,
  trigger: TriggerPatch,
  supply: SupplyReading,
  mic: MicPatch,
  loops: FourTrack,
}

const BARE_DRAWINGS: Partial<Record<EditorKind, ComponentType>> = {
  tapeLoop: TapeLoopDiagram,
  tapePath: TapePathDiagram,
  ampPath: AmpPathDiagram,
}

const PATH_DRAWINGS = {
  fm: FmChipDiagram,
  pcm: PcmKeysDiagram,
  monoPath: MonoPathDiagram,
} as const

const isPathKind = (kind?: string): kind is keyof typeof PATH_DRAWINGS =>
  kind !== undefined && kind in PATH_DRAWINGS

function Lead({ group }: { group: Group }) {
  const keys = group.lead ?? []
  const rows = group.sliders.filter(def => keys.includes(def.key))
  const visible = useShownKeys(rows)
  return (
    <>
      {rows
        .filter(def => visible.has(def.key))
        .map(def => (
          <ControlSlider key={def.key} def={def} />
        ))}
    </>
  )
}

function Rows({
  group,
  seconds,
  listed,
  editor,
}: {
  group: Group
  seconds: number
  listed: boolean
  editor?: ReactNode
}) {
  const blocks = parts(group)
  const drawn = listed ? undefined : STAGE_DRAWINGS[group.name]
  const visible = useShownKeys(group.sliders)
  const hostedRows = (name: string) =>
    (listed ? [] : blocks)
      .filter(
        b => b.name !== null && hostedBy(group.name, name).includes(b.name),
      )
      .flatMap(b => b.sliders.filter(d => visible.has(d.key)))
  const [startOpen] = useState(
    () =>
      new Set(
        blocks
          .filter(
            b =>
              b.name !== null &&
              (!(group.folded ?? []).includes(b.name) ||
                movedIn(
                  [...b.sliders, ...hostedRows(b.name)],
                  engine.controls.get(),
                ) > 0),
          )
          .map(b => b.name),
      ),
  )
  return (
    <>
      {blocks.map(({ name, sliders }, i) => {
        const rows = sliders.filter(d => visible.has(d.key))
        if (drawn && name === drawn)
          return i !== blocks.findIndex(b => b.name === drawn) ? null : (
            <FoldDrawing
              key={name}
              group={group.name}
              part={name}
              editor={editor}
              verbs={verbsFor(group, seconds)}
            />
          )
        if (drawn && name === null) return null
        if (name === null)
          return slidersFirst(rows).map(def => (
            <ControlSlider key={def.key} def={def} />
          ))
        if (!listed && isHosted(group.name, name)) return null
        if (rows.length === 0) return null
        return (
          <PartFold
            key={name}
            name={name}
            rows={rows}
            hosted={hostedRows(name)}
            group={group}
            seconds={seconds}
            listed={listed}
            startOpen={startOpen.has(name)}
          />
        )
      })}
    </>
  )
}

const EDITORS = {
  roll: { label: 'piano roll', what: 'the piano roll' },
  grid: { label: 'drum pattern', what: 'the drum pattern grid' },
} as const

function EditorToggle({ which }: { which: keyof typeof EDITORS }) {
  const b = useStoreValue(bench)
  const on = b[which]
  const { label, what } = EDITORS[which]
  return (
    <Tip
      text={
        on
          ? `Hide ${what}. The notes in it keep playing.`
          : `Show ${what} under the stage's knobs.`
      }
    >
      <button
        className={on ? styles.editorOn : styles.editor}
        aria-pressed={on}
        onClick={() => setBench({ ...b, [which]: !on })}
      >
        {`show ${label}`}
      </button>
    </Tip>
  )
}

export function OpenGroup({
  group,
  onClose,
  seconds,
  stacked = false,
}: {
  group: Group
  onClose: () => void
  seconds: number
  stacked?: boolean
}) {
  const shownEditors = useStoreValue(bench)
  const listedEverywhere = useStoreValue(listView)
  const [listedHere, setListedHere] = useState(false)
  const listed = listedEverywhere || listedHere
  const kind = group.editor?.kind
  const drawable = useMemo(
    () =>
      group.name in STAGE_DRAWINGS ||
      isPathKind(kind) ||
      (kind !== undefined && kind in BARE_DRAWINGS) ||
      group.sliders.some(d => d.part && foldDrawing(group.name, d.part)),
    [group, kind],
  )
  const el = useRef<HTMLDivElement>(null)
  const fresh = useMemo(
    () => !stacked && firstLook(group.name),
    [stacked, group.name],
  )
  const former = formerName(group.name)
  useEffect(() => {
    if (fresh) markLooked(group.name)
  }, [fresh, group.name])
  useEffect(() => {
    if (stacked) return undefined
    const raf = requestAnimationFrame(() => {
      if (el.current) scrollIntoPanel(el.current)
    })
    return () => cancelAnimationFrame(raf)
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- scrolls again each time a different stage opens
  }, [group.name, stacked])
  const rigsFirst = kind === 'loops'
  const drawn = !listed && group.name in STAGE_DRAWINGS
  const Panel = kind && PANELS[kind]
  const BareDrawing = !listed && kind ? BARE_DRAWINGS[kind] : undefined
  const PathDrawing =
    !listed && isPathKind(kind) ? PATH_DRAWINGS[kind] : undefined
  const rollBoxed = drawn || Boolean(group.memory && PathDrawing)
  const widget =
    kind === 'roll' && shownEditors.roll && !drawn ? (
      <TuneRoll />
    ) : kind === 'drums' && shownEditors.grid ? (
      <DrumGrid />
    ) : null
  const rigs = <Rigs group={group} seconds={seconds} />
  return (
    <div
      className={fresh ? styles.firstLook : styles.section}
      ref={el}
      id={groupAnchor(group.name)}
    >
      <div className={styles.header}>
        <span className={styles.title}>
          {group.name}
          {former && <span className={styles.was}> ({former})</span>}
        </span>
        {isPedal(group.name) && <BenchToggle stage={group.name} />}
        {kind === 'mic' && <MicSwitch />}
        <MicCap stage={group.name} />
        {(kind === 'roll' || group.memory) && !rollBoxed && (
          <EditorToggle which="roll" />
        )}
        {kind === 'drums' && <EditorToggle which="grid" />}
        <StageVerbs group={group} seconds={seconds} />
        <MoreMenu
          group={group}
          seconds={seconds}
          onClose={onClose}
          listed={drawable && !listedEverywhere ? listedHere : undefined}
          onList={setListedHere}
        />
        {!stacked && (
          <Tip text={`Close ${group.name} — the path stays.`}>
            <button
              className={styles.close}
              onClick={onClose}
              aria-label={`close ${group.name}`}
            >
              ×
            </button>
          </Tip>
        )}
      </div>
      <div className={styles.body}>
        <ReserveReadout defs={panelRows(group)}>
          {!drawn && <Lead group={group} />}
          {rigsFirst && rigs}
          {!drawn && widget}
          {Panel && <Panel />}
          {BareDrawing && <BareDrawing />}
          {PathDrawing && (
            <PathDrawing
              zoom={zoomFor(group.name)}
              verbs={verbsFor(group, seconds)}
            />
          )}
          {group.memory && !PathDrawing && shownEditors.roll && <MonoRoll />}
          {!rigsFirst && rigs}
          <Rows
            key={group.name}
            group={group}
            seconds={seconds}
            listed={listed}
            editor={drawn && widget}
          />
        </ReserveReadout>
      </div>
    </div>
  )
}
