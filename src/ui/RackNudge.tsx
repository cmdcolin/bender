import styles from './SlotRack.module.css'

export function RackNudge({
  name,
  at,
  count,
  onMove,
}: {
  name: string
  at: number
  count: number
  onMove: (to: number) => void
}) {
  return (
    <span className={styles.nudge}>
      <button
        type="button"
        tabIndex={-1}
        className={styles.arrow}
        aria-label={`move ${name} up`}
        disabled={at === 0}
        onClick={() => onMove(at - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        tabIndex={-1}
        className={styles.arrow}
        aria-label={`move ${name} down`}
        disabled={at === count - 1}
        onClick={() => onMove(at + 1)}
      >
        ↓
      </button>
    </span>
  )
}
