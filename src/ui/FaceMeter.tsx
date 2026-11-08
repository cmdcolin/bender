import { useEffect, useRef } from 'react'

import { engine } from '../engine/engine.ts'
import { MACHINES } from '../machines.ts'
import styles from './FaceMeter.module.css'
import { FALL, position, SILENT } from './meterScale.ts'

const HOLD_MS = 1000
const CLIP = 1

export function FaceMeter({ stage }: { stage: string }) {
  const tap = MACHINES.findIndex(m => m.name === stage)
  return tap < 0 ? null : <Bar stage={stage} tap={tap} />
}

function Bar({ stage, tap }: { stage: string; tap: number }) {
  const track = useRef<HTMLSpanElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const tick = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const [t, f, p] = [track.current, fill.current, tick.current]
    return t && f && p ? watchLevel(tap, t, f, p) : undefined
  }, [tap])
  return (
    <span
      ref={track}
      className={styles.meter}
      data-meter={stage}
      aria-hidden="true"
    >
      <span ref={fill} className={styles.fill} />
      <span ref={tick} className={styles.peak} />
    </span>
  )
}

function watchLevel(
  tap: number,
  track: HTMLElement,
  fill: HTMLElement,
  tick: HTMLElement,
) {
  let raf = 0
  let held = 0
  let peak = 0
  let peakAt = 0
  let filled = ''
  let ticked = ''

  const draw = (now: number) => {
    raf = 0
    const level = engine.meter.get().taps[tap] ?? 0
    const fell = held * FALL
    held = Math.max(level, fell < SILENT ? 0 : fell)
    if (held >= peak) {
      peak = held
      peakAt = now
    } else if (now - peakAt > HOLD_MS) {
      const dropped = peak * FALL
      peak = Math.max(held, dropped < SILENT ? 0 : dropped)
    }
    if (level >= CLIP) track.toggleAttribute('data-clipped', true)

    const height = `scaleY(${position(held).toFixed(3)})`
    if (filled !== height) {
      filled = height
      fill.style.transform = height
    }
    const at = `translateY(${((1 - position(peak)) * 100).toFixed(1)}%)`
    if (ticked !== at) {
      ticked = at
      tick.style.transform = at
    }
    if (peak > 0) schedule()
  }

  const schedule = () => {
    if (raf === 0) raf = requestAnimationFrame(draw)
  }
  const clear = () => track.toggleAttribute('data-clipped', false)
  const press = track.closest('button') ?? track
  press.addEventListener('click', clear)
  const off = engine.meter.subscribe(() => {
    if ((engine.meter.get().taps[tap] ?? 0) > 0) schedule()
  })
  schedule()
  return () => {
    off()
    press.removeEventListener('click', clear)
    cancelAnimationFrame(raf)
  }
}
