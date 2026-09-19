import { useEffect } from 'react'

import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { isTyping } from './isTyping'
import { THROWS, throwForKey, type ThrowDef } from './throws'
import styles from './Throws.module.css'
import { Tip } from './Tip'

const press = (t: ThrowDef) =>
  engine.holdThrow(t.name, t.push(engine.controls.get()))

const releaseAll = () => {
  for (const t of THROWS) engine.letGoThrow(t.name)
}

export function Throws() {
  const held = useStoreValue(engine.held)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      const t = throwForKey(e.key)
      if (t) press(t)
    }
    const up = (e: KeyboardEvent) => {
      const t = throwForKey(e.key)
      if (t) engine.letGoThrow(t.name)
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

  return (
    <div className={styles.row}>
      <span className={styles.label}>hold</span>
      {THROWS.map(t => (
        <Tip key={t.name} text={`${t.blurb}, while held.`}>
          <button
            className={held.has(t.name) ? styles.padOn : styles.pad}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              press(t)
            }}
            onPointerUp={() => engine.letGoThrow(t.name)}
            onPointerCancel={() => engine.letGoThrow(t.name)}
            onLostPointerCapture={() => engine.letGoThrow(t.name)}
          >
            {t.name}
            <span className={styles.key}>{t.key}</span>
          </button>
        </Tip>
      ))}
    </div>
  )
}
