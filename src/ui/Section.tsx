import { useEffect, useRef } from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { useStoreValue } from './ControlsContext'
import { engine } from '../engine/engine'
import type { Group } from './controls'
import { scrollIntoPanel } from './reveal'
import { ControlSlider } from './Slider'
import styles from './Section.module.css'

function useTouchedCount(group: Group): number {
  const controls = useStoreValue(engine.controls)
  return group.sliders.filter(s => controls[s.key] !== DEFAULT_CONTROLS[s.key])
    .length
}

// The one stage the map has open, with its controls already unfolded. The panel
// used to stack all twenty groups as collapsed headers and scroll to whichever
// the map pointed at; the map is the index now, so what is on screen is what
// you are turning.
export function OpenGroup({
  group,
  onClose,
}: {
  group: Group
  onClose: () => void
}) {
  const touched = useTouchedCount(group)
  const el = useRef<HTMLDivElement>(null)
  // A tall map can leave the stage it just opened below the fold, so the panel
  // comes to it — by as little as it takes, which is what scrollIntoPanel is for.
  useEffect(() => {
    if (el.current) scrollIntoPanel(el.current)
  }, [group.name])
  return (
    <div className={styles.section} ref={el}>
      <div className={styles.header}>
        <span className={styles.title}>{group.name}</span>
        {touched > 0 && <span className={styles.count}>• {touched}</span>}
        <button
          className={styles.close}
          onClick={onClose}
          title={`close ${group.name} — the path stays`}
          aria-label={`close ${group.name}`}
        >
          ×
        </button>
      </div>
      <div className={styles.body}>
        {group.sliders.map(def => (
          <ControlSlider key={def.key} def={def} />
        ))}
      </div>
    </div>
  )
}

// The stages the drawing has nowhere to put: the slot order that decides the
// drawing, the patch bay and body pad that ride over it, and any bend sitting
// in no slot. Chips rather than boxes, because "no wire reaches this" is a hard
// thing to say inside a picture made of wires.
export function OffPathChips({
  groups,
  open,
  onOpen,
}: {
  groups: Group[]
  open: string | null
  onOpen: (name: string) => void
}) {
  if (groups.length === 0) return null
  return (
    <div className={styles.chips}>
      {groups.map(g => (
        <OffPathChip
          key={g.name}
          group={g}
          on={open === g.name}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function OffPathChip({
  group,
  on,
  onOpen,
}: {
  group: Group
  on: boolean
  onOpen: (name: string) => void
}) {
  const touched = useTouchedCount(group)
  return (
    <button
      className={on ? styles.chipOn : styles.chip}
      aria-expanded={on}
      onClick={() => onOpen(group.name)}
    >
      {group.name}
      {touched > 0 && <span className={styles.chipCount}> • {touched}</span>}
    </button>
  )
}

export function PathHint() {
  return (
    <p className={styles.hint}>
      click a stage on the path to open its controls
    </p>
  )
}
