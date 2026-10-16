import { useId, type ReactNode } from 'react'

import { boxHeight, LINE_H, type BoxSpec } from './diagram'
import styles from './Diagram.module.css'

// A stage drawn as a box that reads what its knobs say: accent when one is off
// stock, grey when nothing passes through it. The title is the browser's own
// tooltip, which is all a picture inside a fold needs.
export function BoxView({ box }: { box: BoxSpec }) {
  const lines = Array.isArray(box.value) ? box.value : [box.value]
  return (
    <g opacity={box.off ? 0.55 : 1}>
      <title>{`${box.name} — ${box.help}`}</title>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={boxHeight(box.value)}
        rx={3}
        className={box.touched ? styles.boxOn : styles.box}
      />
      <text
        x={box.x + box.w / 2}
        y={box.y + LINE_H}
        textAnchor="middle"
        className={styles.name}
      >
        {box.name}
      </text>
      {lines.map((line, i) => (
        <text
          key={line + i}
          x={box.x + box.w / 2}
          y={box.y + LINE_H * (i + 2)}
          textAnchor="middle"
          className={box.touched ? styles.valueOn : styles.value}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

// A length of tape, and a head standing on it.
export function Band({
  x,
  y,
  w,
  h,
}: {
  x: number
  y: number
  w: number
  h: number
}) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={h / 2} className={styles.tape} />
  )
}

export function HeadBar({
  x,
  y,
  h,
  on = false,
}: {
  x: number
  y: number
  h: number
  on?: boolean
}) {
  return (
    <rect
      x={x - 2}
      y={y}
      width={4}
      height={h}
      className={on ? styles.gapOn : styles.gap}
    />
  )
}

export type WireLook = 'plain' | 'on' | 'dash' | 'alarm'

const WIRE_CLASS: Record<WireLook, string> = {
  plain: styles.wire!,
  on: styles.wireOn!,
  dash: styles.wireDash!,
  alarm: styles.wireAlarm!,
}

export function Wire({
  d,
  arrow,
  look = 'plain',
}: {
  d: string
  arrow: string
  look?: WireLook
}) {
  return (
    <path d={d} className={WIRE_CLASS[look]} markerEnd={`url(#${arrow})`} />
  )
}

export function Label({
  x,
  y,
  anchor = 'start',
  on = false,
  children,
}: {
  x: number
  y: number
  anchor?: 'start' | 'middle' | 'end'
  on?: boolean
  children: string
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={on ? styles.noteOn : styles.note}
    >
      {children}
    </text>
  )
}

// The drawing's frame: the arrowhead every wire in it points with, and the
// width it scales from.
export function Diagram({
  width,
  height,
  label,
  children,
}: {
  width: number
  height: number
  label: string
  children: (arrow: string) => ReactNode
}) {
  const arrow = useId()
  return (
    <svg
      className={styles.diagram}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0 L6 3 L0 6 z" className={styles.head} />
        </marker>
      </defs>
      {children(arrow)}
    </svg>
  )
}
