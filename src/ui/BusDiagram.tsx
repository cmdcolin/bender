import { FAULT } from '../dsp/bus.ts'
import styles from './BusDiagram.module.css'
import {
  choice,
  type BusRow,
  type BusSpec,
  type Feed,
  type Ribbon,
  type Tap,
} from './busSpecs.ts'
import { sliderFor } from './controls/index.ts'
import { boxHeight, boxWidth, LINE_H, useReadings } from './diagram.ts'
import { Diagram, Wire } from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'

const WIDTH = 420
const PITCH = 4
const STACK_GAP = 32
const ABOVE = 24
const BELOW = 8
const TAP_ROOM = 26
const PAD = 8
const GLYPH_AT = 0.6
const TAP_AT = 0.9
const LOOP_AT = 0.15

const widthOf = (r: Ribbon) => sliderFor(r.line).choices!.length - 1
const ribbonH = (r: Ribbon) => (widthOf(r) - 1) * PITCH
const stackH = (link: Ribbon[]) =>
  link.reduce((h, r) => h + ribbonH(r), 0) + STACK_GAP * (link.length - 1)

interface Placed {
  ribbon: Ribbon
  x0: number
  x1: number
  top: number
}

export interface ChipBox {
  name: string
  x: number
  y: number
  w: number
  h: number
}

const along = (p: Placed, at: number) => p.x0 + (p.x1 - p.x0) * at
const lineY = (p: Placed, i: number) => p.top + i * PITCH
const bottom = (p: Placed) => p.top + ribbonH(p.ribbon)

function place(row: BusRow, rowTop: number) {
  const coreH = Math.max(
    ...row.links.map(stackH).map(h => h + 2 * PAD),
    ...row.chips.flat().map(boxHeight),
  )
  const boxTop = rowTop + ABOVE
  const mid = boxTop + coreH / 2
  const widths = row.chips.map(c => Math.max(...[c].flat().map(boxWidth)))
  const gap =
    (WIDTH - 2 - widths.reduce((a, b) => a + b)) / (row.chips.length - 1)
  const xs = widths.map((_, i) =>
    Math.round(widths.slice(0, i).reduce((a, b) => a + b + gap, 1)),
  )
  const links = row.links.map((link, i) => {
    let top = mid - stackH(link) / 2
    return link.map(r => {
      const p = { ribbon: r, x0: xs[i]! + widths[i]!, x1: xs[i + 1]!, top }
      top += ribbonH(r) + STACK_GAP
      return p
    })
  })
  const chips = row.chips.map((c, i): ChipBox[] => {
    if (typeof c === 'string')
      return [{ name: c, x: xs[i]!, y: boxTop, w: widths[i]!, h: coreH }]
    const beside = links[Math.min(i, links.length - 1)]!
    return c.map((name, j) => {
      const p = beside[j]!
      const h = Math.max(ribbonH(p.ribbon) + 12, boxHeight(name))
      const y = p.top + ribbonH(p.ribbon) / 2 - h / 2
      return { name, x: xs[i]!, y, w: widths[i]!, h }
    })
  })
  const height = ABOVE + coreH + BELOW + (row.taps ? TAP_ROOM : 0)
  return { links, chips, boxTop, coreH, height }
}

function layout(spec: BusSpec) {
  const rows: { row: BusRow; placed: ReturnType<typeof place>; top: number }[] =
    []
  let top = 0
  for (const row of spec.rows) {
    const placed = place(row, top)
    rows.push({ row, placed, top })
    top += placed.height
  }
  return rows
}

export function Chip({
  box,
  reading,
  help,
}: {
  box: ChipBox
  reading?: string
  help?: string
}) {
  const lines = box.name.split('\n')
  const count = lines.length + (reading ? 1 : 0)
  const top = box.y + (box.h - LINE_H * count) / 2
  return (
    <g>
      {help && <title>{`${box.name.replace('\n', ' ')} — ${help}`}</title>}
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={3}
        className={styles.chip}
      />
      {lines.map((line, i) => (
        <text
          key={line}
          x={box.x + box.w / 2}
          y={top + LINE_H * (i + 1) - 3}
          textAnchor="middle"
          className={styles.chipName}
        >
          {line}
        </text>
      ))}
      {reading && (
        <text
          x={box.x + box.w / 2}
          y={top + LINE_H * count - 3}
          textAnchor="middle"
          className={styles.knifed}
        >
          {reading}
        </text>
      )}
    </g>
  )
}

