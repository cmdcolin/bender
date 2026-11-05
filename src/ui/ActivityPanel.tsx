import { useState, type CSSProperties } from 'react'

import { activity, type ActivityLine } from './activity.ts'
import styles from './ActivityPanel.module.css'
import { ActivityTrace } from './ActivityTrace.tsx'
import { BendFlashes } from './BendFlashes.tsx'
import { useStoreValue } from './ControlsContext.ts'
import { Tip } from './Tip.tsx'
import { bendColor } from './trace.ts'

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })

export function ActivityPanel() {
  const { headline, lines } = useStoreValue(activity)
  const [folded, setFolded] = useState(false)
  const [closed, setClosed] = useState(false)
  return lines.length === 0 || closed ? null : (
    <section className={styles.panel} aria-label="script activity">
      <div className={styles.head}>
        <span key={headline} className={styles.headline}>
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
      {!folded && <Lines lines={lines} />}
    </section>
  )
}

function Lines({ lines }: { lines: readonly ActivityLine[] }) {
  const [shownFrom] = useState(() => (lines[0]?.id ?? 0) - 1)
  return (
    <ol className={styles.lines}>
      {lines.map(line => (
        <li
          key={line.id}
          className={line.id > shownFrom ? styles.fresh : styles.line}
          style={cssVars({
            '--flash': line.bends[0]
              ? bendColor(line.bends[0].key, lines, 0)
              : line.said
                ? 'var(--accent2)'
                : 'var(--fg4)',
          })}
        >
          <span className={styles.at}>{clock(line.at)}</span>
          <span className={line.said ? styles.said : styles.text}>
            {line.times > 1 ? `${line.text}  ×${line.times}` : line.text}
          </span>
        </li>
      ))}
    </ol>
  )
}
