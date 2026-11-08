import { useEffect } from 'react'

import { engine } from '../engine/engine.ts'
import { isTyping } from './isTyping.ts'
import { keyHeld, throwForKey } from './keymap.ts'
import { THROWS, type ThrowDef } from './throws.ts'

export const pressThrow = (t: ThrowDef) =>
  engine.holdThrow(t.name, t.push(engine.controls.get()))

export const releaseThrow = (t: ThrowDef) => engine.letGoThrow(t.name)

export function useThrowKeys() {
  useEffect(() => {
    const started = new Map<string, ThrowDef>()
    const releaseAll = () => {
      started.clear()
      for (const t of THROWS) releaseThrow(t)
    }
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      const t = throwForKey(e.key)
      if (t) {
        started.set(keyHeld(e), t)
        pressThrow(t)
      }
    }
    const up = (e: KeyboardEvent) => {
      const t = started.get(keyHeld(e))
      if (t) {
        started.delete(keyHeld(e))
        releaseThrow(t)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', releaseAll)
    }
  }, [])
}
