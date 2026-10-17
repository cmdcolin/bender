import {
  boxHeight,
  useReadings,
  useSelectedBox,
  type BoxSpec,
} from './diagram.ts'
import { BoxRows, BoxView, Diagram, Label, Wire } from './DiagramParts.tsx'

const KEYS = [
  'tapeMix',
  'tapeSpeed',
  'tapeAt',
  'tapeFormat',
  'tapeDrive',
  'tapeBias',
  'tapeHyst',
  'tapeBump',
  'tapeSqueal',
  'tapeHiss',
  'tapeWow',
  'tapeFlutter',
  'tapeDrop',
  'tapePrint',
  'tapeAzimuth',
  'tapeNrRec',
  'tapeNrPlay',
] as const

const MID = 30
const BYPASS_Y = 64
const SITS = ['at the end', 'ahead of the pedals', 'ahead of the bends']

// The machine as the path the board takes through it: noise reduction in, the
// record head, the tape itself, the replay head and noise reduction out, with
// the dry board running underneath and meeting it at the end. Each box reads the
// knobs of the fold it stands for, so the fold's rows have a place on the
// drawing.
export function TapePathDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const off = r.value('tapeMix') <= 0
  const box = (
    x: number,
    w: number,
    name: string,
    value: string | string[],
    help: string,
    touchedBy: (typeof KEYS)[number][],
    quiet = false,
  ): BoxSpec => ({
    x,
    y: MID - boxHeight(value) / 2,
    w,
    name,
    value,
    off: off || quiet,
    touched: r.touched(...touchedBy),
    help,
    id: name,
    keys: touchedBy.filter(k => k !== 'tapeDrive'),
  })
  const boxes = [
    box(
      0,
      36,
      'board',
      'bus',
      'What the board is playing where the machine sits.',
      [],
    ),
    box(
      44,
      50,
      'NR in',
      r.read('tapeNrRec'),
      'The noise reduction that encodes the board on its way to the record head.',
      ['tapeNrRec'],
      r.value('tapeNrRec') === 0,
    ),
    box(
      102,
      60,
      'rec head',
      [r.read('tapeDrive'), `bias ${r.read('tapeBias')}`],
      'Record level, bias and hysteresis: how hard the signal hits the oxide.',
      ['tapeDrive', 'tapeBias', 'tapeHyst'],
    ),
    box(
      170,
      84,
      'tape',
      [r.read('tapeFormat'), r.read('tapeSpeed')],
      'The medium and how fast it runs: hiss, wow, flutter, dropouts, print-through and squeal.',
      [
        'tapeFormat',
        'tapeSpeed',
        'tapeHiss',
        'tapeWow',
        'tapeFlutter',
        'tapeDrop',
        'tapePrint',
        'tapeSqueal',
      ],
    ),
    box(
      262,
      60,
      'replay head',
      [`bump ${r.read('tapeBump')}`, `azim ${r.read('tapeAzimuth')}`],
      'Head bump and azimuth: what the playback head adds and misaligns.',
      ['tapeBump', 'tapeAzimuth'],
    ),
    box(
      330,
      50,
      'NR out',
      r.read('tapeNrPlay'),
      'The decoder after the replay head.',
      ['tapeNrPlay'],
      r.value('tapeNrPlay') === 0,
    ),
  ]
  const wires = [36, 94, 162, 254, 322].map(x => `M${x} ${MID} H${x + 8}`)
  const open = boxes.find(b => b.id === pick.selected)
  return (
    <>
      <Diagram width={420} height={82} label="tape machine signal path">
        {arrow => (
          <>
            {wires.map(d => (
              <Wire key={d} arrow={arrow} d={d} />
            ))}
            <Wire arrow={arrow} d={`M380 ${MID} H416`} />
            <Wire
              arrow={arrow}
              d={`M18 ${MID + 14} V${BYPASS_Y} H398 V${MID}`}
              look={off ? 'on' : 'dash'}
            />
            <Label x={208} y={BYPASS_Y - 4} anchor="middle" on={off}>
              {`dry · to tape ${r.read('tapeMix')}`}
            </Label>
            <Label
              x={208}
              y={BYPASS_Y + 12}
              anchor="middle"
              on={r.touched('tapeAt')}
            >
              {`sits ${SITS[Math.round(r.value('tapeAt'))] ?? SITS[0]!}`}
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
      </Diagram>
      <BoxRows keys={open?.keys} />
    </>
  )
}
