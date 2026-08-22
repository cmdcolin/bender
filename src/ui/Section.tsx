import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { groupAnchor } from './chain-map'
import { useBoardValue } from './ControlsContext'
import { engine } from '../engine/engine'
import { touchedCount, type Group, type SliderDef } from './controls'
import { DrumGrid } from './DrumGrid'
import { Mixer } from './Mixer'
import { TuneRoll } from './TuneRoll'
import {
  applyCut,
  cutOff,
  cutSays,
  cutsFor,
  cutStands,
  cutWired,
  type CutDef,
  resetGroup,
  rollGroup,
} from './presets'
import { scrollIntoPanel } from './reveal'
import { ControlSlider } from './Slider'
import styles from './Section.module.css'
import { Tip } from './Tip'

// A count rather than the board it is counted off, so the eight parts on the
// shelf sit still through a morph instead of each recounting its group sixty
// times a second to print the same number.
function useTouchedCount(group: Group): number {
  return useBoardValue(c => touchedCount(group, c))
}

// Every stage's way back, wherever the stage is being shown from: the number of
// controls you have moved is the button that puts them back. It travels and
// lands in the walk like every other verb, so pressing it by mistake costs one
// ctrl+z. The map draws its own copy of this in SVG, to the same rule.
function putBack(group: Group, seconds: number) {
  engine.morphTo(resetGroup(group, engine.controls.get()), seconds)
}

const putBackTitle = (group: Group, touched: number) =>
  touched > 0
    ? `put all ${touched} of ${group.name}'s moved controls back where they booted — ctrl+z brings them again`
    : `${group.name} is already where it booted`

// A control the panel has a reason to draw: one with something to act on, or one
// your hand has already moved. A fault picks what happened to a wire nobody has
// cut, and that row is a question about nothing — but a value you set and then
// unwired is yours, and never vanishes out from under you.
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
    const name = def.part ?? null
    const last = out[out.length - 1]
    if (last?.name === name) last.sliders.push(def)
    else out.push({ name, sliders: [def] })
  }
  return out
}

const movedIn = (sliders: SliderDef[], c: Controls) =>
  sliders.filter(d => c[d.key] !== DEFAULT_CONTROLS[d.key]).length

