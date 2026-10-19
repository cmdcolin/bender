import { PATCH_BYTES, REG, AM, VIB } from '../dsp/stages/fmVoices.ts'
import bus from './BusDiagram.module.css'
import chip from './ChipLook.module.css'
import styles from './Diagram.module.css'
import {
  LINE_H,
  ONE_LINE_H,
  useFlow,
  useReadings,
  type BoxPick,
} from './diagram.ts'
import {
  Diagram,
  Plate,
  Pressable,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'
import { GAP, LEAD, OP_W, SPAN_W, WIDTH, X0 } from './fmVoiceSpan.ts'

const KEYS = [
  'fmBright',
  'fmFeedback',
  'fmModRatio',
  'fmModDecay',
  'fmCarRatio',
  'fmLfo',
  'fmEffect',
  'fmVoice',
] as const

type Key = (typeof KEYS)[number]

const FEEDBACK_MAX = 7
const INDEX_BOOST = 4
const LOOP_Y = 14
const CHIP_Y = 28
const CHIP_H = ONE_LINE_H
const MID = CHIP_Y + CHIP_H / 2
const LFO_Y = CHIP_Y + CHIP_H + 18
const LFO_H = ONE_LINE_H
const HEIGHT = LFO_Y + LFO_H + 4

interface Operator {
  name: string
  x: number
  w: number
  touched: boolean
  help: string
}

function OperatorChip({ op, pick }: { op: Operator; pick: BoxPick }) {
  return (
    <Pressable
      name={`zoomed ${op.name}`}
      selected={pick.selected === op.name}
      onSelect={() => pick.toggle(op.name)}
    >
      <title>{`${op.name} — ${op.help}`}</title>
      <Plate
        x={op.x}
        y={CHIP_Y}
        w={op.w}
        h={CHIP_H}
        touched={op.touched}
        selected={pick.selected === op.name}
      />
      <text
        x={op.x + op.w / 2}
        y={CHIP_Y + (CHIP_H + LINE_H) / 2 - 3}
        textAnchor="middle"
        className={op.touched ? styles.nameOn : styles.name}
      >
        {op.name}
      </text>
    </Pressable>
  )
}

// A word on a wire that opens the knob behind it.
function Tag({
  id,
  pick,
  x,
  y,
  anchor,
  className,
  children,
}: {
  id: string
  pick: BoxPick
  x: number
  y: number
  anchor?: 'start' | 'middle' | 'end'
  className: string
  children: string
}) {
  return (
    <Pressable
      name={id}
      selected={pick.selected === id}
      onSelect={() => pick.toggle(id)}
      className={chip.tag}
    >
      <text x={x} y={y} textAnchor={anchor ?? 'start'} className={className}>
        {children}
      </text>
    </Pressable>
  )
}

// The two operators, the feedback round the first, the brightness between them
// and the LFO under both, drawn as the chip wires them and nothing more. Each
// part opens its own knobs; the knobs' values stay in the rows.
export function FmVoiceDiagram({ pick }: { pick: BoxPick }) {
  const r = useReadings(KEYS)
  const read = (key: Key) => Math.round(r.value(key))
  const flow = useFlow('Glint')
  const boosted = read('fmEffect') === 0
  const bright = r.value('fmBright')
  const feedback = read('fmFeedback')
  const patch = PATCH_BYTES[read('fmVoice')] ?? PATCH_BYTES[0]!
  const flags = patch[REG.modFlags]! | patch[REG.carFlags]!
  const lfo = read('fmLfo') | (flags & VIB ? 1 : 0) | (flags & AM ? 2 : 0)
  const indexBoost = boosted && +(INDEX_BOOST ** (bright - 1)).toFixed(1) > 1
  const feedbackBoost = boosted && feedback > FEEDBACK_MAX

  const mod: Operator = {
    name: 'modulator',
    x: X0 + LEAD,
    w: OP_W,
    touched: r.touched('fmBright', 'fmFeedback', 'fmModRatio', 'fmModDecay'),
    help: 'The operator that bends the carrier. It can feed back into itself, and its ratio and decay set the tone.',
  }
  const car: Operator = {
    name: 'carrier',
    x: mod.x + OP_W + GAP,
    w: OP_W,
    touched: r.touched('fmCarRatio', 'fmLfo'),
    help: 'The operator you hear. Its ratio moves the note.',
  }
  const wireMid = (mod.x + mod.w + car.x) / 2
  const loopLook: WireLook = feedbackBoost
    ? 'alarm'
    : feedback > 0
      ? 'on'
      : 'dash'
  const lfoLook: WireLook = lfo > 0 ? 'on' : 'dash'
  const span = car.x + car.w - mod.x

  return (
    <div className={chip.chips}>
      <Diagram width={WIDTH} height={HEIGHT} label="FM operators">
        {arrow => (
          <g opacity={boosted ? 1 : 0.45}>
            <Wire arrow={arrow} d={`M${X0} ${MID} H${mod.x}`} />
            <text x={X0 + 2} y={MID - 5} className={styles.note}>
              patch
            </text>
            <Wire
              arrow={arrow}
              d={`M${mod.x + mod.w} ${MID} H${car.x}`}
              look={indexBoost ? 'alarm' : flow}
            />
            <Tag
              id="brightness"
              pick={pick}
              x={wireMid}
              y={MID - 5}
              anchor="middle"
              className={r.touched('fmBright') ? styles.noteOn! : styles.note!}
            >
              brightness
            </Tag>
            {indexBoost && (
              <text
                x={wireMid}
                y={MID + 14}
                textAnchor="middle"
                className={bus.knifed}
              >
                booster
              </text>
            )}
            <Wire
              arrow={arrow}
              d={`M${car.x + car.w} ${MID} H${X0 + SPAN_W - 2}`}
              look={flow}
            />
            <text
              x={X0 + SPAN_W - 2}
              y={MID + 12}
              textAnchor="end"
              className={styles.note}
            >
              out
            </text>
            <Wire
              arrow={arrow}
              d={`M${mod.x + mod.w - 12} ${CHIP_Y} V${LOOP_Y} H${mod.x + 12} V${CHIP_Y}`}
              look={loopLook}
            />
            <Tag
              id="feedback"
              pick={pick}
              x={mod.x + mod.w / 2}
              y={LOOP_Y - 3}
              anchor="middle"
              className={
                feedbackBoost
                  ? bus.knifed!
                  : feedback > 0
                    ? styles.noteOn!
                    : styles.note!
              }
            >
              feedback
            </Tag>
            {[mod, car].map(op => (
              <Wire
                key={op.name}
                arrow={arrow}
                d={`M${op.x + op.w / 2} ${LFO_Y} V${CHIP_Y + CHIP_H}`}
                look={lfoLook}
              />
            ))}
            <Pressable
              name="LFO"
              selected={pick.selected === 'lfo'}
              onSelect={() => pick.toggle('lfo')}
            >
              <title>
                LFO — The die’s one LFO, soldered to the operators for vibrato,
                tremolo or both.
              </title>
              <Plate
                x={mod.x}
                y={LFO_Y}
                w={span}
                h={LFO_H}
                touched={lfo > 0}
                selected={pick.selected === 'lfo'}
              />
              <text
                x={mod.x + span / 2}
                y={LFO_Y + LFO_H - 6}
                textAnchor="middle"
                className={lfo > 0 ? styles.nameOn : styles.name}
              >
                LFO
              </text>
            </Pressable>
            <OperatorChip op={mod} pick={pick} />
            <OperatorChip op={car} pick={pick} />
          </g>
        )}
      </Diagram>
    </div>
  )
}
