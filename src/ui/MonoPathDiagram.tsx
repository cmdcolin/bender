import { MONO_SEQ_STEP_KEYS } from '../tune.ts'
import { ChipDrawing } from './ChipDrawing.tsx'
import chip from './ChipLook.module.css'
import styles from './Diagram.module.css'
import {
  boxWidth,
  glyphBoxWidth,
  ONE_LINE_H,
  partKeys,
  useFlow,
  useReadings,
  useSelectedBox,
  type BoxSpec,
  spread,
  chainPaths,
} from './diagram.ts'
import {
  Bend,
  BoxRows,
  BoxView,
  Dot,
  GlyphBox,
  Label,
  OpenBox,
  Plate,
  Pressable,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'
import { MonoRoll } from './MonoRoll.tsx'
import { rollGlyph, ROLL_GLYPH_W } from './rollGlyph.tsx'

import type { ControlKey } from '../controls.ts'
import type { Verbs, Zoom } from './foldHosting.ts'

const keysOf = (part: string) => partKeys('Growler', part)

// Each box opens one fold of the voice card, with that fold's dice and reset.
const BOXES = {
  keys: {
    part: 'keys',
    help: 'The toy’s gate line, a kit voice, and how long a struck note stays down.',
  },
  oscillators: {
    part: 'oscillators',
    help: 'Three oscillators with their waves, ranges and tunings. Osc 1 can restart osc 2, osc 2 can drive osc 1’s linear FM input, and osc 3 can run as an LFO.',
  },
  mixer: {
    part: 'mixer',
    help: 'The three oscillators, the noise source and the output patched back in.',
  },
  filter: {
    part: 'filter contour',
    help: 'The transistor ladder and the contour that sweeps its cutoff on every note.',
  },
  loudness: {
    part: 'loudness contour',
    help: 'The VCA and the contour that opens it on every note.',
  },
  modulation: {
    part: 'modulation',
    help: 'Osc 3 or filtered noise, sent to the oscillators’ pitch and the filter’s cutoff.',
  },
  'voice card': {
    part: 'voice card faults',
    help: 'Faults on the card itself, in the converter, the VCA, the contour caps, the ladder, the pitch hold and the regulator.',
  },
} as const

type BoxId = keyof typeof BOXES

const PARTS = new Map<string, string>(
  Object.entries(BOXES).map(([id, b]) => [id, b.part]),
)

const ROLL = 'piano roll'
const MEMORY_KEYS = keysOf('melody')
const WRITTEN_KEYS: ControlKey[] = [
  ...MEMORY_KEYS,
  ...MONO_SEQ_STEP_KEYS,
  'monoSeqLen',
]

const KEYS = [
  ...new Set([
    ...Object.values(BOXES).flatMap(b => keysOf(b.part)),
    ...WRITTEN_KEYS,
  ]),
]

const wire = (on: boolean): WireLook => (on ? 'on' : 'dash')

const WIDTH = 420
const TAIL = 30
const MID = 76
const OSC_W = 60
const OSC_H = 20
const SYNC_GAP = 22
const OSC_GAP = 10
const FRAME_PAD = 4
const FRAME_HEAD = 17
const FRAME_W = OSC_W + 2 * FRAME_PAD
const FRAME_TOP = MID - (FRAME_HEAD + OSC_H + SYNC_GAP + OSC_H / 2)
const OSC_Y = [
  FRAME_TOP + FRAME_HEAD,
  FRAME_TOP + FRAME_HEAD + OSC_H + SYNC_GAP,
  FRAME_TOP + FRAME_HEAD + 2 * OSC_H + SYNC_GAP + OSC_GAP,
]
const FRAME_H = OSC_Y[2]! + OSC_H + 5 - FRAME_TOP
const FRAME_BOTTOM = FRAME_TOP + FRAME_H
const ROW2 = FRAME_BOTTOM + 20
const BOX_H = ONE_LINE_H
const HEIGHT = ROW2 + BOX_H + 4

// The voice card as the Model D's panel lays it out. The keys set the pitch of
// three oscillators, the mixer sums them with noise and the output fed back,
// and the ladder filter and the VCA follow, each with its own contour. Osc 3 or
// noise feeds the modulation bus, back to the oscillators and the cutoff. The
// piano roll under the keys holds the melody memory.
export function MonoPathDiagram({
  verbs,
  zoom,
}: {
  verbs: Verbs
  zoom?: Zoom
}) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const flow = useFlow('Growler')
  const up = (key: ControlKey) => r.value(key) > 0

  const box = (id: BoxId, x: number, y: number): BoxSpec => {
    const keys = keysOf(BOXES[id].part)
    return {
      id,
      keys,
      x,
      y,
      w: boxWidth(id),
      name: id,
      touched: r.touched(...keys),
      help: BOXES[id].help,
    }
  }
  const row: (BoxId | 'frame')[] = [
    'keys',
    'frame',
    'mixer',
    'filter',
    'loudness',
  ]
  const widths = row.map(id => (id === 'frame' ? FRAME_W : boxWidth(id)))
  const { xs } = spread(widths, WIDTH - TAIL)
  const top = MID - BOX_H / 2
  const keys = box('keys', xs[0]!, top)
  const frameX = xs[1]!
  const mixer = box('mixer', xs[2]!, top)
  const filter = box('filter', xs[3]!, top)
  const loud = box('loudness', xs[4]!, top)
  const mod = box('modulation', mixer.x - 10, ROW2)
  const card = box('voice card', 0, ROW2)
  const memory = {
    x: 0,
    y: ROW2,
    w: glyphBoxWidth(ROLL, ROLL_GLYPH_W),
    h: BOX_H,
  }
  const playsHere = up('monoSeqOn') && r.value('monoSeqTo') === 0
  card.x = WIDTH - 2 - card.w
  const boxes = [keys, mixer, filter, loud, mod, card]
  const oscs = box('oscillators', frameX, FRAME_TOP)
  const words = [
    { id: 'sync', keys: ['monoSync'] as const },
    { id: 'FM', keys: ['monoFm'] as const },
  ]
  const rollOpen = pick.selected === ROLL
  const drawn = [...boxes, oscs].find(b => b.id === pick.selected)
  const open = drawn ?? words.find(w => w.id === pick.selected)
  const part = open && PARTS.get(open.id!)
  const close = part ? zoom?.(part) : null

  const oscX = frameX + FRAME_PAD
  const oscRight = oscX + OSC_W
  const join = mixer.x - 14
  const oscMid = (i: number) => OSC_Y[i]! + OSC_H / 2
  const syncX = oscX + 6
  const fmX = oscRight - 6
  const gapY = OSC_Y[0]! + OSC_H + SYNC_GAP / 2
  const tap = oscRight + 8
  const modMid = ROW2 + BOX_H / 2
  const pitchY = FRAME_BOTTOM + 8
  const back = loud.x + loud.w + 10
  const over = MID - 30
  const noiseX = mixer.x + mixer.w / 2 - 8
  const loopX = mixer.x + mixer.w / 2 + 8
  const frameFrame = oscs.id === pick.selected
  const pitchWire = `M${mod.x + 12} ${ROW2} V${pitchY} H${frameX + FRAME_W / 2} V${FRAME_BOTTOM}`
  const filterWire = `M${mod.x + mod.w} ${modMid} H${filter.x + filter.w / 2} V${top + BOX_H}`
  const loopWire = `M${back} ${MID} V${over} H${loopX} V${top}`
  const noiseWire = `M${noiseX} ${over - 12} V${top}`
  const tapWire = `M${tap} ${oscMid(2)} V${modMid} H${mod.x}`
  const cardWire = `M${loud.x + loud.w / 2} ${ROW2} V${top + BOX_H}`
  const syncWire = `M${syncX} ${OSC_Y[0]! + OSC_H} V${OSC_Y[1]}`
  const fmWire = `M${fmX} ${OSC_Y[1]} V${OSC_Y[0]! + OSC_H}`
  return (
    <>
      <ChipDrawing width={WIDTH} height={HEIGHT} label="growler voice card">
        {arrow => (
          <>
            <Wire arrow={arrow} d={`M${keys.x + keys.w} ${MID} H${frameX}`} />
            <Wire
              arrow={arrow}
              d={`M${keys.x + keys.w / 2} ${ROW2} V${top + BOX_H}`}
              look={wire(playsHere)}
            />
            {[0, 1, 2].map(i => (
              <Wire
                key={i}
                d={`M${oscRight} ${oscMid(i)} H${join} V${MID}`}
                look={flow}
              />
            ))}
            <Wire arrow={arrow} d={`M${join} ${MID} H${mixer.x}`} look={flow} />
            {chainPaths([mixer, filter, loud], MID).map(d => (
              <Wire key={d} arrow={arrow} d={d} look={flow} />
            ))}
            <Wire
              arrow={arrow}
              d={`M${loud.x + loud.w} ${MID} H${WIDTH - 2}`}
              look={flow}
            />
            <Label x={WIDTH - 2} y={MID + 12} anchor="end">
              out
            </Label>
            <Bend name="feedback" opens="mixer" pick={pick} hit={loopWire}>
              <Wire arrow={arrow} d={loopWire} look={wire(up('monoLoop'))} />
              <Label
                x={(loopX + back) / 2}
                y={over - 3}
                anchor="middle"
                on={up('monoLoop')}
              >
                feedback
              </Label>
            </Bend>
            <Dot x={back} y={MID} />
            <Bend name="noise" opens="mixer" pick={pick} hit={noiseWire}>
              <Wire arrow={arrow} d={noiseWire} look={wire(up('monoNoise'))} />
              <Label
                x={noiseX}
                y={over - 15}
                anchor="middle"
                on={up('monoNoise')}
              >
                noise
              </Label>
            </Bend>
            <Bend name="osc 3 tap" opens="modulation" pick={pick} hit={tapWire}>
              <Wire arrow={arrow} d={tapWire} />
              <Dot x={tap} y={oscMid(2)} />
            </Bend>
            <Bend
              name="pitch modulation"
              opens="modulation"
              pick={pick}
              hit={pitchWire}
            >
              <Wire
                arrow={arrow}
                d={pitchWire}
                look={wire(up('monoModPitch'))}
              />
            </Bend>
            <Bend
              name="filter modulation"
              opens="modulation"
              pick={pick}
              hit={filterWire}
            >
              <Wire
                arrow={arrow}
                d={filterWire}
                look={wire(up('monoModFilter'))}
              />
            </Bend>
            <Bend
              name="voice card wire"
              opens="voice card"
              pick={pick}
              hit={cardWire}
            >
              <Wire arrow={arrow} d={cardWire} look="dash" />
            </Bend>
            <Pressable
              name="oscillators"
              selected={frameFrame}
              onSelect={() => pick.toggle('oscillators')}
            >
              <title>{`oscillators — ${BOXES.oscillators.help}`}</title>
              <Plate
                x={frameX}
                y={FRAME_TOP}
                w={FRAME_W}
                h={FRAME_H}
                touched={oscs.touched}
                selected={frameFrame}
              />
              <text
                x={frameX + FRAME_W / 2}
                y={FRAME_TOP + 12}
                textAnchor="middle"
                className={oscs.touched ? styles.nameOn : styles.name}
              >
                oscillators
              </text>
            </Pressable>
            {OSC_Y.map((y, i) => (
              <g key={y} pointerEvents="none">
                <rect
                  x={oscX}
                  y={y}
                  width={OSC_W}
                  height={OSC_H}
                  rx={2}
                  className={`${styles.box} ${chip.inner}`}
                />
                <text
                  x={oscX + OSC_W / 2}
                  y={y + 14}
                  textAnchor="middle"
                  className={styles.name}
                >
                  {`osc ${i + 1}`}
                </text>
              </g>
            ))}
            <Bend name="sync" opens="sync" pick={pick} hit={syncWire}>
              <Wire arrow={arrow} d={syncWire} look={wire(up('monoSync'))} />
              <Label x={syncX + 4} y={gapY + 3} on={up('monoSync')}>
                sync
              </Label>
            </Bend>
            <Bend name="FM" opens="FM" pick={pick} hit={fmWire}>
              <Wire arrow={arrow} d={fmWire} look={wire(up('monoFm'))} />
              <Label x={fmX - 4} y={gapY + 3} anchor="end" on={up('monoFm')}>
                FM
              </Label>
            </Bend>
            {boxes.map(b => (
              <BoxView
                key={b.id}
                box={b}
                selected={b.id === pick.selected}
                onSelect={pick.toggle}
              />
            ))}
            <GlyphBox
              {...memory}
              name={ROLL}
              help="the second melody memory and its piano roll, and which machine it plays"
              lit={r.touched(...WRITTEN_KEYS)}
              selected={rollOpen}
              onSelect={() => pick.toggle(ROLL)}
              glyphW={ROLL_GLYPH_W}
              glyph={rollGlyph}
            />
          </>
        )}
      </ChipDrawing>
      {rollOpen && (
        <OpenBox name={ROLL} onHide={() => pick.toggle(ROLL)}>
          <BoxRows
            title={ROLL}
            keys={MEMORY_KEYS}
            inOrder
            verbs={verbs('melody')}
            under={{ keys: MEMORY_KEYS, node: <MonoRoll /> }}
          />
        </OpenBox>
      )}
      {open && (
        <OpenBox
          name={drawn?.name ?? open.id!}
          onHide={() => pick.toggle(open.id!)}
        >
          {close}
          <BoxRows
            title={drawn?.name ?? open.id!}
            keys={open.id === 'voice card' ? [] : open.keys}
            verbs={part && verbs(part)}
          />
        </OpenBox>
      )}
    </>
  )
}
