import { DeviceVerbs } from './DeviceVerbs.tsx'
import styles from './Faceplate.module.css'

import type { ReactNode } from 'react'

/** A bench face for an instrument with no case of its own: a plate with the
    stage's name engraved on it and the caps every instrument wears. */
export function Faceplate({
  stage,
  seconds,
  onClose,
  children,
}: {
  stage: string
  seconds?: number
  onClose?: () => void
  children: ReactNode
}) {
  const name = stage.toLowerCase()
  return (
    <section className={styles.face} aria-label={name}>
      <div className={styles.head}>
        <span className={styles.label}>{name}</span>
        <DeviceVerbs stage={stage} seconds={seconds} onClose={onClose} />
      </div>
      {children}
    </section>
  )
}
