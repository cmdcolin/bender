import { HEAD_CHOICES } from '../dsp/stages/tapeDelay.ts'
import chip from './ChipLook.module.css'
import styles from './Diagram.module.css'
import {
  boxHeight,
  boxWidth,
  useReadings,
  useSelectedBox,
  card,
} from './diagram.ts'
import {
  BoxRows,
  BoxView,
  Capstan,
  Diagram,
  Label,
  Pressable,
  TapeLine,
  Wire,
} from './DiagramParts.tsx'

const KEYS = [
  'dlySend',
  'dlyHeads',
  'dlyFb',
  'dlyToneHz',
  'dlyLoopMode',
  'dlyRing',
  'dlyMix',
  'wowDepthMs',
  'wowHz',
  'flutter',
  'tapeBrake',
  'tapeMotorRail',
  'dlySplice',
  'dlyErase',
  'dlyLoopHz',
  'dlyLoopRes',
  'dlyLamp',
  'dlyLampS',
  'dlyRingHz',
  'dlyMute',
] as const

// What each part of the drawing opens onto. Time, Feedback and the echo level
// are rows of their own, since they are what the pedal is turned with.
const OPENS = {
  send: ['dlySend'],
  heads: ['dlyHeads'],
  loop: [
    'dlyToneHz',
    'dlyLoopMode',
    'dlyLoopHz',
    'dlyLoopRes',
    'dlyLamp',
    'dlyLampS',
    'dlyRingHz',
    'dlyRing',
  ],
  transport: [
    'wowDepthMs',
    'wowHz',
    'flutter',
    'tapeBrake',
    'tapeMotorRail',
    'dlySplice',
    'dlyErase',
  ],
} as const

const WIDTH = 420
const HEIGHT = 84
const FEEDBACK_Y = 7
const AXIS_Y = 24
const TAPE_Y = 44
const TAPE_BOTTOM = 66
const LOOP_LEFT = 90
const LOOP_RIGHT = 320
const REC_X = 130
const HEAD_GAP = 50
const HEAD = 10
const CAPSTAN_X = 310
const JOIN_X = 96
const INSIDE_Y = 59
const PICKS_Y = 80
const OUT_X = 416
const FEEDBACK_GAP = 50

const headX = (n: number) => REC_X + HEAD_GAP * n

const SEND_W = boxWidth('send')
const TONE_W = boxWidth('tone')
const BOX_TOP = AXIS_Y - boxHeight('send') / 2
const TONE_X = 326
const TONE_MID = TONE_X + TONE_W / 2
const FEEDBACK_MID = (JOIN_X + TONE_MID) / 2

const ROUND = (TAPE_BOTTOM - TAPE_Y) / 2
const LOOP = [
  `M${LOOP_LEFT} ${TAPE_Y}`,
  `H${LOOP_RIGHT}`,
  `A${ROUND} ${ROUND} 0 0 1 ${LOOP_RIGHT} ${TAPE_BOTTOM}`,
  `H${LOOP_LEFT}`,
  `A${ROUND} ${ROUND} 0 0 1 ${LOOP_LEFT} ${TAPE_Y}`,
  'Z',
].join(' ')

function Head({ x, on }: { x: number; on: boolean }) {
  const inset = on ? 0 : 0.5
  return (
    <rect
      x={x - HEAD / 2 + inset}
      y={TAPE_Y - HEAD + inset}
      width={HEAD - 2 * inset}
      height={HEAD - 2 * inset}
      rx={2}
      className={on ? styles.gapOn : styles.headOff}
    />
  )
}

