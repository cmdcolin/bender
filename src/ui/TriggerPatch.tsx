import { useControlValue } from './ControlsContext'
import { sliderFor } from './controls'
import { ControlSlider } from './Slider'
import styles from './TriggerPatch.module.css'

const TO_KEYS = sliderFor('trigToKeys').choices!
const TO_DRUM = sliderFor('trigToDrum').choices!
const NOTE = sliderFor('trigKeysNote').choices!
const STRUCK = sliderFor('fmStruck').choices!

const ROWS = [
  'trigToKeys',
  'trigKeysNote',
  'trigToDrum',
  'fmStruck',
  'fmKeyGate',
].map(key => sliderFor(key as Parameters<typeof sliderFor>[0]))

const BOX_W = 116
const BOX_H = 26
const GAP = 56
const LEFT_X = 4
const RIGHT_X = LEFT_X + BOX_W + GAP
const TOP = 14
const Y0 = TOP + BOX_H / 2
const UP_Y = Y0 - 6
const DOWN_Y = Y0 + 6
// The chip's row, far enough under the pair that the wire down to it is a wire
// rather than a joint — it is on the end of one of these, not beside them.
const FM_Y = TOP + BOX_H + 42
const FM_MID = FM_Y + BOX_H / 2
const KEYS_MID = RIGHT_X + BOX_W / 2
const DRUM_MID = LEFT_X + BOX_W / 2
const HEIGHT = FM_Y + BOX_H + 6

// The three boxes on the board and the wires that make one strike another:
// the two the bay can bridge between the toys, and the two that reach the chip
// with no keyboard of its own — the jumper off the keyboard's gate, which was
// soldered at the factory, and the kit's trigger lines, which were not.
//
// Drawn as a loop rather than as five dropdowns spread over two panels. 'Kit
// fires keys' and 'Struck by' are the same gesture aimed at two different
// boxes, and nothing on the panel said so.
export function TriggerPatch() {
  const toKeys = Math.round(useControlValue('trigToKeys'))
  const toDrum = Math.round(useControlValue('trigToDrum'))
  const note = Math.round(useControlValue('trigKeysNote'))
  const struck = Math.round(useControlValue('fmStruck'))
  const gateCut = useControlValue('fmKeyGate') >= 0.5

  const upOn = toKeys > 0
  const downOn = toDrum > 0
  const struckOn = struck > 0
  const upTitle = upOn
    ? `${TO_KEYS[toKeys]} on the kit strikes a key, playing ${NOTE[note]}.`
    : 'The kit does not fire the keyboard.'
  const downTitle = downOn
    ? `Every key strike fires ${TO_DRUM[toDrum]} on the kit.`
    : 'The keyboard does not fire the kit.'
  const struckTitle = struckOn
    ? `${STRUCK[struck]} on the kit strikes a note on the FM chip.`
    : 'The kit does not fire the FM chip.'
  const gateTitle = gateCut
    ? 'The jumper is cut, so the FM chip no longer follows the keyboard.'
    : 'The factory jumper: every note the keyboard strikes, the FM chip plays too.'

  const box = (x: number, y: number, name: string) => (
    <>
      <rect
        x={x}
        y={y}
        width={BOX_W}
        height={BOX_H}
        rx={4}
        fill="none"
        stroke="var(--fg3)"
      />
      <text
        x={x + BOX_W / 2}
        y={y + BOX_H / 2 + 4}
        textAnchor="middle"
        className={styles.label}
        fill="var(--fg)"
      >
        {name}
      </text>
    </>
  )

  return (
    <>
      <svg
        className={styles.diagram}
        viewBox={`0 0 ${RIGHT_X + BOX_W + 4} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {box(LEFT_X, TOP, 'Toy drums')}
        {box(RIGHT_X, TOP, 'Toy keyboard')}
        {box(RIGHT_X, FM_Y, 'FM chip')}

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
            {upOn
              ? `${TO_KEYS[toKeys]} trig → ${NOTE[note]}`
              : 'kit → keys off'}
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

        {/* The jumper, which is the one wire here nobody patched: it came
            soldered, and the control on it only cuts it. */}
        <g opacity={gateCut ? 0.45 : 1}>
          <title>{gateTitle}</title>
          <line
            x1={KEYS_MID}
            y1={TOP + BOX_H}
            x2={KEYS_MID}
            y2={FM_Y - 6}
            stroke={gateCut ? 'var(--fg4)' : 'var(--accent2)'}
            strokeWidth={gateCut ? 1 : 1.5}
            strokeDasharray={gateCut ? '2 2' : undefined}
          />
          <path
            d={`M ${KEYS_MID - 3} ${FM_Y - 6} L ${KEYS_MID} ${FM_Y} L ${KEYS_MID + 3} ${FM_Y - 6}`}
            fill="none"
            stroke={gateCut ? 'var(--fg4)' : 'var(--accent2)'}
            strokeWidth={1.5}
          />
          <text
            x={KEYS_MID + 5}
            y={(TOP + BOX_H + FM_Y) / 2 + 3}
            className={styles.tag}
            fill={gateCut ? 'var(--fg4)' : 'var(--fg3)'}
          >
            {gateCut ? 'gate cut' : 'gate'}
          </text>
        </g>

        <g opacity={struckOn ? 1 : 0.45}>
          <title>{struckTitle}</title>
          <path
            d={`M ${DRUM_MID} ${TOP + BOX_H} V ${FM_MID} H ${RIGHT_X - 6}`}
            fill="none"
            stroke={struckOn ? 'var(--cool)' : 'var(--fg4)'}
            strokeWidth={struckOn ? 1.5 : 1}
            strokeDasharray={struckOn ? undefined : '2 2'}
          />
          <path
            d={`M ${RIGHT_X - 6} ${FM_MID - 3} L ${RIGHT_X} ${FM_MID} L ${RIGHT_X - 6} ${FM_MID + 3}`}
            fill="none"
            stroke={struckOn ? 'var(--cool)' : 'var(--fg4)'}
            strokeWidth={1.5}
          />
          <text
            x={DRUM_MID + 5}
            y={FM_MID - 5}
            className={styles.tag}
            fill={struckOn ? 'var(--fg3)' : 'var(--fg4)'}
          >
            {struckOn ? `${STRUCK[struck]} trig` : 'kit → FM off'}
          </text>
        </g>
      </svg>
      {ROWS.map(def => (
        <ControlSlider key={def.key} def={def} />
      ))}
    </>
  )
}
