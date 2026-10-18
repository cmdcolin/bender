import { sliderFor } from './controls/index.ts'
import {
  boxHeight,
  useReadings,
  useSelectedBox,
  type BoxSpec,
} from './diagram.ts'
import { BoxRows, BoxView, Diagram, Label, Wire } from './DiagramParts.tsx'
import styles from './FeedbackLoops.module.css'

const DEST = sliderFor('fbDest').choices!

const STRIPS = [
  { amt: 'fbAmt', ms: 'fbDelayMs', tone: 'fbTone' },
  { amt: 'fb2Amt', ms: 'fb2Ms', tone: 'fb2Tone' },
  { amt: 'fb3Amt', ms: 'fb3Ms', tone: 'fb3Tone' },
] as const

const AMPS = ['fbRails', 'fbAsym', 'fbSlew', 'fbSag', 'fbBlock'] as const

const KEYS = [
  ...STRIPS.flatMap(s => [s.amt, s.ms, s.tone]),
  ...AMPS,
  'fbDest',
  'fbCross',
] as const

const BOX_X = 8
const TAP_X = -16
const BOX_W = 64
const ROW_Y = [6, 52, 98]
const BUS_X = 150
const AMPS_X = 166
const AMPS_W = 62
const DEST_X = 248
const DEST_W = 92
const HEIGHT = 150

const rowMid = (i: number) => ROW_Y[i]! + boxHeight(['', '']) / 2
const MID = rowMid(1)

const bend = (from: number, to: number, reach: number) =>
  `M${BOX_X} ${rowMid(from)} Q${BOX_X - reach} ${(rowMid(from) + rowMid(to)) / 2} ${BOX_X} ${rowMid(to)}`

// Three sends off one tap, each through its own delay, meeting on one bus that
// runs through the return amps into wherever the return is patched. Each box
// reads its knobs and opens them under the drawing; strip 1 starts open since
// it carries the loop. Cross is drawn once a second strip is up, as the dashed
// leads between neighbours.
export function FeedbackLoops() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox('strip 1')
  const crossed = r.value('fb2Amt') > 0 || r.value('fb3Amt') > 0
  const flow = STRIPS.some(s => r.value(s.amt) > 0) ? 'on' : 'plain'

  const strips: BoxSpec[] = STRIPS.map((s, i) => ({
    id: `strip ${i + 1}`,
    keys: [s.amt, s.ms, s.tone],
    x: BOX_X,
    y: ROW_Y[i]!,
    w: BOX_W,
    name: `strip ${i + 1}`,
    value: [`amt ${r.read(s.amt)}`, r.read(s.ms)],
    off: r.value(s.amt) <= 0,
    touched: r.touched(s.amt, s.ms, s.tone),
    lit: [r.touched(s.amt), r.touched(s.ms)],
    help: 'One send off the tap, through its own delay, onto the bus.',
  }))
  const moved = AMPS.filter(k => r.touched(k)).length
  const amps: BoxSpec = {
    id: 'return amps',
    keys: AMPS,
    x: AMPS_X,
    y: MID - boxHeight('') / 2,
    w: AMPS_W,
    name: 'return amps',
    value: moved ? `${moved} moved` : 'stock',
    touched: moved > 0,
    help: 'The amps the bus runs through: how they clip, slow down, sag and block.',
  }
  const dest: BoxSpec = {
    id: 'patched into',
    keys: ['fbDest'],
    x: DEST_X,
    y: MID - boxHeight('') / 2,
    w: DEST_W,
    name: 'patched into',
    value: DEST[Math.round(r.value('fbDest'))]!,
    touched: r.touched('fbDest'),
    help: 'Where the return wire is soldered.',
  }
  const boxes = [...strips, amps, dest]
  const open =
    pick.selected === 'cross'
      ? crossed
        ? (['fbCross'] as const)
        : undefined
      : boxes.find(b => b.id === pick.selected)?.keys
  const arcStyle = { opacity: 0.25 + r.value('fbCross') * 0.6 }

  return (
    <>
      <Diagram
        left={52}
        width={392}
        height={HEIGHT}
        label="feedback bus signal path"
      >
        {arrow => (
          <>
            {STRIPS.map((s, i) => {
              const look = r.value(s.amt) > 0 ? 'on' : 'plain'
              return (
                <g key={s.amt}>
                  <Wire d={`M${TAP_X} ${rowMid(i)} H${BOX_X}`} arrow={arrow} />
                  <Wire
                    d={`M${BOX_X + BOX_W} ${rowMid(i)} H${BUS_X}`}
                    look={look}
                  />
                </g>
              )
            })}
            <Wire d={`M${BUS_X} ${rowMid(0)} V${rowMid(2)}`} />
            <Wire d={`M${TAP_X} ${rowMid(0)} V${rowMid(2)}`} />
            <Label x={TAP_X} y={rowMid(0) - 6} anchor="middle">
              tap
            </Label>
            <Wire d={`M${BUS_X} ${MID} H${AMPS_X}`} arrow={arrow} look={flow} />
            <Wire
              d={`M${AMPS_X + AMPS_W} ${MID} H${DEST_X}`}
              arrow={arrow}
              look={flow}
            />
            {boxes.map(b => (
              <BoxView
                key={b.id}
                box={b}
                selected={b.id === pick.selected}
                onSelect={pick.toggle}
              />
            ))}
            {crossed && (
              <>
                <path
                  d={bend(0, 1, 20)}
                  className={styles.cross}
                  style={arcStyle}
                />
                <path
                  d={bend(1, 2, 20)}
                  className={styles.cross}
                  style={arcStyle}
                />
                <path
                  d={bend(2, 0, 34)}
                  className={styles.cross}
                  style={arcStyle}
                />
                <Label
                  x={-50}
                  y={MID + 3}
                  on={r.touched('fbCross')}
                  pick={{
                    id: 'cross',
                    selected: pick.selected === 'cross',
                    onSelect: pick.toggle,
                  }}
                >
                  cross
                </Label>
              </>
            )}
          </>
        )}
      </Diagram>
      <BoxRows keys={open} />
    </>
  )
}
