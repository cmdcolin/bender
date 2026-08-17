import { Fragment } from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { GROUPS, STAGE_ORDER } from './controls'
import styles from './ChainMap.module.css'

// The signal path as a clickable spine: each stage shows how many of its
// controls are off stock.
export function ChainMap() {
  const controls = useStoreValue(engine.controls)
  return (
    <div className={styles.map}>
      {STAGE_ORDER.map((stage, i) => {
        const touched = GROUPS.filter(g => g.place === stage)
          .flatMap(g => g.sliders)
          .filter(s => controls[s.key] !== DEFAULT_CONTROLS[s.key]).length
        return (
          <Fragment key={stage}>
            {i > 0 && <span className={styles.arrow}>→</span>}
            <button
              className={styles.stage}
              onClick={() =>
                document
                  .getElementById(`stage-${stage}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              {stage}
              {touched > 0 && <span className={styles.count}> {touched}</span>}
            </button>
          </Fragment>
        )
      })}
      <span className={styles.arrow}>⟲</span>
    </div>
  )
}
