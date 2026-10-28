import type { Point } from './cablePaths.ts'
import type { PointerEvent as ReactPointerEvent } from 'react'

let swallow = false

const DRAG_FROM = 5

/** Carries a cable end with the pointer once it has moved far enough, hands
    `hold` null once it lets go, and hands the drop to `drop`. A press that
    never moved stays a click. */
export function follow(
  e: ReactPointerEvent,
  hold: (at: Point | null) => void,
  drop: (over: HTMLElement | null) => void,
) {
  if (e.button !== 0) return
  const x0 = e.clientX
  const y0 = e.clientY
  let moved = false
  const move = (m: PointerEvent) => {
    if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < DRAG_FROM) return
    const origin = document
      .querySelector('[data-gate-bench]')
      ?.getBoundingClientRect()
    if (!origin) return
    moved = true
    hold({ x: m.clientX - origin.left, y: m.clientY - origin.top })
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', escape)
  }
  const cancel = () => {
    stop()
    hold(null)
  }
  const escape = (k: KeyboardEvent) => {
    if (k.key === 'Escape') cancel()
  }
  const up = (m: PointerEvent) => {
    stop()
    if (!moved) return
    swallow = true
    setTimeout(() => {
      swallow = false
    }, 0)
    hold(null)
    drop(
      document
        .elementFromPoint(m.clientX, m.clientY)
        ?.closest<HTMLElement>('[data-gate-jack]') ?? null,
    )
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', escape)
}

/** False for the click a browser fires after a drag that ends where it began. */
export const pressIsClick = () => !swallow
