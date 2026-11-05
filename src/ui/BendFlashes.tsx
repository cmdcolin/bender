import { useEffect, useState, type CSSProperties } from 'react'

import { activity, type ActivityLine, type Bend } from './activity.ts'
import styles from './BendFlashes.module.css'
import { SLIDER_BY_KEY } from './controls/index.ts'
import { laneKeys, TRACE_LANES } from './trace.ts'

const FRESH_MS = 1000
const MOST = 24
const LANE_COLORS = ['--accent', '--accent2', '--cool', '--mod', '--fg2']
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

function visibleRect(el: Element) {
  const r = el.getBoundingClientRect()
  const hit =
    r.width > 0 && r.height > 0
      ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      : null
  return hit !== null && el.contains(hit) ? r : undefined
}

function flashFor(
  line: ActivityLine,
  bend: Bend,
  i: number,
  lanes: readonly string[],
): Flash {
  const target = [...document.querySelectorAll(`[data-control="${bend.key}"]`)]
    .map(visibleRect)
    .find(r => r !== undefined)
  const panel = document
    .querySelector('[aria-label="script activity"]')
    ?.getBoundingClientRect()
  const lane = lanes.indexOf(bend.key)
  const color = `var(${LANE_COLORS[(lane < 0 ? i : lane) % TRACE_LANES]})`
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

  useEffect(() => {
    let seen = -1
    const spawn = () => {
      const { lines } = activity.get()
      const lanes = laneKeys(lines)
      const now = Date.now()
      const fresh = lines.filter(l => l.id > seen && now - l.at < FRESH_MS)
      seen = Math.max(seen, lines[0]?.id ?? -1)
      const spawned = fresh.flatMap(line =>
        line.bends.map((bend, i) => flashFor(line, bend, i, lanes)),
      )
      if (spawned.length > 0)
        setFlashes(shown => [...shown, ...spawned].slice(-MOST))
    }
    spawn()
    return activity.subscribe(spawn)
  }, [])

  const done = (id: string) =>
    setFlashes(shown => shown.filter(f => f.id !== id))

  return (
    <div className={styles.layer} aria-hidden="true">
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
