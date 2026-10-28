import type { Point } from './cablePaths.ts'
import type { PointerEvent as ReactPointerEvent } from 'react'

let swallow = false

const DRAG_FROM = 5

const swallowClick = () => {
  swallow = true
  setTimeout(() => {
    swallow = false
  }, 0)
}

/** Carries a cable end with the pointer once it has moved far enough, hands
    `hold` null once it lets go, and hands the drop to `drop`. A press that
    never moved stays a click, unless Escape cancelled it. */
export function follow(
  e: ReactPointerEvent,
  hold: (at: Point | null) => void,
  drop: (over: HTMLElement | null) => void,
) {
  if (e.button !== 0) return
  const origin = e.currentTarget
    .closest('[data-gate-bench]')
    ?.getBoundingClientRect()
  if (!origin) return
  const id = e.pointerId
  const x0 = e.clientX
  const y0 = e.clientY
  let moved = false
  let cancelled = false
  const move = (m: PointerEvent) => {
    if (m.pointerId !== id) return
    if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < DRAG_FROM) return
    moved = true
    hold({ x: m.clientX - origin.left, y: m.clientY - origin.top })
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', escape)
  }
  const cancel = (m: PointerEvent) => {
    if (m.pointerId !== id) return
    stop()
    hold(null)
  }
  const escape = (k: KeyboardEvent) => {
    if (k.key !== 'Escape') return
    cancelled = true
    window.removeEventListener('pointermove', move)
    window.removeEventListener('keydown', escape)
    hold(null)
  }
  const up = (m: PointerEvent) => {
    if (m.pointerId !== id) return
    stop()
    if (cancelled) {
      swallowClick()
      return
    }
    if (!moved) return
    swallowClick()
    hold(null)
    drop(
      document
        .elementFromPoint(m.clientX, m.clientY)
        ?.closest<HTMLElement>('[data-jack]') ?? null,
    )
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', escape)
}

/** False for the click a browser fires after a drag, or after a press that
    Escape cancelled. */
export const pressIsClick = () => !swallow
