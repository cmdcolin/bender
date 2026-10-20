import styles from './Fold.module.css'

import type { ReactNode } from 'react'

export function Fold({
  name,
  badge,
  startOpen,
  open,
  onToggle,
  children,
}: {
  name: string
  badge?: string
  startOpen: boolean
  open?: boolean
  onToggle?: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <details
      className={styles.fold}
      open={open ?? startOpen}
      onToggle={onToggle ? e => onToggle(e.currentTarget.open) : undefined}
    >
      <summary className={styles.head}>
        {name}
        {badge && <span className={styles.moved}>{badge}</span>}
      </summary>
      {children}
    </details>
  )
}
