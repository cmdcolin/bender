import styles from './Fold.module.css'

import type { ReactNode } from 'react'

// A <details>, which is what a fold is: the browser draws the caret, works the
// keyboard, and owns which way the fold is sitting once it has been handed a way
// to start. Nothing here tracks that — a fold is the one piece of the panel that
// is about the panel rather than about the board.
export function Fold({
  name,
  badge,
  moved = false,
  startOpen,
  open,
  onToggle,
  children,
}: {
  name: string
  badge: string
  moved?: boolean
  startOpen: boolean
  /** Whoever else can open the fold — a lane naming its strip — holds the
      state and hands it down; everyone else leaves both of these out. */
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
        <span className={moved ? styles.moved : styles.count}>{badge}</span>
      </summary>
      {children}
    </details>
  )
}
