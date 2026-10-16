import { cabDb, stackDb } from '../dsp/stages/amp'
import { boxHeight, useReadings, useSelectedBox, type BoxSpec } from './diagram'
import styles from './Diagram.module.css'
import { BoxRows, BoxView, Diagram, Label, Wire } from './DiagramParts'

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
] as const

const MID = 36
const RETURN_Y = 8

const PLOT = { left: 30, right: 414, top: 84, bottom: 152 }
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
// the speaker do to the spectrum drawn underneath. Each box reads the knobs it
// stands for, so the knobs have a place on the drawing, and the microphonic
// fault is the wire from the speaker back to the first tube.
export function AmpPathDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const off = r.value('ampMix') <= 0
  const box = (
    x: number,
    w: number,
    name: string,
    value: string | string[],
    help: string,
    keys: (typeof KEYS)[number][],
  ): BoxSpec => ({
    x,
    y: MID - boxHeight(value) / 2,
    w,
    name,
    value,
    off,
    touched: r.touched(...keys),
    help,
    id: name,
    keys,
  })
  const boxes = [
    box(
      0,
      78,
      'preamp',
      [r.read('ampVoice'), `gain ${r.read('ampGain')}`],
      'The gain stages. Each clips its two halves differently, and the Marshall cascades two ahead of the tone stack.',
      ['ampVoice', 'ampGain', 'ampCap', 'ampMicro'],
    ),
    box(
      90,
      96,
      'tone stack',
      `${r.read('ampBass')} ${r.read('ampMid')} ${r.read('ampTreble')}`,
      'The passive network between the stages: bass, mid and treble pots that load each other.',
      ['ampBass', 'ampMid', 'ampTreble'],
    ),
    box(
      198,
      100,
      'power amp',
      [`master ${r.read('ampMaster')}`, `bias ${r.read('ampBias')}`],
      'The push-pull output pair, the supply it sags, and the presence lift in front of it.',
      ['ampMaster', 'ampPresence', 'ampBias', 'ampSag', 'ampTube'],
    ),
    box(
      310,
      96,
      'speaker',
      [r.read('ampCab'), r.read('ampLevel')],
      'The cabinet the output transformer drives, and the level that leaves the amp.',
      ['ampCab', 'ampLevel'],
    ),
  ]
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
  const top = MID - boxHeight(boxes[0]!.value) / 2
  const howling = r.value('ampMicro') > 0
  return (
    <>
      <Diagram width={420} height={176} label="tube amp signal path and tone">
        {arrow => (
          <>
            {[78, 186, 298].map(x => (
              <Wire key={x} arrow={arrow} d={`M${x} ${MID} H${x + 12}`} />
            ))}
            <Wire arrow={arrow} d={`M406 ${MID} H418`} />
            <Wire
              arrow={arrow}
              d={`M358 ${top} V${RETURN_Y} H39 V${top}`}
              look={howling ? 'alarm' : 'dash'}
            />
            <Label x={208} y={RETURN_Y - 1} anchor="middle" on={howling}>
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
                  {String(db)}
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
                {hz >= 1000 ? `${hz / 1000}k` : String(hz)}
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
            <Label x={PLOT.left + 4} y={PLOT.top - 4}>
              tone stack, solid · speaker, dashed
            </Label>
          </>
        )}
      </Diagram>
      <BoxRows keys={open?.keys} />
    </>
  )
}
