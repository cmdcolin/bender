import { useBoardValue } from './ControlsContext'
import { sliderFor } from './controls'
import styles from './FeedbackLoops.module.css'

const DEST = sliderFor('fbDest').choices!

const BOX_X = 8
const BOX_W = 56
const BOX_H = 30
const ROW_Y = [6, 46, 86]
const BUS_X = 176
const DEST_X = 194
const DEST_W = 98

const cy = (y: number) => y + BOX_H / 2
const destCy = cy(ROW_Y[1]!)

// The picture 'strips 2 and 3' is short for: three sends off one tap, each
// through its own delay, meeting on the one return. Amber for a strip that is
// actually contributing, cool blue for Cross, which is drawn as what it is —
// the wire between neighbours — dim until two strips are up to run through it.
export function FeedbackLoops() {
  const rows = [
    {
      label: '1',
      amt: useBoardValue(c => c.fbAmt),
      ms: useBoardValue(c => c.fbDelayMs),
    },
    {
      label: '2',
      amt: useBoardValue(c => c.fb2Amt),
      ms: useBoardValue(c => c.fb2Ms),
    },
    {
      label: '3',
      amt: useBoardValue(c => c.fb3Amt),
      ms: useBoardValue(c => c.fb3Ms),
    },
  ]
  const cross = useBoardValue(c => c.fbCross)
  const dest = useBoardValue(c => c.fbDest)
  const crossed = rows[1]!.amt > 0 || rows[2]!.amt > 0

  return (
    <svg
      className={styles.diagram}
      viewBox="-34 0 334 122"
      preserveAspectRatio="xMidYMid meet"
    >
      {rows.map((row, i) => {
        const y = ROW_Y[i]!
        const y0 = cy(y)
        const live = row.amt > 0
        const wire = live ? 'var(--accent2)' : 'var(--fg4)'
        return (
          <g key={row.label}>
            <title>{`strip ${row.label} — ${row.amt.toFixed(2)} into ${row.ms.toFixed(2)} ms`}</title>
            <line
              x1={-16}
              y1={y0}
              x2={BOX_X}
              y2={y0}
              stroke={wire}
              strokeWidth={1.5}
            />
            <rect
              x={BOX_X}
              y={y}
              width={BOX_W}
              height={BOX_H}
              rx={4}
              fill="none"
              stroke={wire}
            />
            <text
              x={BOX_X + BOX_W / 2}
              y={y + 14}
              textAnchor="middle"
              className={styles.label}
              fill={live ? 'var(--fg)' : 'var(--fg4)'}
            >
              {row.label}
            </text>
            <text
              x={BOX_X + BOX_W / 2}
              y={y + 25}
              textAnchor="middle"
              className={styles.sub}
              fill="var(--fg4)"
            >
              {row.ms.toFixed(row.ms < 10 ? 1 : 0)} ms
            </text>
            <line
              x1={BOX_X + BOX_W}
              y1={y0}
              x2={BUS_X}
              y2={y0}
              stroke={wire}
              strokeWidth={1.5}
            />
          </g>
        )
      })}

      <line
        x1={BUS_X}
        y1={cy(ROW_Y[0]!)}
        x2={BUS_X}
        y2={cy(ROW_Y[2]!)}
        stroke="var(--accent2)"
        strokeWidth={1.5}
      />
      <line
        x1={BUS_X}
        y1={destCy}
        x2={DEST_X}
        y2={destCy}
        stroke="var(--accent2)"
        strokeWidth={1.5}
      />
      <path
        d={`M ${DEST_X} ${destCy} L ${DEST_X - 6} ${destCy - 3} L ${DEST_X - 6} ${destCy + 3} Z`}
        fill="var(--accent2)"
      />
      <rect
        x={DEST_X}
        y={ROW_Y[1]}
        width={DEST_W}
        height={BOX_H}
        rx={4}
        fill="none"
        stroke="var(--fg4)"
      />
      <text
        x={DEST_X + DEST_W / 2}
        y={destCy + 4}
        textAnchor="middle"
        className={styles.label}
        fill="var(--fg)"
      >
        {DEST[Math.round(dest)]}
      </text>

      {crossed && (
        <>
          <path
            d={`M ${BOX_X} ${cy(ROW_Y[0]!)} Q ${BOX_X - 20} ${(cy(ROW_Y[0]!) + cy(ROW_Y[1]!)) / 2} ${BOX_X} ${cy(ROW_Y[1]!)}`}
            className={styles.cross}
            style={{ opacity: 0.25 + cross * 0.6 }}
          />
          <path
            d={`M ${BOX_X} ${cy(ROW_Y[1]!)} Q ${BOX_X - 20} ${(cy(ROW_Y[1]!) + cy(ROW_Y[2]!)) / 2} ${BOX_X} ${cy(ROW_Y[2]!)}`}
            className={styles.cross}
            style={{ opacity: 0.25 + cross * 0.6 }}
          />
          <path
            d={`M ${BOX_X} ${cy(ROW_Y[2]!)} Q ${BOX_X - 34} ${cy(ROW_Y[1]!)} ${BOX_X} ${cy(ROW_Y[0]!)}`}
            className={styles.cross}
            style={{ opacity: 0.25 + cross * 0.6 }}
          />
        </>
      )}
    </svg>
  )
}
