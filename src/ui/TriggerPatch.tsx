import { useControlValue } from './ControlsContext'
import { sliderFor } from './controls'
import styles from './TriggerPatch.module.css'

const TO_KEYS = sliderFor('trigToKeys').choices!
const TO_DRUM = sliderFor('trigToDrum').choices!
const NOTE = sliderFor('trigKeysNote').choices!

const BOX_W = 116
const BOX_H = 26
const GAP = 56
const LEFT_X = 4
const RIGHT_X = LEFT_X + BOX_W + GAP
const TOP = 14
const Y0 = TOP + BOX_H / 2
const UP_Y = Y0 - 6
const DOWN_Y = Y0 + 6
const HEIGHT = TOP + BOX_H + 20

// Two boxes and the two trigger wires that can bridge one's line onto the
// other's gate — drawn as a loop rather than as 'Kit fires keys' and 'Keys
// fire kit' read as two unrelated dropdowns three rows apart.
export function TriggerPatch() {
  const toKeys = Math.round(useControlValue('trigToKeys'))
  const toDrum = Math.round(useControlValue('trigToDrum'))
  const note = Math.round(useControlValue('trigKeysNote'))

  const upOn = toKeys > 0
  const downOn = toDrum > 0
  const upTitle = upOn
    ? `${TO_KEYS[toKeys]} on the kit strikes a key, playing ${NOTE[note]}.`
    : 'The kit does not fire the keyboard.'
  const downTitle = downOn
    ? `Every key strike fires ${TO_DRUM[toDrum]} on the kit.`
    : 'The keyboard does not fire the kit.'

  return (
    <svg
      className={styles.diagram}
      viewBox={`0 0 ${RIGHT_X + BOX_W + 4} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x={LEFT_X}
        y={TOP}
        width={BOX_W}
        height={BOX_H}
        rx={4}
        fill="none"
        stroke="var(--fg3)"
      />
      <text
        x={LEFT_X + BOX_W / 2}
        y={Y0 + 4}
        textAnchor="middle"
        className={styles.label}
        fill="var(--fg)"
      >
        Toy drums
      </text>
      <rect
        x={RIGHT_X}
        y={TOP}
        width={BOX_W}
        height={BOX_H}
        rx={4}
        fill="none"
        stroke="var(--fg3)"
      />
      <text
        x={RIGHT_X + BOX_W / 2}
        y={Y0 + 4}
        textAnchor="middle"
        className={styles.label}
        fill="var(--fg)"
      >
        Toy keyboard
      </text>

      <g opacity={upOn ? 1 : 0.45}>
        <title>{upTitle}</title>
        <line
          x1={LEFT_X + BOX_W}
          y1={UP_Y}
          x2={RIGHT_X - 6}
          y2={UP_Y}
          stroke={upOn ? 'var(--accent)' : 'var(--fg4)'}
          strokeWidth={upOn ? 1.5 : 1}
          strokeDasharray={upOn ? undefined : '2 2'}
        />
        <path
          d={`M ${RIGHT_X - 6} ${UP_Y - 3} L ${RIGHT_X} ${UP_Y} L ${RIGHT_X - 6} ${UP_Y + 3}`}
          fill="none"
          stroke={upOn ? 'var(--accent)' : 'var(--fg4)'}
          strokeWidth={1.5}
        />
        <text
          x={(LEFT_X + BOX_W + RIGHT_X) / 2}
          y={UP_Y - 4}
          textAnchor="middle"
          className={styles.tag}
          fill={upOn ? 'var(--fg3)' : 'var(--fg4)'}
        >
          {upOn ? `${TO_KEYS[toKeys]} trig → ${NOTE[note]}` : 'kit → keys off'}
        </text>
      </g>

      <g opacity={downOn ? 1 : 0.45}>
        <title>{downTitle}</title>
        <line
          x1={RIGHT_X}
          y1={DOWN_Y}
          x2={LEFT_X + BOX_W + 6}
          y2={DOWN_Y}
          stroke={downOn ? 'var(--cool)' : 'var(--fg4)'}
          strokeWidth={downOn ? 1.5 : 1}
          strokeDasharray={downOn ? undefined : '2 2'}
        />
        <path
          d={`M ${LEFT_X + BOX_W + 6} ${DOWN_Y - 3} L ${LEFT_X + BOX_W} ${DOWN_Y} L ${LEFT_X + BOX_W + 6} ${DOWN_Y + 3}`}
          fill="none"
          stroke={downOn ? 'var(--cool)' : 'var(--fg4)'}
          strokeWidth={1.5}
        />
        <text
          x={(LEFT_X + BOX_W + RIGHT_X) / 2}
          y={DOWN_Y + 12}
          textAnchor="middle"
          className={styles.tag}
          fill={downOn ? 'var(--fg3)' : 'var(--fg4)'}
        >
          {downOn ? `keys → ${TO_DRUM[toDrum]} trig` : 'keys → kit off'}
        </text>
      </g>
    </svg>
  )
}
