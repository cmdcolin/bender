import { useEffect, useState, type CSSProperties } from 'react'

import { activity, onFreshLines } from './activity.ts'
import { GROUP_BY_KEY } from './controls/index.ts'
import styles from './MapComets.module.css'
import { routeOut } from './mapRoute.ts'
import { bendColor } from './trace.ts'

import type { ChainMap } from './chain-map.ts'

const MOST = 24
const HOP_MS = 90
const FADE = 0.15

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

interface Comet {
  id: string
  door: string
  color: string
}

/** Each bend lights its stage on the map, then each stage and wire after it
    in turn down to the output. */
export function MapComets({ map }: { map: ChainMap }) {
  const [comets, setComets] = useState<readonly Comet[]>([])

  useEffect(
    () =>
      onFreshLines(line => {
        const { lines } = activity.get()
        const spawned = line.bends.flatMap((bend, i) => {
          const door = GROUP_BY_KEY.get(bend.key)
          return door
            ? [
                {
                  id: `${line.id}:${bend.key}`,
                  door,
                  color: bendColor(bend.key, lines, i),
                },
              ]
            : []
        })
        if (spawned.length > 0)
          setComets(shown => [...shown, ...spawned].slice(-MOST))
      }),
    [],
  )

  const done = (id: string) =>
    setComets(shown => shown.filter(c => c.id !== id))

  return (
    <g className={styles.comets} aria-hidden="true">
      {comets.map(c => {
        const { node, wires, stops } = routeOut(map, c.door)
        const boxes = node ? [node, ...stops] : stops
        return (
          <g key={c.id} style={cssVars({ '--flash': c.color })}>
            {wires.map((w, hop) => (
              <path
                key={`w:${w.id}`}
                className={styles.zap}
                d={w.d}
                style={{ animationDelay: `${(hop + 0.5) * HOP_MS}ms` }}
              />
            ))}
            {boxes.map((n, hop) => (
              <rect
                key={`n:${n.id}`}
                className={styles.box}
                x={n.x}
                y={n.y}
                width={n.w}
                height={n.h}
                rx={3}
                style={{
                  animationDelay: `${hop * HOP_MS}ms`,
                  opacity: Math.max(1 - hop * FADE, FADE),
                }}
                onAnimationEnd={
                  hop === boxes.length - 1 ? () => done(c.id) : undefined
                }
              />
            ))}
          </g>
        )
      })}
    </g>
  )
}
