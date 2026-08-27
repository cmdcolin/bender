import { useControlValue } from './ControlsContext'
import { sliderFor } from './controls'
import styles from './MicPatch.module.css'

const DEST = sliderFor('micPatch').choices!

const MIC_X = 4
const MIC_W = 46
const MIC_H = 20
const DEST_X = MIC_X + MIC_W + 34
const DEST_W = 84
const ROW_H = 15
const STEP = ROW_H + 3
const TOP = 3
const LIST_H = DEST.length * STEP - 3
const HEIGHT = TOP * 2 + Math.max(LIST_H, MIC_H)
const MIC_Y = TOP + LIST_H / 2 - MIC_H / 2

const rowY = (i: number) => TOP + i * STEP
const cy = (y: number, h: number) => y + h / 2

// One wire, one of seven jacks — drawn as the mic against all seven rather
// than as a single dropdown, so the six it isn't soldered to are as visible
// as the one it is.
export function MicPatch() {
  const patch = Math.round(useControlValue('micPatch'))

  return (
    <svg
      className={styles.diagram}
      viewBox={`0 0 ${DEST_X + DEST_W + 4} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x={MIC_X}
        y={MIC_Y}
        width={MIC_W}
        height={MIC_H}
        rx={4}
        fill="none"
        stroke="var(--accent)"
      />
      <text
        x={MIC_X + MIC_W / 2}
        y={cy(MIC_Y, MIC_H) + 4}
        textAnchor="middle"
        className={styles.label}
        fill="var(--fg)"
      >
        mic
      </text>
      {DEST.map((d, i) => {
        const y = rowY(i)
        const on = i === patch
        const wire = on ? 'var(--accent)' : 'var(--fg4)'
        return (
          <g key={d} opacity={on ? 1 : 0.6}>
            <title>{`${d}${on ? ' — the mic is soldered here now.' : ''}`}</title>
            {on && (
              <line
                x1={MIC_X + MIC_W}
                y1={cy(MIC_Y, MIC_H)}
                x2={DEST_X}
                y2={cy(y, ROW_H)}
                stroke={wire}
                strokeWidth={1.5}
              />
            )}
            <rect
              x={DEST_X}
              y={y}
              width={DEST_W}
              height={ROW_H}
              rx={3}
              fill="none"
              stroke={wire}
              strokeDasharray={on ? undefined : '2 2'}
            />
            <text
              x={DEST_X + DEST_W / 2}
              y={cy(y, ROW_H) + 3.5}
              textAnchor="middle"
              className={styles.label}
              fill={on ? 'var(--fg)' : 'var(--fg4)'}
            >
              {d}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