function Trace({
  p,
  line,
  fault,
  cut,
}: {
  p: Placed
  line: number
  fault: number
  cut: number
}) {
  const names = sliderFor(p.ribbon.line).choices!.slice(1)
  const n = names.length
  const knifed = line - 1
  const pair =
    knifed >= 0 && fault === FAULT.bridge
      ? knifed + 1 < n
        ? knifed + 1
        : knifed - 1
      : -1
  const gx = along(p, GLYPH_AT)
  const beside = fault === FAULT.ground || fault === FAULT.supply
  const y = lineY(p, knifed)
  const low = bottom(p)
  const what = sliderFor(p.ribbon.line).label.toLowerCase()
  const title =
    knifed < 0
      ? `${what}: ${names[0]}–${names[n - 1]}, no knife`
      : `${what}: ${names[knifed]} ${choice(p.ribbon.fault, fault)}`
  const traces = names.map((_, i) => {
    const at = lineY(p, i)
    const hit = i === knifed || i === pair
    const d =
      i === knifed && fault === FAULT.cut
        ? `M${p.x0} ${at} H${gx - 3} M${gx + 3} ${at} H${p.x1}`
        : `M${p.x0} ${at} H${p.x1}`
    return (
      <path key={i} d={d} className={hit ? styles.traceCut : styles.trace} />
    )
  })
  const dot = <circle cx={gx} cy={y} r={1.6} className={styles.solder} />
  const glyph =
    knifed < 0 ? null : fault === FAULT.ground ? (
      <>
        <path
          d={`M${gx} ${y} V${low + 4} M${gx - 5} ${low + 4} H${gx + 5} M${gx - 3} ${low + 6.5} H${gx + 3} M${gx - 1} ${low + 9} H${gx + 1}`}
          className={styles.jumper}
        />
        {dot}
      </>
    ) : fault === FAULT.supply ? (
      <>
        <path
          d={`M${gx} ${y} V${p.top - 6} M${gx - 4} ${p.top - 6} H${gx + 4}`}
          className={styles.jumper}
        />
        <text
          x={gx}
          y={p.top - 9}
          textAnchor="middle"
          className={styles.knifed}
        >
          +V
        </text>
        {dot}
      </>
    ) : fault === FAULT.bridge ? (
      <rect
        x={gx - 2.5}
        y={lineY(p, Math.min(knifed, pair)) - 1.5}
        width={5}
        height={PITCH + 3}
        rx={1.5}
        className={styles.solder}
      />
    ) : (
      <>
        <path
          d={`M${gx - 3} ${y + 4} L${gx + 3} ${y - 4}`}
          className={styles.jumper}
        />
        {cut < 0.98 && (
          <path d={`M${gx - 3} ${y} H${gx + 3}`} className={styles.conduct} />
        )}
      </>
    )
  return (
    <g>
      <title>{title}</title>
      {traces}
      {glyph}
      <text x={p.x0 + 3} y={low + 11} className={styles.bus}>
        {`${names[0]}–${names[n - 1]}`}
      </text>
      {knifed >= 0 && (
        <text
          x={beside ? gx + 7 : gx}
          y={
            fault === FAULT.ground
              ? low + 10
              : fault === FAULT.supply
                ? p.top - 3
                : knifed < n / 2
                  ? p.top - 4
                  : low + 11
          }
          textAnchor={beside ? 'start' : 'middle'}
          className={styles.knifed}
        >
          {names[knifed]!}
        </text>
      )}
    </g>
  )
}

