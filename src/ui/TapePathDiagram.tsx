import styles from './Diagram.module.css'
import {
  boxHeight,
  boxWidth,
  LINE_H,
  useReadings,
  useSelectedBox,
  type BoxSpec,
} from './diagram.ts'
import {
  BoxRows,
  BoxView,
  Capstan,
  Diagram,
  HeadBar,
  Label,
  Plate,
  Pressable,
  Reel,
  TapeLine,
  Wire,
} from './DiagramParts.tsx'

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

const SITS = ['at the end', 'ahead of the pedals', 'ahead of the bends']

const WIDTH = 420
const DECK_H = 58
const TAPE_Y = 48
const ROW_Y = 66
const ROW_H = boxHeight(['', ''])
const ROW_MID = ROW_Y + ROW_H / 2
const BYPASS_Y = ROW_Y + ROW_H + 9
const GAP = 10
const TAPE_GAP = 26
const NR_WORST = 'Dolby B'
const BIAS_WORST = 'bias 1.00 under'
const BUMP_WORST = 'bump 1.50'

const BOARD_W = boxWidth('board', 'bus')
const NR_W = boxWidth('NR in', NR_WORST)
const REC_W = boxWidth('rec head', '-12.0 dB', BIAS_WORST)
const PLAY_W = boxWidth('replay head', BUMP_WORST)

const NR_IN_X = BOARD_W + GAP
const REC_X = NR_IN_X + NR_W + GAP
const PLAY_X = REC_X + REC_W + TAPE_GAP
const NR_OUT_X = PLAY_X + PLAY_W + GAP
const OUT_X = NR_OUT_X + NR_W
const JOIN_X = OUT_X + 16
const REC_MID = REC_X + REC_W / 2
const PLAY_MID = PLAY_X + PLAY_W / 2
const CAPSTAN_X = PLAY_MID + 34
const CAPTION_X = 42

const TAPE_KEYS = [
  'tapeFormat',
  'tapeSpeed',
  'tapeHiss',
  'tapeWow',
  'tapeFlutter',
  'tapeDrop',
  'tapePrint',
  'tapeSqueal',
] as const

// Reel size and position per format: open reel, cassette, microcassette.
const DECKS = [
  { reel: 18, left: [122, 22], right: [328, 22], shell: null, spokes: true },
  {
    reel: 11,
    left: [200, 22],
    right: [262, 22],
    shell: { x: 132, y: 3, w: 190, h: 50 },
    spokes: true,
  },
  {
    reel: 8,
    left: [204, 24],
    right: [258, 24],
    shell: { x: 140, y: 10, w: 174, h: 43 },
    spokes: false,
  },
] as const

const tapeRun = (format: number) => {
  const deck = DECKS[format]!
  const [lx, ly] = deck.left
  const [rx, ry] = deck.right
  const fullLeft = deck.reel * 0.85
  const fullRight = deck.reel * 0.5
  if (!deck.shell) {
    const leave = TAPE_Y - 4
    return `M${lx} ${ly + fullLeft} V${leave} Q${lx} ${TAPE_Y} ${lx + 4} ${TAPE_Y} H${rx - 4} Q${rx} ${TAPE_Y} ${rx} ${leave} V${ry + fullRight}`
  }
  const near = REC_MID - 14
  const far = CAPSTAN_X + 8
  return `M${lx - fullLeft} ${ly} L${near} ${TAPE_Y - 4} Q${near + 2} ${TAPE_Y} ${near + 6} ${TAPE_Y} H${far - 6} Q${far - 2} ${TAPE_Y} ${far} ${TAPE_Y - 4} L${rx + fullRight} ${ry}`
}

