import { Fragment, useId, type ReactNode } from 'react'

import { sliderFor } from './controls/index.ts'
import { useBoardValue } from './ControlsContext.ts'
import styles from './Diagram.module.css'
import { boxHeight, LINE_H, rowShown, type BoxSpec } from './diagram.ts'
import { ControlSlider } from './Slider.tsx'

import type { ControlKey } from '../controls.ts'

// CROSS_REPO_SYNC(diagram-parts)
// A group the pointer and keyboard press to pick a box.
export function Pressable({
  name,
  selected,
  onSelect,
  className,
  opacity,
  children,
}: {
  name: string
  selected: boolean
  onSelect?: () => void
  className?: string
  opacity?: number
  children: ReactNode
}) {
  return (
    <g
      opacity={opacity}
      className={onSelect ? `${styles.pick} ${className ?? ''}` : className}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      aria-label={onSelect ? `${name} controls` : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect()
              }
            }
          : undefined
      }
    >
      {children}
    </g>
  )
}

// A frame round part of a drawing: accent when a knob inside is off stock,
// filled when its rows are open.
export function Plate({
  x,
  y,
  w,
  h,
  touched,
  selected,
  inert,
}: {
  x: number
  y: number
  w: number
  h: number
  touched?: boolean
  selected?: boolean
  inert?: boolean
}) {
  const look = `${touched ? styles.boxOn : styles.box} ${selected ? styles.selected : ''} ${inert ? styles.inert : ''}`
  return <rect x={x} y={y} width={w} height={h} rx={3} className={look} />
}

// A stage drawn as a box with its name: accent when a knob inside is off stock,
// grey when nothing passes through it. The title is the browser's own tooltip.
export function BoxView({
  box,
  selected,
  onSelect,
}: {
  box: BoxSpec
  selected?: boolean
  onSelect?: (id: string) => void
}) {
  const lines = box.name.split('\n')
  const label = lines.join(' ')
  const pick = box.id !== undefined && box.keys?.length && onSelect
  const h = box.h ?? boxHeight(box.name)
  const top = box.y + (h - LINE_H * lines.length) / 2
  return (
    <Pressable
      name={label}
      selected={selected ?? false}
      onSelect={pick ? () => onSelect(box.id!) : undefined}
      opacity={box.off ? 0.55 : 1}
    >
      <title>{`${label} — ${box.help}`}</title>
      <Plate
        x={box.x}
        y={box.y}
        w={box.w}
        h={h}
        touched={box.touched}
        selected={selected}
        inert={!pick}
      />
      {lines.map((line, i) => (
        <text
          key={line + i}
          x={box.x + box.w / 2}
          y={top + LINE_H * (i + 1) - 3}
          textAnchor="middle"
          className={box.touched ? styles.nameOn : styles.name}
        >
          {line}
        </text>
      ))}
    </Pressable>
  )
}

export type WireLook = 'plain' | 'on' | 'dash' | 'alarm'

const WIRE_CLASS: Record<WireLook, string> = {
  plain: styles.wire!,
  on: styles.wireOn!,
  dash: styles.wireDash!,
  alarm: styles.wireAlarm!,
}

const HEAD_CLASS: Record<WireLook, string> = {
  plain: styles.head!,
  on: styles.headOn!,
  dash: styles.head!,
  alarm: styles.headAlarm!,
}

export function Wire({
  d,
  arrow,
  look,
}: {
  d: string
  arrow?: string
  look?: WireLook
}) {
  return (
    <path
      d={d}
      className={WIRE_CLASS[look ?? 'plain']}
      markerEnd={arrow && `url(#${arrow}-${look ?? 'plain'})`}
    />
  )
}

export function Label({
  x,
  y,
  anchor,
  on,
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
      textAnchor={anchor ?? 'start'}
      className={on ? styles.noteOn : styles.note}
    >
      {children}
    </text>
  )
  if (!pick) return text
  return (
    <Pressable
      name={pick.id}
      selected={pick.selected}
      onSelect={() => pick.onSelect(pick.id)}
      className={pick.selected ? styles.pickedLabel : ''}
    >
      {text}
    </Pressable>
  )
}

// The drawing's frame: an arrowhead in each wire look's colour, and the width
// the drawing scales from.
export function Diagram({
  left,
  width,
  height,
  label,
  children,
}: {
  /** How far the drawing runs left of x = 0. */
  left?: number
  width: number
  height: number
  label: string
  children: (arrow: string) => ReactNode
}) {
  const arrow = useId()
  return (
    <svg
      className={styles.diagram}
      viewBox={`${-(left ?? 0)} 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        {Object.entries(HEAD_CLASS).map(([look, className]) => (
          <marker
            key={look}
            id={`${arrow}-${look}`}
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0 L6 3 L0 6 z" className={className} />
          </marker>
        ))}
      </defs>
      {children(arrow)}
    </svg>
  )
}
// CROSS_REPO_SYNC_END(diagram-parts)

// The rows of the box that is open: the same rows the panel draws anywhere
// else, so a drag, a reset and a mod wire all work from here. A row still
// waiting on something stays off, as it does on the panel.
export function BoxRows({
  keys,
  note,
  verbs,
  hint,
  under,
}: {
  keys: readonly ControlKey[] | undefined
  note?: string
  /** Controls drawn above the rows, for a box whose knobs have dice or cuts. */
  verbs?: ReactNode
  /** Said while no box is open. */
  hint?: string
  /** An editor drawn after the last shown row of `keys`. */
  under?: { keys: readonly ControlKey[]; node: ReactNode }
}) {
  const shown = useBoardValue(c =>
    (keys ?? []).filter(k => rowShown(k, c)).join(','),
  ).split(',')
  if (!keys) return hint ? <p className={styles.hint}>{hint}</p> : null
  const rows = keys.filter(key => shown.includes(key))
  const last = rows.findLast(key => under?.keys.includes(key))
  return (
    <div className={styles.rows}>
      {note && <p className={styles.noteLine}>{note}</p>}
      {verbs}
      {rows.map(key => (
        <Fragment key={key}>
          <ControlSlider def={sliderFor(key)} />
          {key === last && under?.node}
        </Fragment>
      ))}
    </div>
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

// A reel seen from above; `full` is how much of the flange the tape fills.
export function Reel({
  cx,
  cy,
  r,
  full,
  spokes = true,
}: {
  cx: number
  cy: number
  r: number
  full: number
  spokes?: boolean
}) {
  const hub = r * 0.22
  const at = (deg: number, radius: number) => ({
    x: cx + Math.cos((deg * Math.PI) / 180) * radius,
    y: cy + Math.sin((deg * Math.PI) / 180) * radius,
  })
  return (
    <>
      <circle cx={cx} cy={cy} r={r * full} className={styles.pack} />
      <circle cx={cx} cy={cy} r={r} className={styles.reel} />
      {spokes &&
        [90, 210, 330].map(deg => (
          <line
            key={deg}
            x1={at(deg, hub).x}
            y1={at(deg, hub).y}
            x2={at(deg, r * 0.92).x}
            y2={at(deg, r * 0.92).y}
            className={styles.reel}
          />
        ))}
      <circle cx={cx} cy={cy} r={hub} className={styles.hub} />
    </>
  )
}

// The pinch roller above the tape and the capstan below it.
export function Capstan({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y - 6} r={6} className={styles.reel} />
      <circle cx={x} cy={y + 3} r={3} className={styles.hub} />
    </>
  )
}

export function TapeLine({ d }: { d: string }) {
  return <path d={d} className={styles.tapeLine} />
}
