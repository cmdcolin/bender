import styles from './Fold.module.css'

import type { ReactNode } from 'react'

export function Fold({
  name,
  badge,
  open,
  onToggle,
  children,
}: {
  name: string
  badge?: string
  open: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <details
      className={styles.fold}
      open={open}
      onToggle={e => onToggle(e.currentTarget.open)}
    >
      <summary className={styles.head}>
        {name}
        {badge && <span className={styles.moved}>{badge}</span>}
      </summary>
      {children}
    </details>
  )
}
