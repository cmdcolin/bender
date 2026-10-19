import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { isPedal } from '../pedals.ts'
import { AmpPathDiagram } from './AmpPathDiagram.tsx'
import { bench, setBench } from './bench.ts'
import { groupAnchor } from './chain-map.ts'
import {
  groupKeys,
  touchedCount,
  SLIDER_BY_KEY,
  type Group,
  type SliderDef,
} from './controls/index.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { DrumGrid } from './DrumGrid.tsx'
import { FeedbackLoops } from './FeedbackLoops.tsx'
import { firstLook, markLooked } from './firstLook.ts'
import { removable, takeOff } from './fitted.ts'
import { FmChipDiagram } from './FmChipDiagram.tsx'
import { Fold } from './Fold.tsx'
import { FoldDrawing, zoomFor } from './foldDrawings.tsx'
import {
  DRAWN_ROWS,
  hostedBy,
  isHosted,
  STAGE_DRAWINGS,
  type Verbs,
} from './foldHosting.ts'
import { FourTrack } from './FourTrack.tsx'
import { Menu } from './Menu.tsx'
import { menuItem } from './menuItems.ts'
import { MicPatch, MicSwitch } from './MicPatch.tsx'
import { Mixer } from './Mixer.tsx'
import { MonoPathDiagram } from './MonoPathDiagram.tsx'
import { MonoRoll } from './MonoRoll.tsx'
import { OrderRack } from './OrderRack.tsx'
import { PatchBay } from './PatchBay.tsx'
import { PcmKeysDiagram } from './PcmKeysDiagram.tsx'
import { BenchToggle } from './Pedals.tsx'
import {
  applyCut,
  applyRig,
  cutOff,
  cutSays,
  cutsFor,
  cutStands,
  cutWired,
  type CutDef,
  resetGroup,
  resetKeys,
  rigsFor,
  rigStands,
  rollGroup,
  rollKeys,
} from './presets/index.ts'
import { scrollIntoPanel } from './reveal.ts'
import { rollIn, undoRoll, useCanUndoRoll } from './rollBack.ts'
import styles from './Section.module.css'
import { ControlSlider, ReserveReadout } from './Slider.tsx'
import { slidersFirst } from './slidersFirst.ts'
import { SupplyReading } from './SupplyReading.tsx'
import { TapeLoopDiagram } from './TapeLoopDiagram.tsx'
import { TapePathDiagram } from './TapePathDiagram.tsx'
import { Tip } from './Tip.tsx'
import { ToggleButtonGroup } from './ToggleButtonGroup.tsx'
import { TriggerPatch } from './TriggerPatch.tsx'
import { TuneRoll } from './TuneRoll.tsx'

const CUTS_SHOWN = 4

// A count rather than the board it is counted off, so the eight parts on the
// shelf sit still through a morph instead of each recounting its group sixty
// times a second to print the same number.
function useTouchedCount(group: Group): number {
  return useBoardValue(c => touchedCount(group, c))
}

// Every stage's way back, wherever the stage is being shown from: its own
// reset button, once it is open, puts its moved controls back. It travels and
// lands in the walk like every other verb, so pressing it by mistake costs one
// ctrl+z.
function putBack(group: Group, seconds: number) {
  engine.morphTo(
    resetGroup(group, engine.controls.get()),
    seconds,
    new Set(groupKeys(group)),
  )
}

const putBackTitle = (group: Group, touched: number) =>
  touched > 0
    ? `put all ${touched} of ${group.name}'s moved controls back where they booted — ctrl+z brings them again`
    : `${group.name} is already where it booted`

// A control the panel has a reason to draw: one with something to act on, or one
// your hand has already moved. A fault picks what happened to a wire nobody has
// cut, and that row is a question about nothing — but a value you set and then
// unwired is yours, and never vanishes out from under you.
// Every control a stage draws as a row, its own and the ones it borrows for a
// widget of its own — kept by name, because the rows measure themselves against
// each other and the panel is rebuilt as the board travels.
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

interface Part {
  name: string | null
  sliders: SliderDef[]
}

