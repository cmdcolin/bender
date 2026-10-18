import { PATCH_BYTES, REG, AM, VIB } from '../dsp/stages/fmVoices.ts'
import { engine } from '../engine/engine.ts'
import bus from './BusDiagram.module.css'
import chip from './ChipLook.module.css'
import { CHANNELS, sliderFor } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import styles from './Diagram.module.css'
import { boxHeight, boxWidth, LINE_H, useReadings } from './diagram.ts'
import { Diagram, Label, Wire, type WireLook } from './DiagramParts.tsx'

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

const RATIOS = sliderFor('fmModRatio').choices!
const DECAYS = sliderFor('fmModDecay').choices!
const LFOS = sliderFor('fmLfo').choices!

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
  help: string
}

function OperatorChip({ op }: { op: Operator }) {
  const top = CHIP_Y + (CHIP_H - LINE_H * (op.notes.length + 1)) / 2
  const line = (i: number) => top + LINE_H * (i + 1) - 3
  return (
    <g>
      <title>{`${op.name} — ${op.help}`}</title>
      <rect
        x={op.x}
        y={CHIP_Y}
        width={op.w}
        height={CHIP_H}
        rx={3}
        className={bus.chip}
      />
      <text
        x={op.x + op.w / 2}
        y={line(0)}
        textAnchor="middle"
        className={bus.chipName}
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
    </g>
  )
}

export function FmVoiceDiagram() {
  const r = useReadings(KEYS)
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
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
  const indexBoost = +(
    boosted && bright > 1 ? INDEX_BOOST ** (bright - 1) : 1
  ).toFixed(1)
  const feedbackBoost =
    boosted && feedback > FEEDBACK_MAX ? 2 ** (feedback - FEEDBACK_MAX) : 1

  const w = boxWidth('ratio as patched')
  const gap = WIDTH - LEAD - TAIL - 2 * w
  const note = (text: string, key: (typeof KEYS)[number]) =>
    [text, read(key) > 0] as [string, boolean]
  const mod: Operator = {
    name: 'modulator',
    x: LEAD,
    w,
    notes: [
      note(`ratio ${RATIOS[read('fmModRatio')]}`, 'fmModRatio'),
      note(`decay ${DECAYS[read('fmModDecay')]}`, 'fmModDecay'),
    ],
    help: 'The operator that bends the carrier. It can feed back into itself, and its ratio and decay set the tone.',
  }
  const car: Operator = {
    name: 'carrier',
    x: LEAD + w + gap,
    w,
    notes: [note(`ratio ${RATIOS[read('fmCarRatio')]}`, 'fmCarRatio')],
    help: 'The operator you hear. Its ratio moves the note.',
  }
  const wireMid = (mod.x + mod.w + car.x) / 2
  const loopLook: WireLook =
    feedbackBoost > 1 ? 'alarm' : feedback > 0 ? 'on' : 'dash'
  const lfoLook: WireLook = lfo > 0 ? 'on' : 'dash'
  const shown = boosted ? feedback : Math.min(feedback, FEEDBACK_MAX)
  const loopSay = `feedback ${shown}${feedbackBoost > 1 ? ` ×${feedbackBoost}` : ''}`
  const span = car.x + car.w - mod.x

  return (
    <div className={chip.chips}>
      <Diagram width={WIDTH} height={HEIGHT} label="FM operators">
        {arrow => (
          <g opacity={boosted ? 1 : 0.45}>
            <Wire arrow={arrow} d={`M0 ${MID} H${mod.x}`} />
            <Label x={2} y={MID - 5}>
              patch
            </Label>
            <Wire
              arrow={arrow}
              d={`M${mod.x + mod.w} ${MID} H${car.x}`}
              look={indexBoost > 1 ? 'alarm' : flow}
            />
            <Label
              x={wireMid}
              y={MID - 5}
              anchor="middle"
              on={r.touched('fmBright')}
            >
              {`brightness ${bright.toFixed(2)}`}
            </Label>
            {indexBoost > 1 && (
              <text
                x={wireMid}
                y={MID + 14}
                textAnchor="middle"
                className={bus.knifed}
              >
                {`booster ×${indexBoost}`}
              </text>
            )}
            <Wire
              arrow={arrow}
              d={`M${car.x + car.w} ${MID} H${WIDTH - 2}`}
              look={flow}
            />
            <Label x={WIDTH - 2} y={MID + 12} anchor="end">
              out
            </Label>
            <Wire
              arrow={arrow}
              d={`M${mod.x + mod.w - 12} ${CHIP_Y} V${LOOP_Y} H${mod.x + 12} V${CHIP_Y}`}
              look={loopLook}
            />
            <text
              x={mod.x + mod.w / 2}
              y={LOOP_Y - 3}
              textAnchor="middle"
              className={
                feedbackBoost > 1
                  ? bus.knifed
                  : feedback > 0
                    ? styles.noteOn
                    : styles.note
              }
            >
              {loopSay}
            </text>
            {[mod, car].map(op => (
              <Wire
                key={op.name}
                arrow={arrow}
                d={`M${op.x + op.w / 2} ${LFO_Y} V${CHIP_Y + CHIP_H}`}
                look={lfoLook}
              />
            ))}
            <g>
              <title>
                LFO — The die’s one LFO, soldered to the operators for vibrato,
                tremolo or both.
              </title>
              <rect
                x={mod.x}
                y={LFO_Y}
                width={span}
                height={LFO_H}
                rx={3}
                className={bus.chip}
              />
              <text
                x={mod.x + span / 2}
                y={LFO_Y + LFO_H - 6}
                textAnchor="middle"
                className={lfo > 0 ? styles.nameOn : styles.name}
              >
                {`LFO ${LFOS[lfo]}`}
              </text>
            </g>
            <OperatorChip op={mod} />
            <OperatorChip op={car} />
          </g>
        )}
      </Diagram>
    </div>
  )
}
