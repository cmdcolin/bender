import { useEffect, useRef } from 'react'

import { engine } from '../engine/engine.ts'
import { MACHINES } from '../machines.ts'
import styles from './FaceMeter.module.css'
import { FALL, HOT, position, SILENT } from './meterScale.ts'

export function FaceMeter({ stage }: { stage: string }) {
  const tap = MACHINES.findIndex(m => m.name === stage)
  return tap < 0 ? null : <Bar stage={stage} tap={tap} />
}

function Bar({ stage, tap }: { stage: string; tap: number }) {
  const fill = useRef<HTMLSpanElement>(null)
  useEffect(() => watchLevel(tap, fill.current), [tap])
  return (
    <span className={styles.meter} data-meter={stage} aria-hidden="true">
      <span ref={fill} className={styles.fill} />
    </span>
  )
}

function watchLevel(tap: number, fill: HTMLSpanElement | null) {
  let raf = 0
  let held = 0
  let painted = ''
  let lit = ''

  const draw = () => {
    raf = 0
    const fell = held * FALL
    held = Math.max(engine.meter.get().taps[tap] ?? 0, fell < SILENT ? 0 : fell)
    const pos = position(held)
    const height = `scaleY(${pos.toFixed(3)})`
    const colour = pos > HOT ? 'var(--alarm)' : 'var(--accent)'
    if (fill && painted !== height) {
      painted = height
      fill.style.transform = height
    }
    if (fill && lit !== colour) {
      lit = colour
      fill.style.background = colour
    }
    if (held > 0) schedule()
  }

  const schedule = () => {
    if (raf === 0) raf = requestAnimationFrame(draw)
  }
  const off = engine.meter.subscribe(() => {
    if ((engine.meter.get().taps[tap] ?? 0) > 0) schedule()
  })
  schedule()
  return () => {
    off()
    cancelAnimationFrame(raf)
  }
}
