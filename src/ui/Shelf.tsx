import { putBack, putBackTitle, useTouchedCount } from './rollBack.ts'
import styles from './Shelf.module.css'
import { Tip } from './Tip.tsx'

import type { Group } from './controls/index.ts'

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
            {touched} ↺
          </button>
        </Tip>
      )}
    </span>
  )
}

export function PathHint() {
  return (
    <p className={styles.hint}>
      Click a stage for its controls. A dot marks a stage with moved controls.
    </p>
  )
}
