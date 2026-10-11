import { useRef } from 'react'

import type { PointerEvent } from 'react'

const HOLD_MS = 160
const SWIPE_PX = 40

interface Gesture {
  id: number
  x: number
  y: number
  timer: number
  kind: 'pending' | 'bend' | 'swipe'
}

type Point = { x: number; y: number }

// What a finger does on the stage: a quick sideways swipe steps the preset, and
// a press held still for a moment becomes a bend that follows the finger until
// it lifts. Positions go out as 0..1 across and 0..1 up.
export function useGestures(opts: {
  onSwipe: (dir: 1 | -1) => void
  onBend: (at: Point) => void
  onLift: () => void
}) {
  const gesture = useRef<Gesture | null>(null)
  const box = useRef<DOMRect | null>(null)

  const place = (e: PointerEvent): Point => {
    const r = box.current!
    return {
      x: (e.clientX - r.left) / r.width,
      y: 1 - (e.clientY - r.top) / r.height,
    }
  }

  const press = (e: PointerEvent<HTMLElement>) => {
    if (gesture.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    box.current = e.currentTarget.getBoundingClientRect()
    const at = place(e)
    const timer = window.setTimeout(() => {
      const g = gesture.current
      if (g === null || g.kind !== 'pending') return
      g.kind = 'bend'
      opts.onBend(at)
    }, HOLD_MS)
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      timer,
      kind: 'pending',
    }
  }

  const drag = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (g === null || g.id !== e.pointerId) return
    if (g.kind === 'bend') {
      opts.onBend(place(e))
      return
    }
    if (g.kind !== 'pending') return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      window.clearTimeout(g.timer)
      g.kind = 'swipe'
      opts.onSwipe(dx < 0 ? 1 : -1)
    } else if (Math.hypot(dx, dy) > SWIPE_PX) {
      window.clearTimeout(g.timer)
      g.kind = 'bend'
      opts.onBend(place(e))
    }
  }

  const release = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (g === null || g.id !== e.pointerId) return
    window.clearTimeout(g.timer)
    gesture.current = null
    if (g.kind === 'bend') opts.onLift()
  }

  return { press, drag, release }
}
