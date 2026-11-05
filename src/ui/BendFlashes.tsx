import { useEffect, useState, type CSSProperties } from 'react'

import { activity, onFreshLines } from './activity.ts'
import styles from './BendFlashes.module.css'
import { SLIDER_BY_KEY } from './controls/index.ts'
import { bendColor } from './trace.ts'

const MOST = 6

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

interface Flash {
  id: string
  text: string
  color: string
  slot: number
}

interface Glow {
  id: number
  color: string
}

/** Each bend sets the panel's edge glowing in its trace colour, and floats its
    name and value up off the panel's top. */
export function BendFlashes() {
  const [flashes, setFlashes] = useState<readonly Flash[]>([])
  const [glow, setGlow] = useState<Glow | null>(null)

  useEffect(
    () =>
      onFreshLines(line => {
        const { lines } = activity.get()
        const spawned = line.bends.map((bend, i) => ({
          id: `${line.id}:${bend.key}`,
          text: `${SLIDER_BY_KEY.get(bend.key)?.label ?? bend.key} ${bend.value}`,
          color: bendColor(bend.key, lines, i),
          slot: i,
        }))
        const first = spawned[0]
        if (first) {
          setGlow({ id: line.id, color: first.color })
          setFlashes(shown => [...shown, ...spawned].slice(-MOST))
        }
      }),
    [],
  )

  const done = (id: string) =>
    setFlashes(shown => shown.filter(f => f.id !== id))

  return (
    <>
      {glow && (
        <div
          key={glow.id}
          className={styles.glow}
          style={cssVars({ '--flash': glow.color })}
          aria-hidden="true"
          onAnimationEnd={() => setGlow(null)}
        />
      )}
      <div className={styles.tags} aria-hidden="true">
        {flashes.map(f => (
          <span
            key={f.id}
            className={styles.tag}
            style={{
              ...cssVars({ '--flash': f.color }),
              animationDelay: `${f.slot * 60}ms`,
            }}
            onAnimationEnd={() => done(f.id)}
          >
            {f.text}
          </span>
        ))}
      </div>
    </>
  )
}
