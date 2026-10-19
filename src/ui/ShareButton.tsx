import { useEffect, useState } from 'react'

import styles from './App.module.css'
import { Tip } from './Tip.tsx'

const FLASH_MS = 1600

export function ShareButton({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const [said, setSaid] = useState<'copied ✓' | 'failed ✕' | null>(null)
  useEffect(() => {
    if (!said) return undefined
    const id = setTimeout(() => setSaid(null), FLASH_MS)
    return () => clearTimeout(id)
  }, [said])
  return (
    <Tip text="Copies a link to this board. Whoever opens it gets every knob as you have it now.">
      <button
        className={said === 'failed ✕' ? styles.btnBad : styles.btn}
        onClick={() =>
          void onCopy().then(ok => setSaid(ok ? 'copied ✓' : 'failed ✕'))
        }
      >
        <span className={styles.holdsWidest}>
          <span className={styles.widest} aria-hidden>
            copied ✓
          </span>
          <span>{said ?? 'share'}</span>
        </span>
      </button>
    </Tip>
  )
}
