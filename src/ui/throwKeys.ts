import { useEffect } from 'react'

import { engine } from '../engine/engine.ts'
import { isTyping } from './isTyping.ts'
import { THROWS, throwForKey, type ThrowDef } from './throws.ts'

export const pressThrow = (t: ThrowDef) =>
  engine.holdThrow(t.name, t.push(engine.controls.get()))

export const releaseThrow = (t: ThrowDef) => engine.letGoThrow(t.name)

const releaseAll = () => {
  for (const t of THROWS) releaseThrow(t)
}

/** The bottom row of letters holds the six throws, whatever the rest of the
    letters are doing. */
export function useThrowKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      const t = throwForKey(e.key)
      if (t) pressThrow(t)
    }
    const up = (e: KeyboardEvent) => {
      const t = throwForKey(e.key)
      if (t) releaseThrow(t)
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
