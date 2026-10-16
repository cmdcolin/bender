import { HEAD_CHOICES } from '../dsp/stages/tapeDelay'
import { useReadings } from './diagram'
import { Band, BoxView, Diagram, HeadBar, Label, Wire } from './DiagramParts'

const KEYS = [
  'dlySend',
  'delayMs',
  'dlyHeads',
  'dlyFb',
  'dlyToneHz',
  'dlyLoopMode',
  'dlyRing',
  'dlyMix',
] as const

const REC_X = 128
const HEAD_GAP = 80
const TAPE_Y = 44
const TAPE_H = 16
const MID = TAPE_Y + TAPE_H / 2
const HEAD_TOP = 36
const HEAD_H = 32
const BUS_Y = 14
const RETURN_Y = 94

const headX = (n: number) => REC_X + HEAD_GAP * n

const seconds = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`

// The tape loop the delay is, with its heads where the Time knob puts them: the
// record head, then three play heads at one, two and three times the spacing,
// the ones switched up lit, and the lap going back round to the record head
// through whatever sits in the loop. Past unity the lap goes red, since that is
// where the repeats stop dying.
export function TapeLoopDiagram() {
  const r = useReadings(KEYS)
  const ms = r.value('delayMs')
  const fb = r.value('dlyFb')
  const lit = [1, 2, 3].filter(n =>
    (HEAD_CHOICES[Math.round(r.value('dlyHeads'))] ?? '1').includes(String(n)),
  )
  const last = Math.max(...lit)
  const inLoop = r.touched('dlyToneHz', 'dlyLoopMode', 'dlyRing')
  const returning = fb > 1 ? 'alarm' : fb > 0 ? 'on' : 'dash'
  return (
    <Diagram width={420} height={110} label="tape delay signal path">
      {arrow => (
        <>
          <Band
            x={REC_X - 8}
            y={TAPE_Y}
            w={headX(3) + 46 - (REC_X - 8)}
            h={TAPE_H}
          />
          <BoxView
            box={{
              x: 0,
              y: MID - 14,
              w: 60,
              name: 'send',
              value: r.read('dlySend'),
              off: r.value('dlySend') <= 0,
              touched: r.touched('dlySend'),
              help: 'How much of the whole board goes onto the tape.',
            }}
          />
          <Wire arrow={arrow} d={`M60 ${MID} H${REC_X - 4}`} />
          <HeadBar x={REC_X} y={HEAD_TOP} h={HEAD_H} />
          <Label x={REC_X + 6} y={80}>
            rec
          </Label>
          {[1, 2, 3].map(n => (
            <g key={n} opacity={lit.includes(n) ? 1 : 0.5}>
              <HeadBar
                x={headX(n)}
                y={HEAD_TOP}
                h={HEAD_H}
                on={lit.includes(n)}
              />
              <Label x={headX(n) + 6} y={80} on={lit.includes(n)}>
                {seconds(ms * n)}
              </Label>
            </g>
          ))}
          {lit.map(n => (
            <Wire
              key={n}
              arrow={arrow}
              d={`M${headX(n)} ${HEAD_TOP} V${BUS_Y + 2}`}
              look="on"
            />
          ))}
          <Wire
            arrow={arrow}
            d={`M${headX(Math.min(...lit))} ${BUS_Y} H412`}
            look={r.value('dlyMix') > 0 ? 'on' : 'plain'}
          />
          <Label x={412} y={9} anchor="end" on={r.touched('dlyMix')}>
            {`echo ${r.read('dlyMix')} → out`}
          </Label>
          <Wire
            arrow={arrow}
            d={`M${headX(last)} ${HEAD_TOP + HEAD_H} V${RETURN_Y} H${REC_X} V${HEAD_TOP + HEAD_H}`}
            look={returning}
          />
          <Label
            x={REC_X + 6}
            y={RETURN_Y + 12}
            on={r.touched('dlyFb') || inLoop}
          >
            {`back round ${r.read('dlyFb')} · tone ${r.read('dlyToneHz')} · filter ${r.read('dlyLoopMode')} · ring ${r.read('dlyRing')}`}
          </Label>
        </>
      )}
    </Diagram>
  )
}
