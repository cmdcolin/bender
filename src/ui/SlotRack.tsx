import { useBoardValue } from './ControlsContext'
import { BENDS, BEND_SLOT_KEYS, bendAt, sliderFor } from './controls'
import { ControlSlider } from './Slider'
import styles from './SlotRack.module.css'

const BOX_X = 6
const BOX_W = 128
const BOX_H = 24
const GAP = 8
const STEP = BOX_H + GAP
const TOP = 20
const LOOSE_X = BOX_X + BOX_W + 24
const LOOSE_W = 82

const rowY = (i: number) => TOP + i * STEP
const cy = (y: number) => y + BOX_H / 2

// Six slots, seven bends, drawn as the rack they are rather than as six
// identical selects: a box per slot in the order the signal walks them, and
// whichever bend didn't make the cut riding loose to the side. Read-only —
// the selects underneath still do the writing — so the picture is only what
// makes six rows headed 'Slot 1' through 'Slot 6' worth reading at a glance.
export function SlotRack() {
  const raw = useBoardValue(c => BEND_SLOT_KEYS.map(k => c[k]).join(','))
  const slots = raw.split(',').map(Number)
  const mixRaw = useBoardValue(c => BENDS.map(b => c[b.mix]).join(','))
  const mixOf = mixRaw.split(',').map(Number)

  const seen = new Set<number>()
  const rows = slots.map(v => {
    const id = Math.round(v)
    const bend = bendAt(id)
    const dupe = bend !== undefined && seen.has(id)
    if (bend !== undefined) seen.add(id)
    return { bend, dupe, mix: bend ? mixOf[id - 1]! : 0 }
  })
  const loose = BENDS.filter((_, i) => !seen.has(i + 1))

  const bottom = rowY(5) + BOX_H
  const arrowY = bottom + 14
  const height = arrowY + 16

  return (
    <svg
      className={styles.diagram}
      viewBox={`0 0 ${LOOSE_X + LOOSE_W + 6} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <text x={BOX_X} y={12} className={styles.caption}>
        from the mix bus ↓
      </text>

      {rows.map((row, i) => {
        const y = rowY(i)
        const y0 = cy(y)
        const off = row.bend === undefined
        const quiet = off || row.dupe || row.mix === 0
        const wire = quiet ? 'var(--fg4)' : 'var(--accent)'
        const label = off ? '— empty —' : row.bend!.group
        const title = off
          ? `Slot ${i + 1} is empty — nothing runs here.`
          : row.dupe
            ? `${row.bend!.group} already sits earlier in the chain, so this slot does nothing — a bend only runs at its first slot.`
            : row.mix === 0
              ? `${row.bend!.group} — mix is at 0, so this stage sits in the chain but plays silent.`
              : `${row.bend!.group}, slot ${i + 1} of the chain.`
        return (
          <g key={i} opacity={row.dupe ? 0.45 : 1}>
            <title>{title}</title>
            {i > 0 && (
              <line
                x1={BOX_X + BOX_W / 2}
                y1={y - GAP}
                x2={BOX_X + BOX_W / 2}
                y2={y}
                stroke="var(--fg4)"
                strokeWidth={1.5}
              />
            )}
            <rect
              x={BOX_X}
              y={y}
              width={BOX_W}
              height={BOX_H}
              rx={4}
              fill="none"
              stroke={wire}
              strokeDasharray={off || row.dupe ? '3 2' : undefined}
            />
            <text
              x={BOX_X + 6}
              y={y0 + 4}
              className={styles.num}
              fill="var(--fg4)"
            >
              {i + 1}
            </text>
            <text
              x={BOX_X + BOX_W / 2 + 6}
              y={y0 + 4}
              textAnchor="middle"
              className={styles.label}
              fill={off ? 'var(--fg4)' : quiet ? 'var(--fg3)' : 'var(--fg)'}
            >
              {label}
            </text>
          </g>
        )
      })}

      <path
        d={`M ${BOX_X + BOX_W / 2} ${bottom} L ${BOX_X + BOX_W / 2} ${arrowY} M ${BOX_X + BOX_W / 2 - 3} ${arrowY - 4} L ${BOX_X + BOX_W / 2} ${arrowY} L ${BOX_X + BOX_W / 2 + 3} ${arrowY - 4}`}
        stroke="var(--fg4)"
        strokeWidth={1.5}
        fill="none"
      />
      <text x={BOX_X} y={height - 2} className={styles.caption}>
        to the pedals →
      </text>

      {loose.length > 0 && (
        <>
          <text x={LOOSE_X} y={12} className={styles.caption}>
            off the board
          </text>
          {loose.map((bend, i) => {
            const y = rowY(i)
            return (
              <g key={bend.group}>
                <title>{`${bend.group} isn't soldered into a slot right now — click a slot's select below and pick it to bring it back.`}</title>
                <rect
                  x={LOOSE_X}
                  y={y}
                  width={LOOSE_W}
                  height={BOX_H}
                  rx={4}
                  fill="none"
                  stroke="var(--fg4)"
                  strokeDasharray="3 2"
                />
                <text
                  x={LOOSE_X + LOOSE_W / 2}
                  y={cy(y) + 4}
                  textAnchor="middle"
                  className={styles.label}
                  fill="var(--fg4)"
                >
                  {bend.group}
                </text>
              </g>
            )
          })}
        </>
      )}
    </svg>
  )
}

// The other half of the chain: a dry/wet per bend that is actually in a slot,
// in the order the signal meets them. The selects above say what the path is,
// and these say how much of the board goes down it — a stage in slot 2 at a mix
// of zero is in the path and silent, which is the one thing the rack cannot
// draw and the commonest reason a slot you just filled changed nothing.
//
// Each fader is called the bend it belongs to rather than *Mix*, the way the
// desk calls six faders called *Level* by their machines. It is the same
// control as the one on that bend's own panel, and only one panel is ever open.
export function SlotMixes() {
  const raw = useBoardValue(c => BEND_SLOT_KEYS.map(k => c[k]).join(','))
  const seen = new Set<number>()
  const rows = raw
    .split(',')
    .map(Number)
    .flatMap(v => {
      const id = Math.round(v)
      const bend = bendAt(id)
      if (!bend || seen.has(id)) return []
      seen.add(id)
      return [bend]
    })
  if (rows.length === 0) return null
  return (
    <div className={styles.mixes}>
      <span className={styles.mixHead}>how wet each one is</span>
      {rows.map(bend => (
        <ControlSlider
          key={bend.mix}
          def={sliderFor(bend.mix)}
          label={bend.group}
        />
      ))}
    </div>
  )
}