// The cuts on offer under one heading, each of them one press of a knife the
// board has a name for. A row of chips rather than rows of its own, because
// nothing here is a control: pressing one moves the controls underneath, which
// is the whole of what it is for — the settings are hard to read cold, and this
// is the way in that leaves them on screen saying what they became.
function CutRow({
  cuts,
  group,
  part,
  standing,
  seconds,
}: {
  cuts: CutDef[]
  group: Group
  part: string
  standing: string
  seconds: number
}) {
  const wired = useBoardValue(c => cutWired(group.name, part, c))
  return (
    <div className={styles.cuts}>
      {cuts.map(cut => (
        <Tip
          key={cut.name}
          text={`${cut.blurb}. One press: ${cutSays(cut)} — which is where it lands in the rows under here`}
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
//
// A <details>, which is what this is: the browser draws the caret, works the
// keyboard, and owns which way the fold is sitting once it has been handed a way
// to start. Nothing here tracks that — a fold is the one piece of the panel that
// is about the panel rather than about the board.
function PartFold({
  name,
  rows,
  group,
  seconds,
  startOpen,
}: {
  name: string
  rows: SliderDef[]
  group: Group
  seconds: number
  startOpen: boolean
}) {
  const moved = useBoardValue(c => movedIn(rows, c))
  const cuts = cutsFor(group.name, name)
  // A cut has a name, and a name says more than a count of the controls it
  // moved: a shut fold reading 'machine-gun' is the heading telling you which
  // knife is on the bus without your having to open it and read three rows.
  const standing = useBoardValue(
    c => cuts.find(cut => cutStands(cut, c))?.name ?? '',
  )
  const says =
    standing === ''
      ? moved > 0
        ? `${moved} moved`
        : `${rows.length}`
      : standing
  return (
    <details className={styles.fold} open={startOpen}>
      <summary className={styles.foldHead}>
        {name}
        <span
          className={
            standing !== '' || moved > 0 ? styles.foldMoved : styles.foldCount
          }
        >
          {says}
        </span>
      </summary>
      {cuts.length > 0 && (
        <CutRow
          cuts={cuts}
          group={group}
          part={name}
          standing={standing}
          seconds={seconds}
        />
      )}
      {rows.map(def => (
        <ControlSlider key={def.key} def={def} />
      ))}
    </details>
  )
}

// A long stage in the shape its own table gives it: the everyday knobs on top,
// and the rest behind headings you press. Which headings start shut comes off
// the group — and one holding a control you have moved starts open anyway, since
// a panel that hides what you set is a panel lying about the board.
function Rows({ group, seconds }: { group: Group; seconds: number }) {
  const blocks = parts(group)
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
  const [startOpen] = useState(
    () =>
      new Set(
        blocks
          .filter(
            b =>
              b.name !== null &&
              (!(group.folded ?? []).includes(b.name) ||
                movedIn(b.sliders, engine.controls.get()) > 0),
          )
          .map(b => b.name),
      ),
  )
  return (
    <>
      {blocks.map(({ name, sliders }) => {
        const rows = sliders.filter(d => visible.has(d.key))
        if (name === null)
          return rows.map(def => <ControlSlider key={def.key} def={def} />)
        // A heading over nothing is the same question about nothing the rows
        // themselves wait out.
        if (rows.length === 0) return null
        return (
          <PartFold
            key={name}
            name={name}
            rows={rows}
            group={group}
            seconds={seconds}
            startOpen={startOpen.has(name)}
          />
        )
      })}
    </>
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
  const touched = useTouchedCount(group)
  const el = useRef<HTMLDivElement>(null)
  // A tall map can leave the stage it just opened below the fold, so the panel
  // comes to it — by as little as it takes, which is what scrollIntoPanel is for.
  useEffect(() => {
    if (el.current) scrollIntoPanel(el.current)
  }, [group.name])
  // Through the morph, so a stage travels the way a whole board does and lands
  // in the walk — a roll you don't like is one ctrl+z away.
  const roll = () =>
    engine.morphTo(
      rollGroup(group, engine.controls.get(), Math.random),
      seconds,
    )
  return (
    // The id every door on the map points at. The map draws its boxes as
    // links so a keyboard reaches them at all, and a link wants somewhere to
    // land.
    <div className={styles.section} ref={el} id={groupAnchor(group.name)}>
      <div className={styles.header}>
        <span className={styles.title}>{group.name}</span>
        <Tip
          text={
            group.editor?.kind === 'drums'
              ? 'roll this stage — the kit is the one whose pattern is part of it, so this writes the grid too, at the tempo you already had'
              : `roll every control in ${group.name} somewhere new and leave the rest of the board alone`
          }
        >
          <button className={styles.verb} onClick={roll}>
            roll
          </button>
        </Tip>
        <Tip text={putBackTitle(group, touched)}>
          <button
            className={touched > 0 ? styles.reset : styles.verbOff}
            onClick={() => putBack(group, seconds)}
            disabled={touched === 0}
          >
            {touched > 0 ? `reset ${touched}` : 'reset'}
          </button>
        </Tip>
        <Tip text={`close ${group.name} — the path stays`}>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label={`close ${group.name}`}
          >
            ×
          </button>
        </Tip>
      </div>
      <div className={styles.body}>
        {group.editor?.kind === 'drums' && <DrumGrid />}
        {group.editor?.kind === 'roll' && <TuneRoll />}
        {group.editor?.kind === 'mixer' && <Mixer />}
        <Rows key={group.name} group={group} seconds={seconds} />
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
  open,
  onOpen,
  seconds,
}: {
  groups: Group[]
  open: string | null
  onOpen: (name: string) => void
  seconds: number
}) {
  if (groups.length === 0) return null
  return (
    <div className={styles.shelf}>
      <span className={styles.shelfLabel}>off the board</span>
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

// One line, because it is the line you read once. It used to spend four of them
// on the same two sentences, which is a fifth of a short screen's panel held
// open for a note nobody needs twice.
export function PathHint() {
  return (
    <p className={styles.hint}>
      click a stage for its controls — the number on it is how many you have
      moved, and puts them back
    </p>
  )
}