// The group's controls in table order, cut at every heading a control names.
// Anything naming none comes back under `null`, which is the block above the
// first heading — a stage's everyday knobs, and for most stages the whole of it.
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

/** The diagram box the stage header's roll, undo and reset act on. */
interface Aim {
  scope: string
  what: string
  keys: ControlKey[]
}

const AimVerbs = createContext<(id: symbol, aim: Aim | null) => void>(() => {})

const WHOLE = 'whole stage'

function StageVerbs({
  group,
  aim,
  seconds,
}: {
  group: Group
  aim: Aim | null
  seconds: number
}) {
  const touched = useTouchedCount(group)
  const keys = aim?.keys ?? []
  const boxMoved = useBoardValue(
    c => keys.filter(k => c[k] !== DEFAULT_CONTROLS[k]).length,
  )
  const moved = aim ? boxMoved : touched
  const what = aim?.what ?? group.name
  const roll = () =>
    aim
      ? rollIn(
          aim.scope,
          rollKeys(engine.controls.get(), aim.keys, Math.random, true),
          seconds,
        )
      : rollIn(
          group.name,
          rollGroup(group, engine.controls.get(), Math.random),
          seconds,
        )
  const reset = () =>
    aim
      ? engine.morphTo(
          resetKeys(engine.controls.get(), aim.keys),
          seconds,
          new Set(aim.keys),
        )
      : putBack(group, seconds)
  return (
    <>
      <Tip
        text={
          aim
            ? `Roll the ${aim.keys.length} controls under ${what} somewhere new and leave the rest of ${group.name} where it stands.`
            : group.editor?.kind === 'drums'
              ? 'roll this stage — the kit is the one whose pattern is part of it, so this writes the grid too, at the tempo you already had'
              : `roll every control in ${group.name} somewhere new and leave the rest of the board alone`
        }
      >
        <button className={styles.verb} onClick={roll}>
          roll
        </button>
      </Tip>
      <UndoRoll
        scope={aim?.scope ?? group.name}
        what={what}
        seconds={seconds}
      />
      <Tip
        text={
          aim
            ? moved > 0
              ? `put ${what}'s ${moved} moved controls back where they booted — ctrl+z brings them again`
              : `${what} is already where it booted`
            : putBackTitle(group, touched)
        }
      >
        <button
          className={moved > 0 ? styles.reset : styles.verbOff}
          onClick={reset}
          disabled={moved === 0}
        >
          {moved > 0 ? `reset ${moved}` : 'reset'}
        </button>
      </Tip>
    </>
  )
}