function TapWire({
  tap,
  value,
  also,
  links,
  chips,
  routeY,
}: {
  tap: Tap
  value: number
  also: number
  links: Placed[][]
  chips: ChipBox[][]
  routeY: number
}) {
  if (value <= 0) return null
  const from = links[tap.link]!.at(-1)!
  const fx = along(from, TAP_AT)
  const fy = lineY(from, value - 1)
  const onto = tap.onto(also)
  const end =
    onto.line === undefined
      ? (() => {
          const c = chips[onto.chip]!.at(-1)!
          return { x: c.x + c.w / 2, y: c.y + c.h, pin: onto.pin }
        })()
      : (() => {
          const to = links[onto.link]!.at(-1)!
          return { x: along(to, TAP_AT), y: lineY(to, onto.line), pin: '' }
        })()
  return (
    <>
      <path
        d={`M${fx} ${fy} V${routeY} H${end.x} V${end.y}`}
        className={styles.jumper}
      />
      <circle cx={fx} cy={fy} r={1.6} className={styles.solder} />
      {end.pin ? (
        <text x={end.x + 4} y={end.y + 10} className={styles.knifed}>
          {end.pin}
        </text>
      ) : (
        <circle cx={end.x} cy={end.y} r={1.6} className={styles.solder} />
      )}
      <text
        x={(fx + end.x) / 2}
        y={routeY + 11}
        textAnchor="middle"
        className={styles.knifed}
      >
        {tap.says(value, also)}
      </text>
    </>
  )
}

function FeedWire({
  feed,
  value,
  links,
  chips,
  rowTop,
  boxTop,
  arrow,
}: {
  feed: Feed
  value: number
  links: Placed[][]
  chips: ChipBox[][]
  rowTop: number
  boxTop: number
  arrow: string
}) {
  if (value <= 0 && !feed.always) return null
  const to = chips[feed.chip]![0]!
  const tx = to.x + to.w / 2
  const look = value > 0 ? 'alarm' : 'plain'
  const say = (x: number, y: number, anchor: 'start' | 'middle') => (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={value > 0 ? styles.knifed : styles.bus}
    >
      {feed.says(value)}
    </text>
  )
  if (!feed.from)
    return (
      <>
        <Wire arrow={arrow} d={`M${tx} ${rowTop + 2} V${to.y}`} look={look} />
        {say(tx + 4, rowTop + 12, 'start')}
      </>
    )
  const sx =
    'chip' in feed.from
      ? (() => {
          const c = chips[feed.from.chip]![0]!
          return c.x + c.w / 2
        })()
      : along(links[feed.from.link]![0]!, LOOP_AT)
  const sy = 'chip' in feed.from ? boxTop : links[feed.from.link]![0]!.top
  const over = rowTop + 14
  return (
    <>
      <Wire
        arrow={arrow}
        d={`M${sx} ${sy} V${over} H${tx} V${to.y}`}
        look={look}
      />
      {say((sx + tx) / 2, over - 3, 'middle')}
    </>
  )
}

export function BusDiagram({ spec }: { spec: BusSpec }) {
  const keys = [
    spec.cut,
    ...spec.rows.flatMap(row => [
      ...row.links.flat().flatMap(r => [r.line, r.fault]),
      ...(row.taps ?? []).flatMap(t => (t.also ? [t.key, t.also] : [t.key])),
      ...(row.feeds ?? []).map(f => f.key),
    ]),
  ]
  const r = useReadings(keys)
  const read = (key: ControlKey) => Math.round(r.value(key))
  const rows = layout(spec)
  const last = rows.at(-1)!
  const top = last.top + last.placed.height
  return (
    <Diagram width={WIDTH} height={top} label={spec.label}>
      {arrow =>
        rows.map(({ row, placed, top: rowTop }, i) => (
          <g key={i}>
            {placed.links.flat().map(p => (
              <Trace
                key={p.ribbon.line}
                p={p}
                line={read(p.ribbon.line)}
                fault={read(p.ribbon.fault)}
                cut={r.value(spec.cut)}
              />
            ))}
            {placed.chips.flat().map(box => (
              <Chip key={box.name} box={box} />
            ))}
            {row.feeds?.map(feed => (
              <FeedWire
                key={feed.key}
                feed={feed}
                value={r.value(feed.key)}
                links={placed.links}
                chips={placed.chips}
                rowTop={rowTop}
                boxTop={placed.boxTop}
                arrow={arrow}
              />
            ))}
            {row.taps?.map(tap => (
              <TapWire
                key={tap.key}
                tap={tap}
                value={read(tap.key)}
                also={tap.also ? read(tap.also) : 0}
                links={placed.links}
                chips={placed.chips}
                routeY={placed.boxTop + placed.coreH + 12}
              />
            ))}
          </g>
        ))
      }
    </Diagram>
  )
}
