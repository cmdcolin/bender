import styles from './FaceBadge.module.css'
import { Tip } from './Tip.tsx'

import type { ReactNode } from 'react'

/** A face's name plate, which opens the face's stage in the panel. */
export function FaceBadge({
  className,
  stage,
  onOpen,
  children,
}: {
  className?: string
  stage?: string
  onOpen?: (stage: string) => void
  children: ReactNode
}) {
  if (!stage || !onOpen) return <span className={className}>{children}</span>
  return (
    <Tip text={`Opens the ${stage} settings in the panel.`}>
      <button
        className={`${styles.open} ${className ?? ''}`}
        aria-label={`${stage} settings`}
        onClick={() => onOpen(stage)}
      >
        {children}
      </button>
    </Tip>
  )
}
