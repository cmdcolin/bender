import { Faceplate } from './Faceplate.tsx'
import { faceSpot } from './faceSpot.ts'
import styles from './SheetFace.module.css'
import { StrikeRings } from './StrikeRings.tsx'
import { strike } from './strikes.ts'

import type { KeyboardEvent, PointerEvent } from 'react'

const W = 120
const H = 90
const PICKUPS = [
  [0.31 / 1.2, 0.17 / 0.9],
  [0.83 / 1.2, 0.64 / 0.9],
] as const

function onPointerDown(e: PointerEvent<SVGSVGElement>) {
  const { x, y } = faceSpot(e.currentTarget, e.clientX, e.clientY, W, H)
  strike('sheet', x, y)
}

function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    strike('sheet')
  }
}

export function SheetFace({
  seconds,
  onClose,
}: {
  seconds?: number
  onClose?: () => void
}) {
  return (
    <Faceplate stage="Sheet" seconds={seconds} onClose={onClose}>
      <svg
        className={styles.sheet}
        viewBox={`0 0 ${W} ${H}`}
        role="button"
        tabIndex={0}
        aria-label="hit the sheet"
        onPointerDown={onPointerDown}
        onMouseDown={e => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        <rect
          className={styles.plate}
          x={0.5}
          y={0.5}
          width={W - 1}
          height={H - 1}
          rx={1.5}
        />
        {PICKUPS.map(([x, y]) => (
          <circle
            key={x}
            className={styles.pickup}
            cx={x * W}
            cy={y * H}
            r={2.4}
          />
        ))}
        <StrikeRings
          target="sheet"
          width={W}
          height={H}
          r={9}
          className={styles.ring}
        />
      </svg>
    </Faceplate>
  )
}
