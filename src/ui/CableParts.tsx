import { pressIsClick } from './cableDrag.ts'
import { PLUG, type Anchor, type Path, type Point } from './cablePaths.ts'
import styles from './GateCables.module.css'

import type { PointerEvent as ReactPointerEvent } from 'react'

export function Socket({
  colour,
  lamp,
  target,
}: {
  colour: string
  lamp?: string
  target: boolean
}) {
  return (
    <svg
      className={styles.socket}
      viewBox="-10 -10 20 20"
      width="20"
      height="20"
      data-lamp={lamp}
      data-target={target}
      aria-hidden="true"
    >
      <circle className={styles.ring} r="9.6" style={{ stroke: colour }} />
      <circle className={styles.nut} r="8.4" />
      <circle className={styles.collar} r="6.4" />
      <circle className={styles.hole} r="3.6" />
      <path className={styles.glint} d="M-5 -2.6 A5.6 5.6 0 0 1 -1.6 -5.2" />
    </svg>
  )
}

/** A plug pushed into the jack at `at`, its boot pointing out of it. */
function Plug({ at, facing, colour }: Anchor & { colour: string }) {
  return (
    <g
      transform={`translate(${at.x} ${at.y}) rotate(${facing === 'right' ? -90 : 180})`}
    >
      <rect
        className={styles.tip}
        x="-2.4"
        y="0"
        width="4.8"
        height="7.5"
        rx="1.4"
      />
      <rect
        className={styles.barrel}
        x="-4.6"
        y="7.5"
        width="9.2"
        height="5.5"
        rx="1.6"
      />
      <rect
        className={styles.boot}
        x="-3.2"
        y="13"
        width="6.4"
        height={PLUG - 13 + 1}
        rx="1.4"
        style={{ fill: colour }}
      />
    </g>
  )
}

/** One cable between two plugs, with an arrowhead pointing the way the signal
    runs. A cable with a `pull` also takes a press anywhere along it. */
export function Wire({
  path,
  from,
  to,
  colour,
  sounding = false,
  pull,
  onGrab,
  tag,
}: {
  path: Path
  from: Anchor
  to: Anchor
  colour: string
  sounding?: boolean
  pull?: { title: string; run: () => void }
  onGrab?: (e: ReactPointerEvent) => void
  tag?: Point
}) {
  const press = pull && {
    onPointerDown: onGrab,
    onClick: () => {
      if (pressIsClick()) pull.run()
    },
  }
  return (
    <g
      className={sounding ? styles.cableOn : styles.cable}
      style={{ ['--cable' as string]: colour }}
    >
      <path className={styles.sheath} d={path.d} />
      <path className={styles.core} d={path.d} />
      <path className={styles.sheen} d={path.d} />
      {pull && (
        <path className={styles.grab} d={path.d} {...press}>
          <title>{pull.title}</title>
        </path>
      )}
      <polygon
        className={styles.arrow}
        points="-6,-5 6,0 -6,5"
        transform={`translate(${path.arrow.x} ${path.arrow.y}) rotate(${path.arrow.angle})`}
      />
      <Plug {...from} colour={colour} />
      <Plug {...to} colour={colour} />
      {pull && tag && (
        <g
          className={styles.tag}
          transform={`translate(${tag.x} ${tag.y}) rotate(-4)`}
          {...press}
        >
          <title>{pull.title}</title>
          <rect x="-21" y="-8" width="45" height="16" rx="3" />
          <circle cx="-16" cy="0" r="1.6" />
          <text x="-2" y="3" textAnchor="middle">
            GATE
          </text>
          <polygon
            className={styles.drop}
            points="-4.5,-3.5 4.5,-3.5 0,4.5"
            transform="translate(15 0)"
          />
        </g>
      )}
    </g>
  )
}