function MoreMenu({
  group,
  seconds,
  onClose,
}: {
  group: Group
  seconds: number
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  if (!removable(group.name)) return null
  return (
    <>
      <button
        ref={setButton}
        className={styles.verb}
        aria-label={`more for ${group.name}`}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        ⋯
      </button>
      {open && (
        <Menu
          anchor={button}
          toggle={button}
          role="menu"
          onClose={() => setOpen(false)}
        >
          <Tip
            text={`Take ${group.name} off the board and the map. A stage with a level or mix gets it turned off and keeps its other knobs; any other goes back to where it booted. Rolls leave it alone until you add it again.`}
          >
            <button
              role="menuitem"
              className={menuItem(false)}
              onClick={() => {
                setOpen(false)
                engine.morphTo(takeOff(group, engine.controls.get()), seconds)
                onClose()
              }}
            >
              take off
            </button>
          </Tip>
        </Menu>
      )}
    </>
  )
}

function UndoRoll({
  scope,
  what,
  seconds,
  fold = false,
}: {
  scope: string
  what: string
  seconds: number
  fold?: boolean
}) {
  const on = fold ? styles.partVerb : styles.verb
  const off = fold ? styles.partVerbOff : styles.verbOff
  const can = useCanUndoRoll(scope)
  return (
    <Tip
      text={
        can
          ? `put ${what} back where it stood before its last roll, and leave every other control where it is now`
          : `no roll of ${what} to take back`
      }
    >
      <button
        className={can ? on : off}
        disabled={!can}
        onClick={() => undoRoll(scope, seconds)}
      >
        undo
      </button>
    </Tip>
  )
}

// The verbs and the cuts for one heading, in a row above the rows they move.
// Nothing here is a control: pressing one moves the controls underneath, which
// is the whole of what it is for — the settings are hard to read cold, and this
// is the way in that leaves them on screen saying what they became.
//
// The dice and the way back are per heading and not only per stage because a
// heading is where the board keeps the things that only mean anything together.
// Rolling the whole of *Toy keyboard* to hear a different knife on its bus
// re-rolls its clock, its supply and its bend pot as well, so what you get is a
// different board and not a different cut — and the three controls you pointed
// at are the ones you can no longer hear the effect of.
//
// Inside the fold rather than on the heading, like the cuts: a row of verbs on
// a heading you have not opened is a promise about controls you cannot see.
function PartVerbs({
  cuts,
  group,
  part,
  what = part,
  rows,
  moved,
  standing,
  seconds,
  verbs = true,
}: {
  cuts: CutDef[]
  group: Group
  part: string
  /** The box the verbs act for, when it holds only some of the part. */
  what?: string
  rows: SliderDef[]
  moved: number
  standing: string
  seconds: number
  /** False where the stage header carries roll, undo and reset for this box. */
  verbs?: boolean
}) {
  const wired = useBoardValue(c => cutWired(group.name, part, c))
  const [open, setOpen] = useState(false)
  const shownCuts = open
    ? cuts
    : cuts.filter((cut, i) => i < CUTS_SHOWN || cut.name === standing)
  const hidden = cuts.length - shownCuts.length
  const keys = rows.map(d => d.key)
  const scope = `${group.name} › ${what}`
  if (!verbs && cuts.length === 0) return null
  return (
    <div className={styles.cuts}>
      {verbs && (
        <>
          <Tip
            text={`Roll the ${rows.length} controls under ${what} somewhere new and leave the rest of ${group.name} where it stands.`}
          >
            <button
              className={styles.partVerb}
              onClick={() =>
                rollIn(
                  scope,
                  rollKeys(engine.controls.get(), keys, Math.random, true),
                  seconds,
                )
              }
            >
              roll
            </button>
          </Tip>
          <UndoRoll scope={scope} what={what} seconds={seconds} fold />
          <Tip
            text={
              moved > 0
                ? `put ${what}'s ${moved} moved controls back where they booted — ctrl+z brings them again`
                : `${what} is already where it booted`
            }
          >
            <button
              className={moved > 0 ? styles.partVerbReset : styles.partOff}
              disabled={moved === 0}
              onClick={() =>
                engine.morphTo(
                  resetKeys(engine.controls.get(), keys),
                  seconds,
                  new Set(keys),
                )
              }
            >
              {moved > 0 ? `reset ${moved}` : 'reset'}
            </button>
          </Tip>
        </>
      )}
      {shownCuts.map(cut => (
        <Tip
          key={cut.name}
          text={`${cut.blurb}. One press: ${cutSays(cut)} — which is where it lands in the rows under here.`}
        >
          <button
            className={standing === cut.name ? styles.cutOn : styles.cut}
            onClick={() =>
              engine.morphTo(applyCut(cut, engine.controls.get()), seconds)
            }
          >
            {cut.name}
          </button>
        </Tip>
      ))}
      {hidden > 0 && (
        <button className={styles.cutMore} onClick={() => setOpen(true)}>
          {`${hidden} more`}
        </button>
      )}
      {cuts.length > 0 && (wired || open) && (
        <Tip
          text={
            wired
              ? `take the knife off ${group.name}'s buses and leave the rest of the stage alone`
              : `there is no knife on ${group.name}'s buses`
          }
        >
          <button
            className={wired ? styles.cut : styles.cutOff}
            disabled={!wired}
            onClick={() =>
              engine.morphTo(
                cutOff(group.name, part, engine.controls.get()),
                seconds,
              )
            }
          >
            none
          </button>
        </Tip>
      )}
    </div>
  )
}

// A stage's settings, where the stage is one machine rather than a row of
// separate effects and any single knob on it does nothing you can hear. The
// desk is sixteen controls that only mean something in combination, and a hand
// arriving at it has nowhere to start; these are the places it goes that are
// worth hearing, named for the noise and not for the wiring. Above the rows and
// under the picture, because the picture is what a rig visibly changes.
function Rigs({ group, seconds }: { group: Group; seconds: number }) {
  const rigs = rigsFor(group.name)
  const standing = useBoardValue(
    c => rigs.find(rig => rigStands(rig, c))?.name ?? '',
  )
  if (rigs.length === 0) return null
  return (
    <div className={styles.rigs}>
      <span className={styles.rigsLabel}>settings</span>
      {rigs.map(rig => (
        <Tip
          key={rig.name}
          text={`${rig.blurb}. One press: ${group.name} goes back to stock and this is written over it — the rows under here say what it became.`}
        >
          <button
            className={standing === rig.name ? styles.cutOn : styles.cut}
            onClick={() =>
              engine.morphTo(applyRig(rig, engine.controls.get()), seconds)
            }
          >
            {rig.name}
          </button>
        </Tip>
      ))}
    </div>
  )
}

// A heading and what sits under it, with its own count and its own fold. The
// count is the group header's promise made smaller: how many of these you have
// moved, so a folded part still says whether anything is going on inside it.
//
// It counts the rows the fold will actually open to, not every control the
// table files under the heading: a fault waiting on a wire nobody has cut is
// not down there yet, and a heading promising eight controls that opens on four
// is a heading nobody trusts twice. Every control you have moved is shown, so
// the moved count is the same either way.
function PartFold({
  name,
  rows,
  group,
  hosted,
  seconds,
  startOpen,
}: {
  name: string
  rows: SliderDef[]
  /** The rows of the folds the drawing took over, counted as this fold's own. */
  hosted: SliderDef[]
  group: Group
  seconds: number
  startOpen: boolean
}) {
  const own = useBoardValue(c => movedIn(rows, c))
  const moved = useBoardValue(c => movedIn([...rows, ...hosted], c))
  const cuts = cutsFor(group.name, name)
  // A cut has a name, and a name says more than a count of the controls it
  // moved: a shut fold reading 'machine-gun' is the heading telling you which
  // knife is on the bus without your having to open it and read three rows.
  const standing = useBoardValue(
    c => cuts.find(cut => cutStands(cut, c))?.name ?? '',
  )
  const hostedCuts = hostedBy(group.name, name).flatMap(part =>
    cutsFor(group.name, part),
  )
  const hostedStanding = useBoardValue(
    c => hostedCuts.find(cut => cutStands(cut, c))?.name ?? '',
  )
  const badge = standing || hostedStanding
  const says =
    badge === ''
      ? moved > 0
        ? `${moved} moved`
        : `${rows.length + hosted.length}`
      : badge
  const caution = group.caution?.part === name ? group.caution.text : null
  return (
    <Fold
      name={name}
      badge={says}
      moved={badge !== '' || moved > 0}
      startOpen={startOpen}
    >
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
      <FoldDrawing
        group={group.name}
        part={name}
        verbs={(part, box) => (
          <BoxVerbs group={group} part={part} box={box} seconds={seconds} />
        )}
      />
      {!DRAWN_ROWS.has(`${group.name}|${name}`) &&
        slidersFirst(rows).map(def => (
          <ControlSlider key={def.key} def={def} />
        ))}
    </Fold>
  )
}

// A fold's verbs for a drawing that has taken the fold's place: the same dice,
// reset and named cuts, over the rows the fold would have shown.
function BoxVerbs({
  group,
  part,
  box,
  seconds,
}: {
  group: Group
  part: string
  box?: Parameters<Verbs>[1]
  seconds: number
}) {
  const shownList = useBoardValue(c =>
    group.sliders
      .filter(
        d =>
          d.part === part && (!box || box.keys.includes(d.key)) && shown(d, c),
      )
      .map(d => d.key)
      .join(','),
  )
  const shownKeys = shownList.split(',')
  const rows = group.sliders.filter(d => shownKeys.includes(d.key))
  const cuts = cutsFor(group.name, part)
  const moved = useBoardValue(c => movedIn(rows, c))
  const standing = useBoardValue(
    c => cuts.find(cut => cutStands(cut, c))?.name ?? '',
  )
  const aim = useContext(AimVerbs)
  const [id] = useState(() => Symbol('box'))
  const what = box?.name ?? part
  useEffect(() => {
    const listed = shownList.split(',')
    const keys = group.sliders
      .filter(d => listed.includes(d.key))
      .map(d => d.key)
    aim(id, { scope: `${group.name} › ${what}`, what, keys })
  }, [aim, id, group, what, shownList])
  useEffect(() => () => aim(id, null), [aim, id])
  return (
    <>
      <PartVerbs
        cuts={cuts}
        group={group}
        part={part}
        what={box?.name}
        rows={rows}
        moved={moved}
        standing={standing}
        seconds={seconds}
        verbs={false}
      />
    </>
  )
}

// The rows that sit over the widget rather than under it. Nothing decides
// which ones except the group saying so — a piano roll is tall enough to push
// the row naming the song being played off the bottom of the screen, and that
// is the row the roll is about.
function Lead({ group }: { group: Group }) {
  const keys = group.lead ?? []
  const rows = group.sliders.filter(def => keys.includes(def.key))
  // The same string the rest of the rows come off, and for the same reason: a
  // row arriving or leaving is rare, and the board moves sixty times a second.
  const shownKeys = useBoardValue(c =>
    rows
      .filter(d => shown(d, c))
      .map(d => d.key)
      .join(','),
  )
  const visible = new Set(shownKeys.split(','))
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

// A long stage in the shape its own table gives it: the everyday knobs on top,
// and the rest behind headings you press. Which headings start shut comes off
// the group — and one holding a control you have moved starts open anyway, since
// a panel that hides what you set is a panel lying about the board.
function Rows({
  group,
  seconds,
  editor,
}: {
  group: Group
  seconds: number
  editor?: ReactNode
}) {
  const blocks = parts(group)
  const drawn = STAGE_DRAWINGS[group.name]
  // Which rows have anything to act on, as a string rather than the board they
  // are read off: a stage stands open through morphs and drags, and taking the
  // board would rebuild every row in it sixty times a second — where what the
  // list actually turns on is a row arriving or leaving, which is rare. The
  // rows themselves each hold their own control and move on their own.
  const shownKeys = useBoardValue(c =>
    group.sliders
      .filter(d => shown(d, c))
      .map(d => d.key)
      .join(','),
  )
  const visible = new Set(shownKeys.split(','))
  // Settled the once, on the way in: the fold itself belongs to the browser from
  // there, and a heading that reopened under a morph because the board had moved
  // would be the panel taking a hand off the knob you were turning.
  const hostedRows = (name: string) =>
    blocks
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
              verbs={(part, box) => (
                <BoxVerbs
                  group={group}
                  part={part}
                  box={box}
                  seconds={seconds}
                />
              )}
            />
          )
        if (drawn && name === null) return null
        if (name === null)
          return slidersFirst(rows).map(def => (
            <ControlSlider key={def.key} def={def} />
          ))
        if (isHosted(group.name, name)) return null
        // A heading over nothing is the same question about nothing the rows
        // themselves wait out.
        if (rows.length === 0) return null
        return (
          <PartFold
            key={name}
            name={name}
            rows={rows}
            hosted={hostedRows(name)}
            group={group}
            seconds={seconds}
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

// The piano roll and the drum grid are tall, and a player who never writes a
// melody or a pattern would scroll past them to reach the knobs.
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

// The one stage the map has open, with its controls already unfolded. The panel
// used to stack all twenty groups as collapsed headers and scroll to whichever
// the map pointed at; the map is the index now, so what is on screen is what
// you are turning.
export function OpenGroup({
  group,
  onClose,
  seconds,
}: {
  group: Group
  onClose: () => void
  seconds: number
}) {
  const shownEditors = useStoreValue(bench)
  const el = useRef<HTMLDivElement>(null)
  const fresh = useMemo(() => firstLook(group.name), [group.name])
  useEffect(() => {
    if (fresh) markLooked(group.name)
  }, [fresh, group.name])
  // A tall map can leave the stage it just opened below the fold, so the panel
  // comes to it — by as little as it takes, which is what scrollIntoPanel is for.
  //
  // On the next frame rather than in this commit. Every question it asks — what
  // overflows, how tall a box is, where it sits — wants a laid-out document, and
  // the commit it would run in has just mounted a rack of controls and made that
  // untrue. Asking now drags the whole rack through style and layout inside the
  // render that built it; asking a frame later reads work the browser has done
  // anyway. The scroll is smooth and nobody can see the frame.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (el.current) scrollIntoPanel(el.current)
    })
    return () => cancelAnimationFrame(raf)
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- scrolls again each time a different stage opens
  }, [group.name])
  const [aim, setAim] = useState<{ id: symbol; aim: Aim } | null>(null)
  const [wholeFor, setWholeFor] = useState<string | null>(null)
  const aimAt = useCallback(
    (id: symbol, next: Aim | null) =>
      setAim(prev => {
        if (next === null) return prev?.id === id ? null : prev
        const same =
          prev?.id === id &&
          prev.aim.scope === next.scope &&
          prev.aim.keys.join() === next.keys.join()
        return same ? prev : { id, aim: next }
      }),
    [],
  )
  const boxAim = aim?.aim ?? null
  const aimed = boxAim && wholeFor !== boxAim.scope ? boxAim : null
  // The four-track's settings go above its lanes: they are the way in for a hand
  // that cannot see where to start, and four lanes of empty tape would push them
  // off the screen.
  const rigsFirst = group.editor?.kind === 'loops'
  const drawn = group.name in STAGE_DRAWINGS
  const widget =
    group.editor?.kind === 'roll' && shownEditors.roll ? (
      <TuneRoll />
    ) : group.editor?.kind === 'drums' && shownEditors.grid ? (
      <DrumGrid />
    ) : null
  const rigs = <Rigs group={group} seconds={seconds} />
  return (
    // The id every door on the map points at. The map draws its boxes as
    // links so a keyboard reaches them at all, and a link wants somewhere to
    // land.
    <div
      className={fresh ? styles.firstLook : styles.section}
      ref={el}
      id={groupAnchor(group.name)}
    >
      <div className={styles.header}>
        <span className={styles.title}>{group.name}</span>
        {isPedal(group.name) && <BenchToggle stage={group.name} />}
        {group.editor?.kind === 'mic' && <MicSwitch />}
        {(group.editor?.kind === 'roll' || group.memory) && (
          <EditorToggle which="roll" />
        )}
        {group.editor?.kind === 'drums' && <EditorToggle which="grid" />}
        <StageVerbs group={group} aim={aimed} seconds={seconds} />
        <MoreMenu group={group} seconds={seconds} onClose={onClose} />
        <Tip text={`Close ${group.name} — the path stays.`}>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label={`close ${group.name}`}
          >
            ×
          </button>
        </Tip>
      </div>
      {boxAim && (
        <div className={styles.aim}>
          <span>roll, undo and reset act on</span>
          <ToggleButtonGroup
            label="what roll, undo and reset act on"
            options={[boxAim.what, WHOLE]}
            value={aimed ? boxAim.what : WHOLE}
            onChange={v => setWholeFor(v === WHOLE ? boxAim.scope : null)}
          />
        </div>
      )}
      <div className={styles.body}>
        <AimVerbs.Provider value={aimAt}>
          <ReserveReadout defs={panelRows(group)}>
            {!drawn && <Lead group={group} />}
            {rigsFirst && rigs}
            {!drawn && widget}
            {group.editor?.kind === 'mixer' && <Mixer />}
            {group.editor?.kind === 'feedback' && <FeedbackLoops />}
            {group.editor?.kind === 'order' && <OrderRack />}
            {group.editor?.kind === 'patch' && <PatchBay />}
            {group.editor?.kind === 'trigger' && <TriggerPatch />}
            {group.editor?.kind === 'supply' && <SupplyReading />}
            {group.editor?.kind === 'mic' && <MicPatch />}
            {group.editor?.kind === 'loops' && <FourTrack />}
            {group.editor?.kind === 'tapeLoop' && <TapeLoopDiagram />}
            {group.editor?.kind === 'tapePath' && <TapePathDiagram />}
            {group.editor?.kind === 'fm' && (
              <FmChipDiagram
                zoom={zoomFor(group.name)}
                verbs={(part, box) => (
                  <BoxVerbs
                    group={group}
                    part={part}
                    box={box}
                    seconds={seconds}
                  />
                )}
              />
            )}
            {group.editor?.kind === 'pcm' && (
              <PcmKeysDiagram
                zoom={zoomFor(group.name)}
                verbs={(part, box) => (
                  <BoxVerbs
                    group={group}
                    part={part}
                    box={box}
                    seconds={seconds}
                  />
                )}
              />
            )}
            {group.editor?.kind === 'ampPath' && <AmpPathDiagram />}
            {group.editor?.kind === 'monoPath' && (
              <MonoPathDiagram
                zoom={zoomFor(group.name)}
                verbs={(part, box) => (
                  <BoxVerbs
                    group={group}
                    part={part}
                    box={box}
                    seconds={seconds}
                  />
                )}
              />
            )}
            {group.memory && shownEditors.roll && <MonoRoll />}
            {!rigsFirst && rigs}
            <Rows
              key={group.name}
              group={group}
              seconds={seconds}
              editor={drawn && widget}
            />
          </ReserveReadout>
        </AimVerbs.Provider>
      </div>
    </div>
  )
}

