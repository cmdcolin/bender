import { useEffect, useRef } from 'react'
import { useStoreValue } from './ControlsContext'
import { engine } from '../engine/engine'
import { touchedCount, type Group } from './controls'
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
        {group.sliders.map(def => (
          <ControlSlider key={def.key} def={def} />
        ))}
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
