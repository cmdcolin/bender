import { useState, type ReactNode } from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { useStoreValue } from './ControlsContext'
import { engine } from '../engine/engine'
import type { Group } from './controls'
import { ControlSlider } from './Slider'
import styles from './Section.module.css'

function useTouchedCount(group: Group): number {
  const controls = useStoreValue(engine.controls)
  return group.sliders.filter(s => controls[s.key] !== DEFAULT_CONTROLS[s.key]).length
}

export function GroupSection({ group, defaultOpen }: { group: Group; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const touched = useTouchedCount(group)
  return (
    <div className={styles.section} id={`group-${group.name.replace(/\W+/g, '-')}`}>
      <button className={styles.header} onClick={() => setOpen(o => !o)}>
        <span className={styles.arrow}>{open ? '▾' : '▸'}</span>
        <span className={styles.title}>{group.name}</span>
        {touched > 0 && <span className={styles.count}>• {touched}</span>}
      </button>
      {open && (
        <div className={styles.body}>
          {group.sliders.map(def => (
            <ControlSlider key={def.key} def={def} />
          ))}
        </div>
      )}
    </div>
  )
}

export function StageHeading({ children }: { children: ReactNode }) {
  return <div className={styles.stage}>{children}</div>
}
