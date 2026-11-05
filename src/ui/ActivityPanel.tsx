import { useState } from 'react'

import { activity } from './activity.ts'
import styles from './ActivityPanel.module.css'
import { ActivityTrace } from './ActivityTrace.tsx'
import { BendFlashes } from './BendFlashes.tsx'
import { useStoreValue } from './ControlsContext.ts'
import { Tip } from './Tip.tsx'

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })

export function ActivityPanel() {
  const { headline, lines } = useStoreValue(activity)
  const [folded, setFolded] = useState(false)
  const [closed, setClosed] = useState(false)
  return lines.length === 0 || closed ? null : (
    <section className={styles.panel} aria-label="script activity">
      <div className={styles.head}>
        <span className={styles.headline}>
          {headline === '' ? 'window.bender' : headline}
        </span>
        <Tip
          text={
            folded
              ? 'Shows the calls the script made, newest first.'
              : 'Folds the calls away and keeps the headline and the trace.'
          }
        >
          <button
            className={styles.btn}
            aria-label={folded ? 'show the calls' : 'fold the calls'}
            aria-expanded={!folded}
            onClick={() => setFolded(f => !f)}
          >
            {folded ? '▴' : '▾'}
          </button>
        </Tip>
        <Tip text="Hides this until the page reloads.">
          <button
            className={styles.btn}
            aria-label="close the activity"
            onClick={() => setClosed(true)}
          >
            ×
          </button>
        </Tip>
      </div>
      <ActivityTrace />
      <BendFlashes />
      {!folded && (
        <ol className={styles.lines}>
          {lines.map(line => (
            <li key={line.id} className={styles.line}>
              <span className={styles.at}>{clock(line.at)}</span>
              <span className={line.said ? styles.said : styles.text}>
                {line.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