// One line of signal drawn over the tape loop. The send runs into the record
// head; the lit play heads sum onto a bus, through the tone box, and out as the
// echo. Feedback leaves the tone box too and runs back over the top into the
// send, so no wire crosses the tape. A wire lights while its signal reaches the
// output, and past unity the feedback goes red and dashed. The tape lights from
// the record head to the last lit play head while signal flows.
export function TapeLoopDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const choice = HEAD_CHOICES[Math.round(r.value('dlyHeads'))] ?? '1'
  const lit = [1, 2, 3].filter(n => choice.includes(String(n)))
  const first = Math.min(...lit)
  const last = Math.max(...lit)
  const fb = r.value('dlyFb')
  const flowing = r.value('dlySend') > 0 && r.value('dlyMute') <= 0
  const flow = flowing ? 'on' : 'plain'
  const returning = fb > 1 ? 'alarm' : fb > 0 && flowing ? 'on' : 'dash'
  const pickOf = (id: keyof typeof OPENS) => ({
    name: id,
    selected: pick.selected === id,
    onSelect: () => pick.toggle(id),
    className: pick.selected === id ? styles.pickedLabel : '',
  })
  return (
    <>
      <div className={chip.chips}>
        <Diagram width={WIDTH} height={HEIGHT} label="wraith signal path">
          {arrow => (
            <>
              <Wire
                d={`M${TONE_MID} ${BOX_TOP} V${FEEDBACK_Y} H${FEEDBACK_MID + FEEDBACK_GAP / 2}`}
                look={returning}
              />
              <Wire
                arrow={arrow}
                d={`M${FEEDBACK_MID - FEEDBACK_GAP / 2} ${FEEDBACK_Y} H${JOIN_X} V${AXIS_Y - 1}`}
                look={returning}
              />
              <Label
                x={FEEDBACK_MID}
                y={FEEDBACK_Y + 3}
                anchor="middle"
                on={r.touched('dlyFb')}
              >
                feedback
              </Label>
              <BoxView
                selected={pick.selected === 'send'}
                onSelect={pick.toggle}
                box={{
                  id: 'send',
                  keys: OPENS.send,
                  x: 4,
                  y: BOX_TOP,
                  w: SEND_W,
                  name: 'send',
                  off: !flowing,
                  touched: r.touched('dlySend'),
                  help: 'How much of the whole board goes onto the tape.',
                }}
              />
              <Wire
                arrow={arrow}
                d={`M${4 + SEND_W} ${AXIS_Y} H${REC_X} V${TAPE_Y - HEAD - 1}`}
                look={flow}
              />
              {lit.map(n => (
                <Wire
                  key={n}
                  d={`M${headX(n)} ${TAPE_Y - HEAD} V${AXIS_Y}`}
                  look={flow}
                />
              ))}
              <Wire
                arrow={arrow}
                d={`M${headX(first)} ${AXIS_Y} H${TONE_X - 1}`}
                look={flow}
              />
              <BoxView
                selected={pick.selected === 'loop'}
                onSelect={pick.toggle}
                box={{
                  id: 'loop',
                  keys: OPENS.loop,
                  x: TONE_X,
                  y: BOX_TOP,
                  w: TONE_W,
                  name: 'tone',
                  off: !flowing,
                  touched: r.touched(...OPENS.loop),
                  help: 'What every repeat passes through on its way out and back round: tone, the loop filter, the ring modulator and the lamp.',
                }}
              />
              <Wire
                arrow={arrow}
                d={`M${TONE_X + TONE_W} ${AXIS_Y} H${OUT_X}`}
                look={flowing && r.value('dlyMix') > 0 ? 'on' : 'plain'}
              />
              <Label
                x={OUT_X}
                y={AXIS_Y - 5}
                anchor="end"
                on={r.touched('dlyMix')}
              >
                echo
              </Label>
              <TapeLine d={LOOP} />
              <path
                d={`M${(LOOP_LEFT + LOOP_RIGHT) / 2 + 4} ${TAPE_BOTTOM - 3.5} l-8 3.5 l8 3.5 z`}
                className={styles.head}
              />
              {flowing && (
                <path
                  d={`M${REC_X} ${TAPE_Y} H${headX(last)}`}
                  className={styles.tapeOn}
                />
              )}
              <Head x={REC_X} on={flowing} />
              <Label x={REC_X} y={INSIDE_Y} anchor="middle">
                rec
              </Label>
              <Pressable {...pickOf('heads')}>
                <title>heads — Which play heads the echo comes off.</title>
                {[1, 2, 3].map(n => (
                  <Head key={n} x={headX(n)} on={lit.includes(n)} />
                ))}
                <Label
                  x={headX(2)}
                  y={PICKS_Y}
                  anchor="middle"
                  on={r.touched('dlyHeads')}
                >
                  heads
                </Label>
                <rect
                  x={headX(1) - 15}
                  y={TAPE_Y - HEAD - 4}
                  width={HEAD_GAP * 2 + 30}
                  height={PICKS_Y - TAPE_Y + HEAD + 6}
                  className={styles.hit}
                />
              </Pressable>
              <Pressable {...pickOf('transport')}>
                <title>
                  transport — The motor and the splice: wow, flutter, brake, the
                  erase head and the join in the loop.
                </title>
                <Capstan x={CAPSTAN_X} y={TAPE_Y} />
                <Label
                  x={CAPSTAN_X}
                  y={PICKS_Y}
                  anchor="middle"
                  on={r.touched(...OPENS.transport)}
                >
                  transport
                </Label>
                <rect
                  x={CAPSTAN_X - 14}
                  y={TAPE_Y - 16}
                  width={28}
                  height={PICKS_Y - TAPE_Y + 18}
                  className={styles.hit}
                />
              </Pressable>
            </>
          )}
        </Diagram>
      </div>
      <BoxRows
        card={card(pick)}
        keys={Object.entries(OPENS).find(([id]) => id === pick.selected)?.[1]}
      />
    </>
  )
}