// The deck on top is the tape: two reels, the run past the record and replay
// heads, the capstan. The row below is the signal: noise reduction, the record
// head, and across the tape the replay head and decoder, with the dry board
// running underneath. Each box reads the knobs of the fold it stands for.
export function TapePathDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const off = r.value('tapeMix') <= 0
  const taped = off ? 'plain' : 'on'
  const format = Math.round(r.value('tapeFormat'))
  const deck = DECKS[format] ?? DECKS[0]
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
    y: ROW_Y,
    w,
    h: ROW_H,
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
      BOARD_W,
      'board',
      'bus',
      'What the board is playing where the machine sits.',
      [],
    ),
    box(
      NR_IN_X,
      NR_W,
      'NR in',
      r.read('tapeNrRec'),
      'The noise reduction that encodes the board on its way to the record head.',
      ['tapeNrRec'],
      r.value('tapeNrRec') === 0,
    ),
    box(
      REC_X,
      REC_W,
      'rec head',
      [r.read('tapeDrive'), `bias ${r.read('tapeBias')}`],
      'Record level, bias and hysteresis: how hard the signal hits the oxide.',
      ['tapeDrive', 'tapeBias', 'tapeHyst'],
    ),
    box(
      PLAY_X,
      PLAY_W,
      'replay head',
      [`bump ${r.read('tapeBump')}`, `azim ${r.read('tapeAzimuth')}`],
      'Head bump and azimuth: what the playback head adds and misaligns.',
      ['tapeBump', 'tapeAzimuth'],
    ),
    box(
      NR_OUT_X,
      NR_W,
      'NR out',
      r.read('tapeNrPlay'),
      'The decoder after the replay head.',
      ['tapeNrPlay'],
      r.value('tapeNrPlay') === 0,
    ),
  ]
  const tapeKeys = [...TAPE_KEYS]
  const tapeTouched = r.touched(...tapeKeys)
  const tapeLines = [r.read('tapeFormat'), r.read('tapeSpeed')]
  const captionTop = (DECK_H - LINE_H * (1 + tapeLines.length)) / 2
  const open =
    pick.selected === 'tape'
      ? tapeKeys
      : boxes.find(b => b.id === pick.selected)?.keys
  const lit = (...ks: (typeof KEYS)[number][]) => r.touched(...ks)
  return (
    <>
      <Diagram
        width={WIDTH}
        height={BYPASS_Y + 16}
        label="tape machine signal path"
      >
        {arrow => (
          <>
            <Pressable
              name="tape"
              selected={pick.selected === 'tape'}
              onSelect={() => pick.toggle('tape')}
              opacity={off ? 0.55 : 1}
            >
              <title>
                tape — The medium and how fast it runs: hiss, wow, flutter,
                dropouts, print-through and squeal.
              </title>
              <Plate
                x={0}
                y={0}
                w={WIDTH - 4}
                h={DECK_H}
                selected={pick.selected === 'tape'}
              />
              <text
                x={CAPTION_X}
                y={captionTop + LINE_H}
                textAnchor="middle"
                className={styles.name}
              >
                tape
              </text>
              {tapeLines.map((line, i) => (
                <text
                  key={line}
                  x={CAPTION_X}
                  y={captionTop + LINE_H * (i + 2)}
                  textAnchor="middle"
                  className={tapeTouched ? styles.valueOn : styles.value}
                >
                  {line}
                </text>
              ))}
              {deck.shell && (
                <rect
                  x={deck.shell.x}
                  y={deck.shell.y}
                  width={deck.shell.w}
                  height={deck.shell.h}
                  rx={3}
                  className={styles.reel}
                />
              )}
              <Reel
                cx={deck.left[0]}
                cy={deck.left[1]}
                r={deck.reel}
                full={0.85}
                spokes={deck.spokes}
              />
              <Reel
                cx={deck.right[0]}
                cy={deck.right[1]}
                r={deck.reel}
                full={0.5}
                spokes={deck.spokes}
              />
              <TapeLine d={tapeRun(format)} />
              <Capstan x={CAPSTAN_X} y={TAPE_Y} />
            </Pressable>
            <HeadBar
              x={REC_MID}
              y={TAPE_Y - 5}
              h={10}
              on={lit('tapeDrive', 'tapeBias', 'tapeHyst')}
            />
            <HeadBar
              x={PLAY_MID}
              y={TAPE_Y - 5}
              h={10}
              on={lit('tapeBump', 'tapeAzimuth')}
            />
            <Wire
              arrow={arrow}
              d={`M${REC_MID} ${ROW_Y} V${TAPE_Y + 5}`}
              look={taped}
            />
            <Wire
              arrow={arrow}
              d={`M${PLAY_MID} ${TAPE_Y + 5} V${ROW_Y}`}
              look={taped}
            />
            {[
              [BOARD_W, NR_IN_X],
              [NR_IN_X + NR_W, REC_X],
              [PLAY_X + PLAY_W, NR_OUT_X],
            ].map(([from, to]) => (
              <Wire
                key={from}
                arrow={arrow}
                d={`M${from} ${ROW_MID} H${to}`}
                look={taped}
              />
            ))}
            <Wire d={`M${OUT_X} ${ROW_MID} H${JOIN_X}`} look={taped} />
            <Wire arrow={arrow} d={`M${JOIN_X} ${ROW_MID} H${WIDTH - 4}`} />
            <Wire
              d={`M${BOARD_W / 2} ${ROW_Y + ROW_H} V${BYPASS_Y} H${JOIN_X} V${ROW_MID}`}
              look={off ? 'plain' : 'dash'}
            />
            <circle cx={JOIN_X} cy={ROW_MID} r={2} className={styles.hub} />
            <Label
              x={WIDTH / 2}
              y={BYPASS_Y + 12}
              anchor="middle"
              on={r.touched('tapeMix', 'tapeAt')}
            >
              {`dry · to tape ${r.read('tapeMix')} · sits ${SITS[Math.round(r.value('tapeAt'))] ?? SITS[0]!}`}
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
      <BoxRows keys={open} />
    </>
  )
}
