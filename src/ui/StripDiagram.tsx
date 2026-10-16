import { useId } from 'react'

import { DEFAULT_CONTROLS } from '../controls'
import { sliderFor, type Track } from './controls'
import { useBoardValue } from './ControlsContext'
import { formatValue } from './slider-scale'
import styles from './StripDiagram.module.css'

const BOX_H = 28
const TOP = 26
const BOTTOM = 84
const MID = TOP + BOX_H / 2

interface Box {
  x: number
  y: number
  w: number
  name: string
  value: string
  off?: boolean
  touched: boolean
  help: string
}

const SUFFIXES = [
  'In',
  'Trim',
  'Low',
  'MidHz',
  'Mid',
  'High',
  'Send',
  'Pan',
  'Fader',
  'Rec',
  'Erase',
  'Cue',
  'Len',
] as const
type Suffix = (typeof SUFFIXES)[number]

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

// One channel strip drawn as the circuit it is, with every box reading what its
// knob says: the path along the top is the channel, the path along the bottom is
// the tape, and the knobs that sit in the fold under it are the boxes. A box
// goes accent when its knob is off stock and grey when nothing passes through
// it, so the picture answers "why can't I hear this" before the rows do.
export function StripDiagram({ track }: { track: Track }) {
  const arrow = useId()
  const key = (name: Suffix) => `four${track}${name}` as const
  const joined = useBoardValue(c => SUFFIXES.map(n => c[key(n)]).join('|'))
  const v = Object.fromEntries(
    joined.split('|').map((x, i) => [SUFFIXES[i]!, Number(x)]),
  )
  const read = (name: Suffix) => formatValue(sliderFor(key(name)), v[name]!)
  const touched = (...ns: Suffix[]) =>
    ns.some(n => v[n] !== DEFAULT_CONTROLS[key(n)])

  const listens = Math.round(v.In!)
  const boxes: Box[] = [
    {
      x: 0,
      y: TOP,
      w: 54,
      name: 'in',
      value: read('In'),
      touched: touched('In'),
      help: 'What this channel hears: its own loop, the board, the mic or the desk’s aux return.',
    },
    {
      x: 68,
      y: TOP,
      w: 54,
      name: 'trim',
      value: read('Trim'),
      off: v.Trim! <= -20,
      touched: touched('Trim'),
      help: 'The preamp.',
    },
    {
      x: 136,
      y: TOP,
      w: 72,
      name: `EQ · mid ${Math.round(v.MidHz!)}`,
      value: `${signed(v.Low!)}/${signed(v.Mid!)}/${signed(v.High!)}`,
      touched: touched('Low', 'MidHz', 'Mid', 'High'),
      help: 'Low shelf, sweepable mid and high shelf, in dB.',
    },
    {
      x: 222,
      y: TOP,
      w: 54,
      name: 'fader',
      value: read('Fader'),
      off: v.Fader! <= 0,
      touched: touched('Fader'),
      help: 'The channel to the stereo bus and the aux send.',
    },
    {
      x: 290,
      y: TOP,
      w: 54,
      name: 'pan',
      value: read('Pan'),
      touched: touched('Pan'),
      help: 'Where the channel and the loop’s cue sit across the stereo bus.',
    },
    {
      x: 358,
      y: TOP,
      w: 62,
      name: 'bus',
      value: 'stereo',
      touched: false,
      help: 'The four-track’s stereo bus, onto the board’s mix bus.',
    },
    {
      x: 144,
      y: BOTTOM,
      w: 56,
      name: 'rec',
      value: read('Rec'),
      off: v.Rec! <= 0,
      touched: touched('Rec'),
      help: 'How much of the channel, after its EQ, the record head lays onto the loop.',
    },
    {
      x: 214,
      y: BOTTOM,
      w: 86,
      name: 'erase · loop',
      value: `${read('Erase')} · ${v.Len!.toFixed(2)}s`,
      touched: touched('Erase', 'Len'),
      help: 'How much of what is on the loop the erase head takes off while recording, and how long the loop is.',
    },
    {
      x: 314,
      y: BOTTOM,
      w: 54,
      name: 'cue',
      value: read('Cue'),
      off: v.Cue! <= 0,
      touched: touched('Cue'),
      help: 'The loop’s playback straight to the stereo bus.',
    },
  ]

  const wire = (d: string, on = false, dashed = false) => (
    <path
      key={d}
      d={d}
      className={on ? styles.wireOn : dashed ? styles.wireDash : styles.wire}
      markerEnd={`url(#${arrow})`}
    />
  )

  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 420 126"
      role="img"
      aria-label={`track ${track} signal path`}
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
      {wire(`M54 ${MID} H68`)}
      {wire(`M122 ${MID} H136`)}
      {wire(`M208 ${MID} H222`)}
      {wire(`M276 ${MID} H290`)}
      {wire(`M344 ${MID} H358`)}
      {wire(`M172 ${TOP + BOX_H} V${BOTTOM}`, v.Rec! > 0)}
      {wire(`M200 ${BOTTOM + 14} H214`, v.Rec! > 0)}
      {wire(`M300 ${BOTTOM + 14} H314`)}
      {wire(`M341 ${BOTTOM} V69 H317 V${TOP + BOX_H}`)}
      {wire(
        `M257 ${BOTTOM + BOX_H} V121 H27 V${TOP + BOX_H}`,
        listens === 0 && v.Rec! > 0,
        true,
      )}
      <path
        d={`M249 ${TOP} V10`}
        className={styles.wire}
        markerEnd={`url(#${arrow})`}
      />
      <text
        x={255}
        y={13}
        className={v.Send! > 0 ? styles.sendOn : styles.send}
      >
        {`send ${read('Send')} → aux bus`}
      </text>
      {boxes.map(b => (
        <g key={b.name} opacity={b.off ? 0.55 : 1}>
          <title>{`${b.name} — ${b.help}`}</title>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={BOX_H}
            rx={3}
            className={b.touched ? styles.boxOn : styles.box}
          />
          <text
            x={b.x + b.w / 2}
            y={b.y + 11}
            textAnchor="middle"
            className={styles.name}
          >
            {b.name}
          </text>
          <text
            x={b.x + b.w / 2}
            y={b.y + 22}
            textAnchor="middle"
            className={b.touched ? styles.valueOn : styles.value}
          >
            {b.value}
          </text>
        </g>
      ))}
    </svg>
  )
}
