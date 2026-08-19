import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { useStoreValue } from './ControlsContext'
import { engine } from '../engine/engine'
import { touchedCount, type Group, type SliderDef } from './controls'
import { DrumGrid } from './DrumGrid'
import { resetGroup, rollGroup } from './presets'
import { scrollIntoPanel } from './reveal'
import { ControlSlider } from './Slider'
import styles from './Section.module.css'
import { Tip } from './Tip'

function useTouchedCount(group: Group): number {
  return touchedCount(group, useStoreValue(engine.controls))
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

// A heading and what sits under it, with its own count and its own fold. The
// count is the group header's promise made smaller: how many of these you have
// moved, so a folded part still says whether anything is going on inside it.
function PartFold({
  part,
  rows,
  c,
  closed,
  onToggle,
}: {
  part: Part
  rows: SliderDef[]
  c: Controls
  closed: boolean
  onToggle: () => void
}) {
  const moved = movedIn(part.sliders, c)
  return (
    <div className={styles.fold}>
      <button
        className={styles.foldHead}
        aria-expanded={!closed}
        onClick={onToggle}
      >
        <span className={styles.foldMark}>{closed ? '▸' : '▾'}</span>
        <span className={styles.foldName}>{part.name}</span>
        <span className={moved > 0 ? styles.foldMoved : styles.foldCount}>
          {moved > 0 ? `${moved} moved` : part.sliders.length}
        </span>
      </button>
      {!closed && rows.map(def => <ControlSlider key={def.key} def={def} />)}
    </div>
  )
}

// A long stage in the shape its own table gives it: the everyday knobs on top,
// and the rest behind headings you press. Which headings start shut comes off
// the group — and one holding a control you have moved starts open anyway, since
// a panel that hides what you set is a panel lying about the board.
function Rows({ group }: { group: Group }) {
  const c = useStoreValue(engine.controls)
  const blocks = parts(group)
  const [shut, setShut] = useState<readonly string[]>(() =>
    (group.folded ?? []).filter(
      name =>
        movedIn(blocks.find(b => b.name === name)?.sliders ?? [], c) === 0,
    ),
  )
  const toggle = (name: string) =>
    setShut(s => (s.includes(name) ? s.filter(n => n !== name) : [...s, name]))
  return (
    <>
      {blocks.map(part => {
        const rows = part.sliders.filter(d => shown(d, c))
        if (part.name === null)
          return rows.map(def => <ControlSlider key={def.key} def={def} />)
        return (
          <PartFold
            key={part.name}
            part={part}
            rows={rows}
            c={c}
            closed={shut.includes(part.name)}
            onToggle={() => toggle(part.name!)}
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
    <div className={styles.section} ref={el}>
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
        <Rows key={group.name} group={group} />
      </div>
    </div>
  )
}

// The parts the drawing has no wire for: the slot rack, any bend sitting in no
// slot, and a patch bay or body pad with nothing soldered to it. They sit on a
// shelf under the map, because "nothing is wired to this" is a hard thing to
// say inside a picture made of wires — and the map is the panel's only index,
// so a part it can't hold still needs somewhere to be picked up from.
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

export function PathHint() {
  return (
    <p className={styles.hint}>
      click a stage on the path — or a part off the board — to open its
      controls. The number beside a name is how many of its controls you have
      moved: press the number to put that stage back where it booted
    </p>
  )
}
