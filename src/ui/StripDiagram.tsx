import { type Track } from './controls'
import { useReadings, type BoxSpec } from './diagram'
import { BoxView, Diagram, Label, Wire } from './DiagramParts'

const BOX_H = 28
const TOP = 26
const BOTTOM = 84
const MID = TOP + BOX_H / 2

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
  const key = (name: Suffix) => `four${track}${name}` as const
  const keys = SUFFIXES.map(key)
  const r = useReadings(keys)
  const val = (n: Suffix) => r.value(key(n))
  const read = (n: Suffix) => r.read(key(n))
  const touched = (...ns: Suffix[]) => r.touched(...ns.map(key))

  const listens = Math.round(val('In'))
  const boxes: BoxSpec[] = [
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
      off: val('Trim') <= -20,
      touched: touched('Trim'),
      help: 'The preamp.',
    },
    {
      x: 136,
      y: TOP,
      w: 72,
      name: `EQ · mid ${Math.round(val('MidHz'))}`,
      value: `${signed(val('Low'))}/${signed(val('Mid'))}/${signed(val('High'))}`,
      touched: touched('Low', 'MidHz', 'Mid', 'High'),
      help: 'Low shelf, sweepable mid and high shelf, in dB.',
    },
    {
      x: 222,
      y: TOP,
      w: 54,
      name: 'fader',
      value: read('Fader'),
      off: val('Fader') <= 0,
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
      off: val('Rec') <= 0,
      touched: touched('Rec'),
      help: 'How much of the channel, after its EQ, the record head lays onto the loop.',
    },
    {
      x: 214,
      y: BOTTOM,
      w: 86,
      name: 'erase · loop',
      value: `${read('Erase')} · ${val('Len').toFixed(2)}s`,
      touched: touched('Erase', 'Len'),
      help: 'How much of what is on the loop the erase head takes off while recording, and how long the loop is.',
    },
    {
      x: 314,
      y: BOTTOM,
      w: 54,
      name: 'cue',
      value: read('Cue'),
      off: val('Cue') <= 0,
      touched: touched('Cue'),
      help: 'The loop’s playback straight to the stereo bus.',
    },
  ]

  return (
    <Diagram width={420} height={126} label={`track ${track} signal path`}>
      {arrow => (
        <>
          <Wire arrow={arrow} d={`M54 ${MID} H68`} />
          <Wire arrow={arrow} d={`M122 ${MID} H136`} />
          <Wire arrow={arrow} d={`M208 ${MID} H222`} />
          <Wire arrow={arrow} d={`M276 ${MID} H290`} />
          <Wire arrow={arrow} d={`M344 ${MID} H358`} />
          <Wire
            arrow={arrow}
            d={`M172 ${TOP + BOX_H} V${BOTTOM}`}
            look={val('Rec') > 0 ? 'on' : 'plain'}
          />
          <Wire
            arrow={arrow}
            d={`M200 ${BOTTOM + 14} H214`}
            look={val('Rec') > 0 ? 'on' : 'plain'}
          />
          <Wire arrow={arrow} d={`M300 ${BOTTOM + 14} H314`} />
          <Wire arrow={arrow} d={`M341 ${BOTTOM} V69 H317 V${TOP + BOX_H}`} />
          <Wire
            arrow={arrow}
            d={`M257 ${BOTTOM + BOX_H} V121 H27 V${TOP + BOX_H}`}
            look={listens === 0 && val('Rec') > 0 ? 'on' : 'dash'}
          />
          <Wire arrow={arrow} d={`M249 ${TOP} V10`} />
          <Label x={255} y={13} on={val('Send') > 0}>
            {`send ${read('Send')} → aux bus`}
          </Label>
          {boxes.map(b => (
            <BoxView key={b.name} box={b} />
          ))}
        </>
      )}
    </Diagram>
  )
}
