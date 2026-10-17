import { useRef, useState } from 'react'

import { POOLS } from '../engine/archive.ts'
import { engine } from '../engine/engine.ts'
import styles from './TapeShelf.module.css'
import { Tip } from './Tip.tsx'
import { ToggleButtonGroup } from './ToggleButtonGroup.tsx'

const MODES = ['random', 'search'] as const
type Mode = (typeof MODES)[number]
type Hits = { id: string; title: string }[] | 'searching' | 'none'

// Where a tape comes from: a roll off one of the shelves, or a search of
// archive.org by whatever you type. Picking a tape closes the shelf; the sampler
// box shows the progress from there.
export function TapeShelf({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('random')
  const [pool, setPool] = useState(0)
  const [typed, setTyped] = useState('')
  const [hits, setHits] = useState<Hits | null>(null)
  const latest = useRef(0)

  const search = async () => {
    if (!typed.trim()) return
    const mine = ++latest.current
    setHits('searching')
    const found = await engine.searchArchive(typed)
    if (mine === latest.current) setHits(found.length ? found : 'none')
  }

  const pick = (item: { id: string; title: string }) => {
    void engine.loadArchive(item)
    onDone()
  }

  return (
    <div className={styles.shelf}>
      <div className={styles.row}>
        <ToggleButtonGroup
          label="where the tape comes from"
          options={MODES}
          value={mode}
          onChange={setMode}
        />
        <div className={styles.source}>
          {mode === 'random' ? (
            <>
              <Tip text={POOLS[pool]!.blurb}>
                <select
                  className={styles.pool}
                  aria-label="the shelf the tape comes from"
                  value={pool}
                  onChange={e => setPool(Number(e.target.value))}
                >
                  {POOLS.map((p, i) => (
                    <option key={p.label} value={i}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Tip>
              <Tip text="Pulls a random tape off archive.org from the shelf beside it.">
                <button
                  className={styles.go}
                  onClick={() => {
                    void engine.rollSample(POOLS[pool]!)
                    onDone()
                  }}
                >
                  ⚄ roll
                </button>
              </Tip>
            </>
          ) : (
            <>
              <input
                className={styles.query}
                type="text"
                value={typed}
                placeholder="search archive.org…"
                aria-label="search archive.org for a tape"
                autoFocus
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void search()
                }}
              />
              <button className={styles.go} onClick={() => void search()}>
                search
              </button>
            </>
          )}
        </div>
      </div>
      {mode === 'search' && hits === 'searching' && (
        <p className={styles.note}>searching…</p>
      )}
      {mode === 'search' && hits === 'none' && (
        <p className={styles.note}>nothing on archive.org for that</p>
      )}
      {mode === 'search' && Array.isArray(hits) && (
        <ul className={styles.hits}>
          {hits.map(h => (
            <li key={h.id}>
              <button
                className={styles.hit}
                title={h.title}
                onClick={() => pick(h)}
              >
                {h.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
