import { cabDb, stackDb } from '../dsp/stages/amp.ts'
import chip from './ChipLook.module.css'
import styles from './Diagram.module.css'
import {
  boxHeight,
  boxWidth,
  useReadings,
  useSelectedBox,
  type BoxSpec,
  card,
} from './diagram.ts'
import { BoxRows, BoxView, Diagram, Label, Wire } from './DiagramParts.tsx'

const KEYS = [
  'ampMix',
  'ampVoice',
  'ampGain',
  'ampBass',
  'ampMid',
  'ampTreble',
  'ampMaster',
  'ampPresence',
  'ampSag',
  'ampBias',
  'ampCab',
  'ampLevel',
  'ampCap',
  'ampTube',
  'ampMicro',
  'ampMute',
] as const

const WIDTH = 420
const MID = 36
const RETURN_Y = 11

const PLOT = { left: 30, right: 414, top: 68, bottom: 136 }
const DB = { top: 6, bottom: -36 }
const HZ = { low: 40, high: 12000 }
const POINTS = 64

const plotX = (hz: number) =>
  PLOT.left +
  ((PLOT.right - PLOT.left) * Math.log(hz / HZ.low)) /
    Math.log(HZ.high / HZ.low)
const plotY = (db: number) =>
  PLOT.top +
  ((PLOT.bottom - PLOT.top) *
    (DB.top - Math.min(Math.max(db, DB.bottom), DB.top))) /
    (DB.top - DB.bottom)

function curve(at: (hz: number) => number): string {
  return Array.from({ length: POINTS }, (_, i) => {
    const hz = HZ.low * Math.pow(HZ.high / HZ.low, i / (POINTS - 1))
    return `${i === 0 ? 'M' : 'L'}${plotX(hz).toFixed(1)} ${plotY(at(hz)).toFixed(1)}`
  }).join(' ')
}

// The amp as the path the board takes through it, with what the tone stack and
// the speaker do to the spectrum drawn underneath. The microphonic fault is the
// wire from the speaker back to the first tube.
export function AmpPathDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const off = r.value('ampMix') <= 0 || r.value('ampMute') > 0
  const stages: [string, string, (typeof KEYS)[number][]][] = [
    [
      'preamp',
      'The gain stages. Each clips its two halves differently, and the Marshall cascades two ahead of the tone stack.',
      ['ampVoice', 'ampGain', 'ampCap', 'ampMicro'],
    ],
    [
      'tone stack',
      'The passive network between the stages: bass, mid and treble pots that load each other.',
      ['ampBass', 'ampMid', 'ampTreble'],
    ],
    [
      'power amp',
      'The push-pull output pair, the supply it sags, and the presence lift in front of it.',
      ['ampMaster', 'ampPresence', 'ampBias', 'ampSag', 'ampTube'],
    ],
    [
      'speaker',
      'The cabinet the output transformer drives, and the level that leaves the amp.',
      ['ampCab', 'ampLevel'],
    ],
  ]
  const boxW = Math.max(...stages.map(([name]) => boxWidth(name)))
  const step = (WIDTH - 14 - boxW) / (stages.length - 1)
  const boxes = stages.map(([name, help, keys], i): BoxSpec => ({
    x: Math.round(i * step),
    y: MID - boxHeight(name) / 2,
    w: boxW,
    name,
    off,
    touched: r.touched(...keys),
    help,
    id: name,
    keys,
  }))
  const voice = Math.round(r.value('ampVoice'))
  const cab = Math.round(r.value('ampCab'))
  const stack = (hz: number) =>
    stackDb(
      voice,
      r.value('ampTreble'),
      r.value('ampMid'),
      r.value('ampBass'),
      hz,
    )
  const open = boxes.find(b => b.id === pick.selected)
  const loudest = Array.from(
    { length: POINTS },
    (_, i) => HZ.low * Math.pow(HZ.high / HZ.low, i / (POINTS - 1)),
  ).reduce((best, hz) => (cabDb(cab, hz) > cabDb(cab, best) ? hz : best))
  const top = boxes[0]!.y
  const speaker = boxes[3]!
  const howling = r.value('ampMicro') > 0
  return (
    <>
      <div className={chip.chips}>
        <Diagram
          width={WIDTH}
          height={PLOT.bottom + 18}
          label="ember signal path and tone"
        >
          {arrow => (
            <>
              {boxes.map((b, i) => (
                <Wire
                  key={b.name}
                  arrow={arrow}
                  d={`M${b.x + b.w} ${MID} H${boxes[i + 1]?.x ?? WIDTH - 2}`}
                  look={off ? 'plain' : 'on'}
                />
              ))}
              <Wire
                arrow={arrow}
                d={`M${speaker.x + speaker.w / 2} ${top} V${RETURN_Y} H${boxW / 2} V${top}`}
                look={howling ? 'alarm' : 'dash'}
              />
              <Label
                x={WIDTH / 2}
                y={RETURN_Y - 1}
                anchor="middle"
                on={howling}
              >
                microphonic return
              </Label>
              {boxes.map(b => (
                <BoxView
                  key={b.name}
                  box={b}
                  selected={b.id === pick.selected}
                  onSelect={pick.toggle}
                />
              ))}
              {[0, -12, -24].map(db => (
                <g key={db}>
                  <line
                    x1={PLOT.left}
                    x2={PLOT.right}
                    y1={plotY(db)}
                    y2={plotY(db)}
                    className={styles.grid}
                  />
                  <Label x={PLOT.left - 4} y={plotY(db) + 3} anchor="end">
                    {db === 0 ? '0 dB' : String(db)}
                  </Label>
                </g>
              ))}
              {[100, 1000, 10000].map(hz => (
                <Label
                  key={hz}
                  x={plotX(hz)}
                  y={PLOT.bottom + 12}
                  anchor="middle"
                >
                  {hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}
                </Label>
              ))}
              <path
                d={curve(hz => cabDb(cab, hz))}
                className={styles.curveQuiet}
              />
              <path
                d={curve(stack)}
                className={
                  r.touched('ampBass', 'ampMid', 'ampTreble', 'ampVoice')
                    ? styles.curveOn
                    : styles.curve
                }
                opacity={off ? 0.55 : 1}
              />
              <Label x={PLOT.right} y={plotY(stack(HZ.high)) - 4} anchor="end">
                tone stack
              </Label>
              <Label
                x={Math.min(
                  Math.max(plotX(loudest), PLOT.left + 24),
                  PLOT.right - 90,
                )}
                y={plotY(cabDb(cab, loudest)) - 4}
                anchor="middle"
              >
                speaker
              </Label>
            </>
          )}
        </Diagram>
      </div>
      <BoxRows card={card(pick)} keys={open?.keys} />
    </>
  )
}
