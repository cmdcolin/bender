import { useEffect, useState, type CSSProperties } from 'react'

import {
  activity,
  onFreshLines,
  type ActivityLine,
  type Bend,
} from './activity.ts'
import styles from './BendFlashes.module.css'
import { SLIDER_BY_KEY } from './controls/index.ts'
import { bendColor } from './trace.ts'

const MOST = 24
const STACK_PX = 22

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

interface Flash {
  id: string
  text: string
  x: number
  y: number
  color: string
  ring?: { left: number; top: number; width: number; height: number }
}

interface Banner {
  id: number
  text: string
}

function visibleRect(el: Element) {
  const r = el.getBoundingClientRect()
  const hit =
    r.width > 0 && r.height > 0
      ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      : null
  return hit !== null && el.contains(hit) ? r : undefined
}

function flashFor(line: ActivityLine, bend: Bend, i: number): Flash {
  const target = [...document.querySelectorAll(`[data-control="${bend.key}"]`)]
    .map(visibleRect)
    .find(r => r !== undefined)
  const panel = document
    .querySelector('[aria-label="script activity"]')
    ?.getBoundingClientRect()
  const color = bendColor(bend.key, activity.get().lines, i)
  const text = `${SLIDER_BY_KEY.get(bend.key)?.label ?? bend.key} ${bend.value}`
  const id = `${line.id}:${bend.key}`
  return target
    ? {
        id,
        text,
        color,
        x: target.left + target.width / 2,
        y: target.top + target.height / 2,
        ring: {
          left: target.left,
          top: target.top,
          width: target.width,
          height: target.height,
        },
      }
    : {
        id,
        text,
        color,
        x: panel ? panel.left + panel.width / 2 : window.innerWidth / 2,
        y: (panel ? panel.top : window.innerHeight / 2) - (i + 1) * STACK_PX,
      }
}

export function BendFlashes() {
  const [flashes, setFlashes] = useState<readonly Flash[]>([])
  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(
    () =>
      onFreshLines(line => {
        if (line.said) setBanner({ id: line.id, text: line.text })
        const spawned = line.bends.map((bend, i) => flashFor(line, bend, i))
        if (spawned.length > 0)
          setFlashes(shown => [...shown, ...spawned].slice(-MOST))
      }),
    [],
  )

  const done = (id: string) =>
    setFlashes(shown => shown.filter(f => f.id !== id))

  return (
    <div className={styles.layer} aria-hidden="true">
      {banner && (
        <div
          key={banner.id}
          className={styles.banner}
          onAnimationEnd={() => setBanner(null)}
        >
          {banner.text}
        </div>
      )}
      {flashes.map(f => (
        <div key={f.id} style={cssVars({ '--flash': f.color })}>
          {f.ring && <div className={styles.ring} style={f.ring} />}
          <div
            className={styles.tag}
            style={{ left: f.x, top: f.y }}
            onAnimationEnd={() => done(f.id)}
          >
            {f.text}
          </div>
        </div>
      ))}
    </div>
  )
}
