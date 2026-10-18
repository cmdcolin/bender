import { PATCH_BYTES, REG, AM, VIB } from '../dsp/stages/fmVoices.ts'
import { engine } from '../engine/engine.ts'
import bus from './BusDiagram.module.css'
import chip from './ChipLook.module.css'
import { CHANNELS } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import styles from './Diagram.module.css'
import {
  boxHeight,
  boxWidth,
  LINE_H,
  useReadings,
  type useSelectedBox,
} from './diagram.ts'
import {
  Diagram,
  Plate,
  Pressable,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'

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

const FM_TAP = CHANNELS.find(c => c.name === 'FM chip')!.tap

const FEEDBACK_MAX = 7
const INDEX_BOOST = 4
const WIDTH = 420
const LEAD = 48
const TAIL = 40
const LOOP_Y = 14
const CHIP_Y = 28
const CHIP_H = boxHeight('a\nb\nc')
const MID = CHIP_Y + CHIP_H / 2
const LFO_Y = CHIP_Y + CHIP_H + 18
const LFO_H = boxHeight('')
const HEIGHT = LFO_Y + LFO_H + 4

interface Operator {
  name: string
  x: number
  w: number
  notes: [text: string, moved: boolean][]
  touched: boolean
  help: string
}

type Pick = ReturnType<typeof useSelectedBox>

function OperatorChip({ op, pick }: { op: Operator; pick: Pick }) {
  const top = CHIP_Y + (CHIP_H - LINE_H * (op.notes.length + 1)) / 2
  const line = (i: number) => top + LINE_H * (i + 1) - 3
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
        y={line(0)}
        textAnchor="middle"
        className={op.touched ? styles.nameOn : styles.name}
      >
        {op.name}
      </text>
      {op.notes.map(([text, moved], i) => (
        <text
          key={text}
          x={op.x + op.w / 2}
          y={line(i + 1)}
          textAnchor="middle"
          className={moved ? styles.noteOn : styles.note}
        >
          {text}
        </text>
      ))}
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
  pick: Pick
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
export function FmVoiceDiagram({ pick }: { pick: Pick }) {
  const r = useReadings(KEYS)
  const read = (key: Key) => Math.round(r.value(key))
  const flow: WireLook = useStoreSelect(
    engine.sounding,
    lit => lit & (1 << FM_TAP),
  )
    ? 'on'
    : 'plain'
  const boosted = read('fmEffect') === 0
  const bright = r.value('fmBright')
  const feedback = read('fmFeedback')
  const patch = PATCH_BYTES[read('fmVoice')] ?? PATCH_BYTES[0]!
  const flags = patch[REG.modFlags]! | patch[REG.carFlags]!
  const lfo = read('fmLfo') | (flags & VIB ? 1 : 0) | (flags & AM ? 2 : 0)
  const indexBoost = boosted && +(INDEX_BOOST ** (bright - 1)).toFixed(1) > 1
  const feedbackBoost = boosted && feedback > FEEDBACK_MAX

  const w = boxWidth('modulator')
  const gap = WIDTH - LEAD - TAIL - 2 * w
  const note = (text: string, key: Key) =>
    [text, read(key) > 0] as [string, boolean]
  const mod: Operator = {
    name: 'modulator',
    x: LEAD,
    w,
    notes: [note('ratio', 'fmModRatio'), note('decay', 'fmModDecay')],
    touched: r.touched('fmBright', 'fmFeedback', 'fmModRatio', 'fmModDecay'),
    help: 'The operator that bends the carrier. It can feed back into itself, and its ratio and decay set the tone.',
  }
  const car: Operator = {
    name: 'carrier',
    x: LEAD + w + gap,
    w,
    notes: [note('ratio', 'fmCarRatio')],
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
            <Wire arrow={arrow} d={`M0 ${MID} H${mod.x}`} />
            <text x={2} y={MID - 5} className={styles.note}>
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
              d={`M${car.x + car.w} ${MID} H${WIDTH - 2}`}
              look={flow}
            />
            <text
              x={WIDTH - 2}
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
