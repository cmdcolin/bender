import { useEffect } from 'react'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import styles from './HuntDialog.module.css'

// How long the landed note stays up on its own. Long enough to read at a
// glance, short enough that a modal is never what stands between you and the
// board it just landed.
const LANDED_MS = 6000

// What a hunt looks like while it runs. Every other roll on the panel lands a
// board and is over; this one cuts to six strangers in a row, and without
// something saying so the board sounds like it is being played by somebody
// else. So the panel says what it is doing, which candidate it is on, and how
// to call it off.
//
// A real modal: the hunt owns the board for the eight seconds it runs, and a
// slider moved underneath would cancel it — the engine's rule — which from the
// outside looks like the dialog lied about what was happening. The way out is
// the button or escape, and both keep whatever is playing.
export function HuntDialog(props: { landed: boolean; onDismiss: () => void }) {
  const hunting = useStoreValue(engine.hunting)
  const step = useStoreValue(engine.huntStep)
  const { landed, onDismiss } = props

  useEffect(() => {
    if (!landed) return
    const t = setTimeout(onDismiss, LANDED_MS)
    return () => clearTimeout(t)
  }, [landed, onDismiss])

  if (!hunting && !landed) return null

  // Escape asks the browser to close it. The hunt has to hear that rather than
  // the element quietly closing under a component that still thinks it is open,
  // so the cancel is taken here and this unmounts on the state that follows.
  const close = () => {
    if (hunting) engine.stopHunt()
    else onDismiss()
  }

  return (
    <dialog
      // Opened from the ref rather than an effect: showModal on the frame it
      // mounts, and guarded because a ref that fires twice on an open dialog
      // throws.
      ref={el => {
        if (el && !el.open) el.showModal()
      }}
      onCancel={e => {
        e.preventDefault()
        close()
      }}
      aria-label="hunt an edge"
      className={styles.card}
    >
      {hunting ? (
        <>
          <div className={styles.head}>
            <span className={styles.title}>hunting an edge</span>
            <span className={styles.count} aria-live="polite">
              {step ? `board ${step.board} of ${step.of}` : 'rolling'}
            </span>
          </div>
          <div className={styles.pips} aria-hidden="true">
            {Array.from({ length: step?.of ?? 0 }, (_, i) => (
              <span
                key={i}
                className={i < (step?.board ?? 0) ? styles.pipOn : styles.pip}
              />
            ))}
          </div>
          <p className={styles.line}>
            {step?.of ?? 6} rolled boards, played one after another for a second
            and a half each. What you are hearing is the audition, not a fault.
          </p>
          <p className={styles.line}>
            The limiter is the judge. It keeps whichever board kept arriving at
            the ceiling and backing off — the edge of running away — rather than
            the loudest or the most broken.
          </p>
          <p className={styles.line}>
            Stop here and it keeps what is playing. Either way the whole hunt is
            one step in the walk, so undo puts back the board you started from.
          </p>
          <div className={styles.row}>
            <button className={styles.btn} autoFocus onClick={close}>
              stop and keep this one
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.head}>
            <span className={styles.title}>hunt landed</span>
          </div>
          <p className={styles.line}>
            It kept the board that came nearest the edge. Undo puts back the one
            you were on before it started.
          </p>
          <div className={styles.row}>
            <button className={styles.btn} autoFocus onClick={onDismiss}>
              close
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
