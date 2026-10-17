import { useRef, useState, type CSSProperties } from 'react'

import { POOLS, type Pool } from '../engine/archive.ts'
import { engine } from '../engine/engine.ts'
import { DeckKey } from './DeckKey.tsx'
import { Menu } from './Menu.tsx'
import styles from './TapeShelf.module.css'
import { Tip } from './Tip.tsx'

type Hits = { id: string; title: string }[] | 'searching' | 'none'

const STRIPES = [
  'var(--accent)',
  'var(--accent2)',
  'var(--cool)',
  'var(--fg3)',
  'var(--border-hover)',
]

const stripe = (i: number): CSSProperties => {
  const vars: Record<`--${string}`, string> = {
    '--stripe': STRIPES[i % STRIPES.length]!,
  }
  return vars
}

const ANY = {
  label: 'surprise me',
  blurb: 'a random tape off any of the shelves',
}

// Where a tape comes from: a drawer of cassettes, one a shelf of archive.org,
// and a search of archive.org under it. Pressing a cassette pulls a random tape
// off its shelf. It opens over the panel rather than in the tape loop box, so
// choosing where a tape comes from never moves the controls below it. Picking a
// tape closes the drawer; the box shows the progress from there.
export function TapeShelf({
  anchor,
  onDone,
}: {
  anchor: HTMLElement | null
  onDone: () => void
}) {
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

  const roll = (pool: Pool) => {
    void engine.rollSample(pool)
    onDone()
  }

  const pick = (item: { id: string; title: string }) => {
    void engine.loadArchive(item)
    onDone()
  }

  return (
    <Menu
      anchor={anchor}
      toggle={anchor}
      role="group"
      label="load a tape"
      onClose={onDone}
    >
      <div className={styles.drawer}>
        <div className={styles.cassettes}>
          {POOLS.map((pool, i) => (
            <Tip key={pool.label} text={pool.blurb}>
              <button
                className={styles.cassette}
                style={stripe(i)}
                aria-label={`a random tape from ${pool.label}`}
                onClick={() => roll(pool)}
              >
                <span className={styles.paper}>{pool.label}</span>
                <span className={styles.reels} aria-hidden>
                  <i />
                  <i />
                </span>
              </button>
            </Tip>
          ))}
          <Tip text={ANY.blurb}>
            <button
              className={styles.cassetteAny}
              aria-label={ANY.label}
              onClick={() =>
                roll(POOLS[Math.floor(Math.random() * POOLS.length)]!)
              }
            >
              <span className={styles.paper}>{ANY.label}</span>
              <span className={styles.reels} aria-hidden>
                <i />
                <i />
              </span>
            </button>
          </Tip>
        </div>
        <div className={styles.searchRow}>
          <input
            className={styles.query}
            type="text"
            value={typed}
            placeholder="or search archive.org…"
            aria-label="search archive.org for a tape"
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void search()
            }}
          />
          <DeckKey
            glyph="search"
            legend="find"
            name="search archive.org"
            onClick={() => void search()}
          />
        </div>
        {hits === 'searching' && <p className={styles.note}>searching…</p>}
        {hits === 'none' && (
          <p className={styles.note}>nothing on archive.org for that</p>
        )}
        {Array.isArray(hits) && (
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
    </Menu>
  )
}
