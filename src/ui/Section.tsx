import { useEffect, useRef } from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { useStoreValue } from './ControlsContext'
import { engine } from '../engine/engine'
import { groupKeys, type Group } from './controls'
import { DrumGrid } from './DrumGrid'
import { resetGroup, rollGroup } from './presets'
import { scrollIntoPanel } from './reveal'
import { ControlSlider } from './Slider'
import styles from './Section.module.css'

function useTouchedCount(group: Group): number {
  const controls = useStoreValue(engine.controls)
  return groupKeys(group).filter(k => controls[k] !== DEFAULT_CONTROLS[k])
    .length
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
  // Both verbs go through the morph, so a stage travels the way a whole board
  // does and lands in the walk — a roll you don't like is one ctrl+z away.
  const roll = () =>
    engine.morphTo(
      rollGroup(group, engine.controls.get(), Math.random),
      seconds,
    )
  const reset = () =>
    engine.morphTo(resetGroup(group, engine.controls.get()), seconds)
  return (
    <div className={styles.section} ref={el}>
      <div className={styles.header}>
        <span className={styles.title}>{group.name}</span>
        {touched > 0 && <span className={styles.count}>• {touched}</span>}
        <button
          className={styles.verb}
          onClick={roll}
          title={
            group.editor?.kind === 'drums'
              ? 'roll this stage — the kit is the one whose pattern is part of it, so this writes the grid too, at the tempo you already had'
              : `roll every control in ${group.name} somewhere new and leave the rest of the board alone`
          }
        >
          roll
        </button>
        <button
          className={touched > 0 ? styles.verb : styles.verbOff}
          onClick={touched > 0 ? reset : undefined}
          disabled={touched === 0}
          title={
            touched > 0
              ? `put all ${touched} of this stage's moved controls back where they booted`
              : `${group.name} is already where it booted`
          }
        >
          reset
        </button>
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
        {group.editor?.kind === 'drums' && <DrumGrid />}
        {group.sliders.map(def => (
          <ControlSlider key={def.key} def={def} />
        ))}
      </div>
    </div>
  )
}

export function PathHint() {
  return (
    <p className={styles.hint}>
      click a stage on the path — or a part off the board — to open its controls
    </p>
  )
}
