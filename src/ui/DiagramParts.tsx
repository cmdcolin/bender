import { useId, type ReactNode } from 'react'

import { sliderFor } from './controls'
import { boxHeight, LINE_H, type BoxSpec } from './diagram'
import styles from './Diagram.module.css'
import { ControlSlider } from './Slider'

import type { ControlKey } from '../controls'

// A stage drawn as a box that reads what its knobs say: accent when one is off
// stock, grey when nothing passes through it. The title is the browser's own
// tooltip, which is all a picture inside a fold needs.
export function BoxView({
  box,
  selected = false,
  onSelect,
}: {
  box: BoxSpec
  selected?: boolean
  onSelect?: (id: string) => void
}) {
  const lines = Array.isArray(box.value) ? box.value : [box.value]
  const pick = box.id !== undefined && box.keys?.length && onSelect
  const look = `${box.touched ? styles.boxOn : styles.box} ${selected ? styles.selected : ''}`
  return (
    <g
      opacity={box.off ? 0.55 : 1}
      className={pick ? styles.pick : undefined}
      role={pick ? 'button' : undefined}
      tabIndex={pick ? 0 : undefined}
      aria-pressed={pick ? selected : undefined}
      aria-label={pick ? `${box.name} controls` : undefined}
      onClick={pick ? () => onSelect(box.id!) : undefined}
      onKeyDown={
        pick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(box.id!)
              }
            }
          : undefined
      }
    >
      <title>{`${box.name} — ${box.help}`}</title>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={boxHeight(box.value)}
        rx={3}
        className={look}
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
  pick,
  children,
}: {
  x: number
  y: number
  anchor?: 'start' | 'middle' | 'end'
  on?: boolean
  /** Makes the words a button for a box with no frame of its own. */
  pick?: { id: string; selected: boolean; onSelect: (id: string) => void }
  children: string
}) {
  const text = (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={on ? styles.noteOn : styles.note}
    >
      {children}
    </text>
  )
  if (!pick) return text
  return (
    <g
      className={`${styles.pick} ${pick.selected ? styles.pickedLabel : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={pick.selected}
      aria-label={`${pick.id} controls`}
      onClick={() => pick.onSelect(pick.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          pick.onSelect(pick.id)
        }
      }}
    >
      {text}
    </g>
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

// The rows of the box that is open: the same rows the panel draws anywhere
// else, so a drag, a reset and a mod wire all work from here.
export function BoxRows({
  keys,
  note,
}: {
  keys: readonly ControlKey[] | undefined
  note?: string
}) {
  if (!keys) return null
  return (
    <div className={styles.rows}>
      {note && <p className={styles.noteLine}>{note}</p>}
      {keys.map(key => (
        <ControlSlider key={key} def={sliderFor(key)} />
      ))}
    </div>
  )
}
