import styles from './App.module.css'
import { Tip } from './Tip.tsx'
import { useFlash } from './useFlash.ts'

const FLASH_MS = 1600

export function ShareButton({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const { shown: said, flash: say } = useFlash<'copied ✓' | 'failed ✕'>(
    FLASH_MS,
  )
  return (
    <Tip text="Copies a link to this board. Whoever opens it gets every knob as you have it now.">
      <button
        className={`${said === 'failed ✕' ? styles.btnBad : styles.btn} ${styles.share}`}
        onClick={() =>
          void onCopy().then(ok => say(ok ? 'copied ✓' : 'failed ✕'))
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
