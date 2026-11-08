import { useEffect, useState } from 'react'

import { engine } from '../engine/engine.ts'
import dlg from './components/dialog.module.css'
import { Dialog } from './components/Dialog.tsx'
import { useStoreValue } from './ControlsContext.ts'
import styles from './HuntDialog.module.css'

const LANDED_MS = 6000

export function HuntDialog(props: { landed: boolean; onDismiss: () => void }) {
  const hunting = useStoreValue(engine.hunting)
  const step = useStoreValue(engine.huntStep)
  const hunted = useStoreValue(engine.hunted)
  const [pick, setPick] = useState({ of: hunted, i: 0 })
  const picked = pick.of === hunted ? pick.i : 0
  const { landed, onDismiss } = props

  const tray = hunted.length > 1
  useEffect(() => {
    if (!landed || tray) return undefined
    const t = setTimeout(onDismiss, LANDED_MS)
    return () => clearTimeout(t)
  }, [landed, onDismiss, tray])

  if (!hunting && !landed) return null

  const close = () => {
    if (hunting) engine.stopHunt()
    else onDismiss()
  }

  return (
    <Dialog label="hunt an edge" size="prose" loud onCancel={close}>
      {hunting ? (
        <>
          <div className={dlg.head}>
            <span className={dlg.title}>hunting an edge</span>
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
          <p className={dlg.line}>
            {step?.of ?? 6} rolled boards, played one after another for a second
            and a half each. What you are hearing is the audition, not a fault.
          </p>
          <p className={dlg.line}>
            The limiter is the judge. It keeps whichever board kept arriving at
            the ceiling and backing off — the edge of running away — rather than
            the loudest or the most broken.
          </p>
          <p className={dlg.line}>
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
          <div className={dlg.head}>
            <span className={dlg.title}>hunt landed</span>
          </div>
          <p className={dlg.line}>
            It kept the best board. Undo puts back the one you were on before it
            started.
          </p>
          {tray && (
            <div className={styles.tray}>
              {hunted.map((_, i) => (
                <button
                  key={i}
                  className={i === picked ? styles.pickOn : styles.pick}
                  aria-label={`candidate ${i + 1}`}
                  onClick={() => {
                    engine.pickHunted(i)
                    setPick({ of: hunted, i })
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className={styles.row}>
            <button className={styles.btn} autoFocus onClick={onDismiss}>
              close
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
