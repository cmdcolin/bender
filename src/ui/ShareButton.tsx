import { useEffect, useState } from 'react'

import { engine } from '../engine/engine.ts'
import styles from './App.module.css'
import { boardUrl } from './share.ts'
import { Tip } from './Tip.tsx'

const FLASH_MS = 1600

export function ShareButton() {
  const [said, setSaid] = useState<'copied ✓' | 'copy failed' | null>(null)
  useEffect(() => {
    if (!said) return undefined
    const id = setTimeout(() => setSaid(null), FLASH_MS)
    return () => clearTimeout(id)
  }, [said])
  return (
    <Tip text="Copies a link to this board. Whoever opens it gets every knob as you have it now.">
      <button
        className={said === 'copy failed' ? styles.btnBad : styles.btn}
        onClick={() => {
          navigator.clipboard
            .writeText(boardUrl(engine.controls.get()))
            .then(() => setSaid('copied ✓'))
            .catch(() => setSaid('copy failed'))
        }}
      >
        <span className={styles.holdsWidest}>
          <span className={styles.widest} aria-hidden>
            copy failed
          </span>
          <span>{said ?? 'share'}</span>
        </span>
      </button>
    </Tip>
  )
}
