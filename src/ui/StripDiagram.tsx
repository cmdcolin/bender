import { ChipDrawing } from './ChipDrawing.tsx'
import { type Track } from './controls/index.ts'
import {
  boxHeight,
  boxWidth,
  useReadings,
  useSelectedBox,
  type BoxSpec,
  card,
} from './diagram.ts'
import { Bend, BoxRows, BoxView, Label, Wire } from './DiagramParts.tsx'

const BOX_H = boxHeight('')
const TOP = 24
const BOTTOM = 66
const MID = TOP + BOX_H / 2
const LOW_MID = BOTTOM + BOX_H / 2
const RETURN_Y = BOTTOM + BOX_H + 12
const W = 48
const STEP = 68
const BUS_W = boxWidth('stereo bus')
const IN_X = 0
const TRIM_X = STEP
const EQ_X = STEP * 2
const FADER_X = STEP * 3
const PAN_X = STEP * 4
const BUS_X = STEP * 5
const LOOP_W = boxWidth('erase · loop')
const LOOP_X = FADER_X
const CUE_X = LOOP_X + LOOP_W + STEP - W
const centre = (x: number) => x + W / 2

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

const CAUTION =
  'record and erase write onto the loops themselves — what goes under the head stays there, worn or not'

// One channel strip drawn as the circuit it is: the path along the top is the
// channel, the path along the bottom is the tape. A box goes accent when its
// knob is off stock and grey when nothing passes through it, and pressing one
// puts its knobs under the drawing — the drawing is the index to the strip's
// rows.
export function StripDiagram({ track }: { track: Track }) {
  const key = (name: Suffix) => `four${track}${name}` as const
  const keys = SUFFIXES.map(key)
  const r = useReadings(keys)
  const pick = useSelectedBox()
  const val = (n: Suffix) => r.value(key(n))
  const touched = (...ns: Suffix[]) => r.touched(...ns.map(key))

  const listens = Math.round(val('In'))
  const recWires = [
    `M${centre(EQ_X)} ${TOP + BOX_H} V${BOTTOM}`,
    `M${EQ_X + W} ${LOW_MID} H${LOOP_X}`,
  ]
  const cueWires = [
    `M${LOOP_X + LOOP_W} ${LOW_MID} H${CUE_X}`,
    `M${centre(CUE_X)} ${BOTTOM} V${(TOP + BOX_H + BOTTOM) / 2} H${centre(PAN_X)} V${TOP + BOX_H}`,
  ]
  const sendWire = `M${centre(FADER_X)} ${TOP} V6`
  const boxes: BoxSpec[] = [
    {
      x: IN_X,
      y: TOP,
      w: W,
      name: 'in',
      touched: touched('In'),
      help: 'What this channel hears. Pick it in the lane.',
    },
    {
      id: 'trim',
      keys: [key('Trim')],
      x: TRIM_X,
      y: TOP,
      w: W,
      name: 'trim',
      off: val('Trim') <= -20,
      touched: touched('Trim'),
      help: 'The preamp.',
    },
    {
      id: 'eq',
      keys: [key('Low'), key('MidHz'), key('Mid'), key('High')],
      x: EQ_X,
      y: TOP,
      w: W,
      name: 'EQ',
      touched: touched('Low', 'MidHz', 'Mid', 'High'),
      help: 'Low shelf, sweepable mid and high shelf, in dB.',
    },
    {
      x: FADER_X,
      y: TOP,
      w: W,
      name: 'fader',
      off: val('Fader') <= 0,
      touched: touched('Fader'),
      help: 'The channel to the stereo bus and the aux send. It is in the lane.',
    },
    {
      id: 'pan',
      keys: [key('Pan')],
      x: PAN_X,
      y: TOP,
      w: W,
      name: 'pan',
      touched: touched('Pan'),
      help: 'Where the channel and the loop’s cue sit across the stereo bus.',
    },
    {
      x: BUS_X,
      y: TOP,
      w: BUS_W,
      name: 'stereo bus',
      touched: false,
      help: 'Layercake’s stereo bus, onto the board’s mix bus.',
    },
    {
      id: 'rec',
      keys: [key('Rec')],
      note: CAUTION,
      x: EQ_X,
      y: BOTTOM,
      w: W,
      name: 'rec',
      off: val('Rec') <= 0,
      touched: touched('Rec'),
      help: 'How much of the channel, after its EQ, the record head lays onto the loop.',
    },
    {
      id: 'loop',
      keys: [key('Erase'), key('Len')],
      note: CAUTION,
      x: LOOP_X,
      y: BOTTOM,
      w: LOOP_W,
      name: 'erase · loop',
      touched: touched('Erase', 'Len'),
      help: 'How much of what is on the loop the erase head takes off while recording, and how long the loop is.',
    },
    {
      id: 'cue',
      keys: [key('Cue')],
      x: CUE_X,
      y: BOTTOM,
      w: W,
      name: 'cue',
      off: val('Cue') <= 0,
      touched: touched('Cue'),
      help: 'The loop’s playback straight to the stereo bus.',
    },
  ]
  const sendBox: BoxSpec = {
    id: 'send',
    keys: [key('Send')],
    x: 0,
    y: 0,
    w: 0,
    name: 'aux send',
    touched: touched('Send'),
    help: 'How much of the channel, after its fader, goes to the aux bus.',
  }
  const open = [...boxes, sendBox].find(b => b.id === pick.selected)
  const recording = val('Rec') > 0 ? 'on' : 'plain'

  return (
    <>
      <ChipDrawing
        width={BUS_X + BUS_W + 2}
        height={RETURN_Y + 4}
        label={`track ${track} signal path`}
      >
        {arrow => (
          <>
            {[IN_X, TRIM_X, EQ_X, FADER_X, PAN_X].map(x => (
              <Wire key={x} arrow={arrow} d={`M${x + W} ${MID} H${x + STEP}`} />
            ))}
            <Bend
              name="rec wires"
              opens="rec"
              pick={pick}
              hit={recWires.join(' ')}
            >
              {recWires.map(d => (
                <Wire key={d} arrow={arrow} d={d} look={recording} />
              ))}
            </Bend>
            <Bend
              name="cue wires"
              opens="cue"
              pick={pick}
              hit={cueWires.join(' ')}
            >
              {cueWires.map(d => (
                <Wire key={d} arrow={arrow} d={d} />
              ))}
            </Bend>
            <Wire
              arrow={arrow}
              d={`M${LOOP_X + LOOP_W / 2} ${BOTTOM + BOX_H} V${RETURN_Y} H${centre(IN_X)} V${TOP + BOX_H}`}
              look={listens === 0 && val('Rec') > 0 ? 'on' : 'dash'}
            />
            <Bend name="aux send wire" opens="send" pick={pick} hit={sendWire}>
              <Wire arrow={arrow} d={sendWire} />
            </Bend>
            <Label
              x={centre(FADER_X) + 6}
              y={13}
              on={val('Send') > 0}
              pick={{
                id: 'send',
                selected: pick.selected === 'send',
                onSelect: pick.toggle,
              }}
            >
              aux send
            </Label>
            {boxes.map(b => (
              <BoxView
                key={b.name}
                box={b}
                selected={b.id === pick.selected}
                onSelect={pick.toggle}
              />
            ))}
          </>
        )}
      </ChipDrawing>
      <BoxRows card={card(pick)} keys={open?.keys} note={open?.note} />
    </>
  )
}
