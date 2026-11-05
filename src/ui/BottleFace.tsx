import styles from './BottleFace.module.css'
import { useBoardValue } from './ControlsContext.ts'
import { Faceplate } from './Faceplate.tsx'
import { faceSpot } from './faceSpot.ts'
import { StrikeRings } from './StrikeRings.tsx'
import { strike } from './strikes.ts'

import type { KeyboardEvent, PointerEvent } from 'react'

const W = 60
const H = 120
const SHOULDER = 36
const BASE = H - 2
const GLASS = `M 25 2 H 35 V 26 C 35 32 54 ${SHOULDER - 2} 54 ${SHOULDER + 8} V ${BASE - 3} Q 54 ${BASE} 50 ${BASE} H 10 Q 6 ${BASE} 6 ${BASE - 3} V ${SHOULDER + 8} C 6 ${SHOULDER - 2} 25 32 25 26 Z`

function onPointerDown(e: PointerEvent<SVGPathElement>) {
  const svg = e.currentTarget.ownerSVGElement
  if (svg) {
    const { x, y } = faceSpot(svg, e.clientX, e.clientY, W, H)
    strike('bottle', x, y)
  }
}

function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    strike('bottle')
  }
}

export function BottleFace({
  seconds,
  onClose,
}: {
  seconds?: number
  onClose?: () => void
}) {
  const fill = useBoardValue(c => c.bottleFill)
  const water = (BASE - SHOULDER - 8) * fill
  return (
    <Faceplate stage="Bottle" seconds={seconds} onClose={onClose}>
      <svg
        className={styles.bottle}
        viewBox={`0 0 ${W} ${H}`}
        role="button"
        tabIndex={0}
        aria-label="tap the bottle"
        onKeyDown={onKeyDown}
        onMouseDown={e => e.preventDefault()}
      >
        <clipPath id="bottle-glass">
          <path d={GLASS} />
        </clipPath>
        <rect
          className={styles.water}
          x={0}
          y={BASE - water}
          width={W}
          height={water}
          clipPath="url(#bottle-glass)"
        />
        <path
          className={styles.glass}
          d={GLASS}
          onPointerDown={onPointerDown}
        />
        <rect
          className={styles.pickup}
          x={26}
          y={86}
          width={8}
          height={5}
          rx={1}
        />
        <StrikeRings
          target="bottle"
          width={W}
          height={H}
          r={7}
          className={styles.ring}
        />
      </svg>
    </Faceplate>
  )
}
