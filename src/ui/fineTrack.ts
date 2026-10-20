import { useEffect, type RefObject } from 'react'

import { engine } from '../engine/engine.ts'
import { snapToStep, type SliderDef } from './controls/index.ts'
import { fromPos, toPos } from './slider-scale.ts'

const FINE = 0.1
const WHEEL_STEP = 0.01
const WHEEL_FINE_STEP = 0.002
const PAGE = 10
const KEY_DIR: Record<string, number> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
  PageUp: PAGE,
  PageDown: -PAGE,
}
const SCROLL_HOLD_MS = 400
const WHEEL_STEP_GAP_MS = 600

let lastScroll = 0
if (typeof document !== 'undefined')
  document.addEventListener('scroll', () => (lastScroll = performance.now()), {
    capture: true,
    passive: true,
  })

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

function nudge(def: SliderDef, pos: number, dir: number) {
  const now = engine.controls.get()[def.key]
  const next = snapToStep(def, fromPos(def, clamp01(pos)))
  if (next !== now || dir === 0) return next
  return snapToStep(def, now + dir * def.step)
}

/** Shift-drag moves the knob at a tenth of the hand's speed. The wheel and the
    arrow keys step it along its travel, finer with shift; the wheel holds off
    while the panel was scrolling a moment ago. */
export function useFineTrack(
  ref: RefObject<HTMLInputElement | null>,
  def: SliderDef,
  stops?: number,
) {
  useEffect(() => {
    const input = ref.current
    if (!input) return undefined
    let drag: { x: number; pos: number; width: number } | null = null
    let lastWheel = 0

    const down = (e: PointerEvent) => {
      if (!e.shiftKey) return
      e.preventDefault()
      input.setPointerCapture(e.pointerId)
      engine.armStep()
      drag = {
        x: e.clientX,
        pos: toPos(def, engine.controls.get()[def.key]),
        width: input.getBoundingClientRect().width || 1,
      }
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const pos = drag.pos + (dx / drag.width) * FINE
      engine.set(def.key, nudge(def, pos, 0))
    }
    const up = () => (drag = null)
    const wheel = (e: WheelEvent) => {
      const now = performance.now()
      if (now - lastScroll < SCROLL_HOLD_MS) return
      const delta = e.deltaY || e.deltaX
      if (!delta) return
      e.preventDefault()
      if (now - lastWheel > WHEEL_STEP_GAP_MS) engine.armStep()
      lastWheel = now
      step(delta < 0 ? 1 : -1, e.shiftKey)
    }
    const key = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key]
      if (!dir || e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      if (!e.repeat) engine.armStep()
      step(dir, e.shiftKey)
    }
    const step = (dir: number, fine: boolean) => {
      const by = stops ? 1 / stops : fine ? WHEEL_FINE_STEP : WHEEL_STEP
      const pos = toPos(def, engine.controls.get()[def.key]) + dir * by
      engine.set(def.key, nudge(def, pos, Math.sign(dir)))
    }

    input.addEventListener('pointerdown', down)
    input.addEventListener('pointermove', move)
    input.addEventListener('pointerup', up)
    input.addEventListener('pointercancel', up)
    input.addEventListener('wheel', wheel, { passive: false })
    input.addEventListener('keydown', key)
    return () => {
      input.removeEventListener('keydown', key)
      input.removeEventListener('pointerdown', down)
      input.removeEventListener('pointermove', move)
      input.removeEventListener('pointerup', up)
      input.removeEventListener('pointercancel', up)
      input.removeEventListener('wheel', wheel)
    }
  }, [ref, def, stops])
}