// Whatever the drawing found no door for. "Nothing is wired to this" is a hard
// thing to say inside a picture made of wires, and this used to be where it was
// said: the slot rack, the bends in no slot, a bay or contact pad with nothing
// soldered to it. The drawing says all of that itself now — the rack carries
// what is in none of its slots, the lane between the toys says when neither
// fires the other, and the bay and the pad sit at the foot — so nothing is
// expected here. It stays because the map is the panel's only index, and a
// group with no door on it would otherwise have no way in at all.
export function Shelf({
  groups,
  label,
  open,
  onOpen,
  seconds,
}: {
  groups: Group[]
  label: string
  open: string | null
  onOpen: (name: string) => void
  seconds: number
}) {
  if (groups.length === 0) return null
  return (
    <div className={styles.shelf}>
      <span className={styles.shelfLabel}>{label}</span>
      {groups.map(g => (
        <ShelfPart
          key={g.name}
          group={g}
          on={open === g.name}
          onOpen={onOpen}
          seconds={seconds}
        />
      ))}
    </div>
  )
}

function ShelfPart({
  group,
  on,
  onOpen,
  seconds,
}: {
  group: Group
  on: boolean
  onOpen: (name: string) => void
  seconds: number
}) {
  const touched = useTouchedCount(group)
  return (
    <span className={on ? styles.partOn : styles.part}>
      <button
        className={styles.partName}
        aria-expanded={on}
        onClick={() => onOpen(group.name)}
      >
        {group.name}
      </button>
      {touched > 0 && (
        <Tip text={putBackTitle(group, touched)}>
          <button
            className={styles.partReset}
            onClick={() => putBack(group, seconds)}
            aria-label={`reset ${group.name}`}
          >
            {touched}
          </button>
        </Tip>
      )}
    </span>
  )
}

// Two lines, because there are two things to say once. The first is how the
// drawing is worked; the second is what it is a drawing of, which is the one
// thing nothing else on screen says — Signal order sets the order of both runs
// it names and can hardly be where you find out that the sound runs through
// them in order, since you would have to know what it was to go and open it.
export function PathHint() {
  return (
    <>
      <p className={styles.hint}>
        click a stage for its controls — a dot on it means something in there
        has moved
      </p>
      <p className={styles.hintPath}>
        the drawing is the path the sound takes: the sources sum onto the mix
        bus, run through the bends and then the pedals, in the order{' '}
        <em>Signal order</em> sets, then the tape and out. It shows only the
        stages on the board; <em>+ add a stage</em> brings in another,{' '}
        <em>− take off a stage</em> removes one, and random, mutate and drift
        change only what is drawn here
      </p>
    </>
  )
}
