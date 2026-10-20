import { useRef, useState } from 'react'

import { aimAt } from './reveal.ts'
import styles from './SettingFind.module.css'
import { findSettings } from './settingSearch.ts'

import type { Group } from './controls/types.ts'

const SHOWN = 8

export function SettingFind({
  groups,
  open,
  onOpen,
}: {
  groups: readonly Group[]
  open: string | null
  onOpen: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const hits = findSettings(groups, query)
  return (
    <div className={styles.find} ref={root}>
      <input
        className={styles.field}
        type="search"
        aria-label="find a setting"
        placeholder="find a setting: level, cutoff, data line…"
        value={query}
        onChange={e => setQuery(e.currentTarget.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') setQuery('')
          e.stopPropagation()
        }}
      />
      {query.trim() && (
        <div className={styles.hits}>
          {hits.slice(0, SHOWN).map(h => (
            <button
              key={h.key}
              className={styles.hit}
              onClick={() => {
                if (open !== h.stage) onOpen(h.stage)
                aimAt(h.key, root.current)
                setQuery('')
              }}
            >
              {h.label}
              <span className={styles.stage}>{h.stage}</span>
            </button>
          ))}
          {hits.length > SHOWN && (
            <span className={styles.note}>
              {`${hits.length - SHOWN} more, add a word`}
            </span>
          )}
          {hits.length === 0 && (
            <span className={styles.note}>
              nothing on the board by that name
            </span>
          )}
        </div>
      )}
    </div>
  )
}
