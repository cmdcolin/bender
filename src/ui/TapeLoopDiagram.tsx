import { HEAD_CHOICES } from '../dsp/stages/tapeDelay.ts'
import { boxHeight, boxWidth, useReadings, useSelectedBox } from './diagram.ts'
import {
  BoxRows,
  BoxView,
  Capstan,
  Diagram,
  HeadBar,
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
const REC_X = 152
const HEAD_GAP = 68
const LOOP_ROUND = 24
const LOOP_LEFT = REC_X - 8
const CAPSTAN_X = LOOP_LEFT - 2
const LOOP_RIGHT = REC_X + HEAD_GAP * 3 + 24
const TAPE_Y = 48
const LOOP_BOTTOM = TAPE_Y + LOOP_ROUND * 2
const HEAD_H = 28
const HEAD_TOP = TAPE_Y - HEAD_H / 2
const HEAD_BOTTOM = TAPE_Y + HEAD_H / 2
const INPUT_Y = 40
const BUS_Y = 14
const RETURN_Y = LOOP_BOTTOM + 14
const TIME_Y = TAPE_Y + 26
const OUT_X = WIDTH - 8

const headX = (n: number) => REC_X + HEAD_GAP * n

const SEND_W = boxWidth('send')
const SEND_H = boxHeight('send')

const LOOP = [
  `M${LOOP_LEFT} ${TAPE_Y}`,
  `H${LOOP_RIGHT}`,
  `A${LOOP_ROUND} ${LOOP_ROUND} 0 0 1 ${LOOP_RIGHT} ${LOOP_BOTTOM}`,
  `H${LOOP_LEFT}`,
  `A${LOOP_ROUND} ${LOOP_ROUND} 0 0 1 ${LOOP_LEFT} ${TAPE_Y}`,
  'Z',
].join(' ')

// The delay as a loop of tape running left to right past the record head and
// three play heads, with the lit ones switched up. The wires are the
// electronics: send into the record head, the lit play heads onto an echo bus,
// and feedback from the last lit head back to the record head. A wire lights
// while what it carries reaches the output, which a bypass or a closed send
// stops. Past unity the feedback wire goes red and dashed. Send, heads, the
// feedback loop and the transport each open their knobs under the drawing.
export function TapeLoopDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const pickOf = (id: keyof typeof OPENS) => ({
    id,
    selected: pick.selected === id,
    onSelect: pick.toggle,
  })
  const fb = r.value('dlyFb')
  const lit = [1, 2, 3].filter(n =>
    (HEAD_CHOICES[Math.round(r.value('dlyHeads'))] ?? '1').includes(String(n)),
  )
  const first = Math.min(...lit)
  const last = Math.max(...lit)
  const flowing = r.value('dlySend') > 0 && r.value('dlyMute') <= 0
  const flow = flowing ? 'on' : 'plain'
  const returning = fb > 1 ? 'alarm' : fb > 0 && flowing ? 'on' : 'dash'
  return (
    <>
      <Diagram
        width={WIDTH}
        height={RETURN_Y + 20}
        label="tape delay signal path"
      >
        {arrow => (
          <>
            <TapeLine d={LOOP} />
            <Wire
              arrow={arrow}
              d={`M${LOOP_RIGHT - 36} ${LOOP_BOTTOM} H${LOOP_RIGHT - 44}`}
            />
            <BoxView
              selected={pick.selected === 'send'}
              onSelect={pick.toggle}
              box={{
                id: 'send',
                keys: OPENS.send,
                x: 0,
                y: INPUT_Y - SEND_H / 2,
                w: SEND_W,
                name: 'send',
                off: !flowing,
                touched: r.touched('dlySend'),
                help: 'How much of the whole board goes onto the tape.',
              }}
            />
            <Wire
              arrow={arrow}
              d={`M${SEND_W} ${INPUT_Y} H${REC_X - 3}`}
              look={flow}
            />
            <HeadBar x={REC_X} y={HEAD_TOP} h={HEAD_H} />
            <Label x={REC_X + 9} y={TIME_Y}>
              rec
            </Label>
            <Label
              x={headX(first) - 8}
              y={BUS_Y - 4}
              anchor="end"
              on={r.touched('dlyHeads')}
              pick={pickOf('heads')}
            >
              heads
            </Label>
            {[1, 2, 3].map(n => (
              <g key={n} opacity={lit.includes(n) ? 1 : 0.5}>
                <HeadBar
                  x={headX(n)}
                  y={HEAD_TOP}
                  h={HEAD_H}
                  on={lit.includes(n)}
                />
                <Label x={headX(n) + 5} y={TIME_Y} on={lit.includes(n)}>
                  {`play ${n}`}
                </Label>
              </g>
            ))}
            {lit.map(n => (
              <Wire
                key={n}
                arrow={arrow}
                d={`M${headX(n)} ${HEAD_TOP} V${BUS_Y + 2}`}
                look={flow}
              />
            ))}
            <Wire
              arrow={arrow}
              d={`M${headX(first)} ${BUS_Y} H${OUT_X}`}
              look={flowing && r.value('dlyMix') > 0 ? 'on' : 'plain'}
            />
            <Label
              x={OUT_X}
              y={BUS_Y - 4}
              anchor="end"
              on={r.touched('dlyMix')}
            >
              echo → out
            </Label>
            <Wire
              arrow={arrow}
              d={`M${headX(last)} ${HEAD_BOTTOM} V${RETURN_Y} H${REC_X} V${HEAD_BOTTOM}`}
              look={returning}
            />
            <Label
              x={REC_X + 5}
              y={RETURN_Y + 12}
              on={r.touched('dlyFb', ...OPENS.loop)}
              pick={pickOf('loop')}
            >
              feedback loop
            </Label>
            <Pressable
              name="transport"
              selected={pick.selected === 'transport'}
              onSelect={() => pick.toggle('transport')}
            >
              <title>
                transport — The motor and the splice: wow, flutter, brake, the
                erase head and the join in the loop.
              </title>
              <Capstan x={CAPSTAN_X} y={LOOP_BOTTOM} />
              <Label
                x={CAPSTAN_X - 26}
                y={LOOP_BOTTOM - 5}
                anchor="end"
                on={r.touched(...OPENS.transport)}
              >
                transport
              </Label>
            </Pressable>
          </>
        )}
      </Diagram>
      <BoxRows
        keys={Object.entries(OPENS).find(([id]) => id === pick.selected)?.[1]}
      />
    </>
  )
}
