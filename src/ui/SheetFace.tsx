import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { Faceplate } from './Faceplate.tsx'
import styles from './SheetFace.module.css'

import type { KeyboardEvent, PointerEvent } from 'react'

const W = 120
const H = 90
const PICKUPS = [
  [0.31 / 1.2, 0.17 / 0.9],
  [0.83 / 1.2, 0.64 / 0.9],
] as const

interface Mark {
  id: number
  x: number
  y: number
}

let nextMark = 0

export function SheetFace({
  seconds,
  onClose,
}: {
  seconds?: number
  onClose?: () => void
}) {
  const [marks, setMarks] = useState<Mark[]>([])
  const hit = (x: number, y: number) => {
    engine.sheetHit(x, y, 1)
    setMarks(m => [...m.slice(-5), { id: nextMark++, x, y }])
  }
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    hit((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height)
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      hit(0.5, 0.5)
    }
  }
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
        {marks.map(m => (
          <circle
            key={m.id}
            className={styles.ring}
            cx={m.x * W}
            cy={m.y * H}
            r={9}
            onAnimationEnd={() =>
              setMarks(all => all.filter(o => o.id !== m.id))
            }
          />
        ))}
      </svg>
    </Faceplate>
  )
}
