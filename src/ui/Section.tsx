import { useEffect, useRef } from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { useStoreValue } from './ControlsContext'
import { engine } from '../engine/engine'
import { groupKeys, type Group } from './controls'
import { DrumGrid } from './DrumGrid'
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
