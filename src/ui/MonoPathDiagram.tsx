import { engine } from '../engine/engine.ts'
import chip from './ChipLook.module.css'
import { CHANNELS, GROUPS } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import styles from './Diagram.module.css'
import {
  boxHeight,
  boxWidth,
  useReadings,
  useSelectedBox,
  type BoxSpec,
} from './diagram.ts'
import {
  BoxRows,
  BoxView,
  Diagram,
  Label,
  Plate,
  Pressable,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'
import { CONE_H, ZoomCone, Zoomed } from './ZoomCone.tsx'

import type { ControlKey } from '../controls.ts'
import type { Verbs, Zoom } from './foldHosting.ts'
import type { ReactNode } from 'react'

const GROUP = GROUPS.find(g => g.name === 'Mono synth')!

const keysOf = (part: string): ControlKey[] =>
  GROUP.sliders.filter(d => d.part === part).map(d => d.key)

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

const KEYS = [...new Set(Object.values(BOXES).flatMap(b => keysOf(b.part)))]

const wire = (on: boolean): WireLook => (on ? 'on' : 'dash')

const MONO_TAP = CHANNELS.find(c => c.name === 'Mono synth')!.tap

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
const BOX_H = boxHeight('')
const HEIGHT = ROW2 + BOX_H + 4

// The voice card as the Model D's panel lays it out. The keys set the pitch of
// three oscillators, the mixer sums them with noise and the output fed back,
// and the ladder filter and the VCA follow, each with its own contour. Osc 3 or
// noise feeds the modulation bus, back to the oscillators and the cutoff.
export function MonoPathDiagram({
  verbs,
  zoom,
}: {
  verbs: Verbs
  zoom?: Zoom
}) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const flow: WireLook = useStoreSelect(
    engine.sounding,
    lit => lit & (1 << MONO_TAP),
  )
    ? 'on'
    : 'plain'
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
  const gap = (WIDTH - TAIL - widths.reduce((a, b) => a + b)) / (row.length - 1)
  const xs = widths.map((_, i) =>
    Math.round(widths.slice(0, i).reduce((a, b) => a + b + gap, 0)),
  )
  const top = MID - BOX_H / 2
  const keys = box('keys', xs[0]!, top)
  const frameX = xs[1]!
  const mixer = box('mixer', xs[2]!, top)
  const filter = box('filter', xs[3]!, top)
  const loud = box('loudness', xs[4]!, top)
  const mod = box('modulation', mixer.x - 10, ROW2)
  const card = box('voice card', 0, ROW2)
  card.x = WIDTH - 2 - card.w
  const boxes = [keys, mixer, filter, loud, mod, card]
  const oscs = box('oscillators', frameX, FRAME_TOP)
  const open = [...boxes, oscs].find(b => b.id === pick.selected)
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
  const toMixer = (name: string, word: ReactNode) => (
    <Pressable
      name={name}
      selected={pick.selected === 'mixer'}
      onSelect={() => pick.toggle('mixer')}
      className={chip.tag}
    >
      {word}
    </Pressable>
  )
  return (
    <>
      <Zoomed close={close}>
        <div className={chip.chips}>
          <Diagram
            width={WIDTH}
            height={close ? HEIGHT + CONE_H : HEIGHT}
            label="mono synth voice card"
          >
            {arrow => (
              <>
                {close && open && (
                  <ZoomCone
                    from={open}
                    to={{ x: 0, w: WIDTH }}
                    top={open.y + BOX_H}
                    knee={HEIGHT}
                    bottom={HEIGHT + CONE_H}
                    title={`zoom: ${open.name}`}
                  />
                )}
                <Wire
                  arrow={arrow}
                  d={`M${keys.x + keys.w} ${MID} H${frameX}`}
                />
                {[0, 1, 2].map(i => (
                  <Wire
                    key={i}
                    d={`M${oscRight} ${oscMid(i)} H${join} V${MID}`}
                    look={flow}
                  />
                ))}
                <Wire
                  arrow={arrow}
                  d={`M${join} ${MID} H${mixer.x}`}
                  look={flow}
                />
                <Wire
                  arrow={arrow}
                  d={`M${mixer.x + mixer.w} ${MID} H${filter.x}`}
                  look={flow}
                />
                <Wire
                  arrow={arrow}
                  d={`M${filter.x + filter.w} ${MID} H${loud.x}`}
                  look={flow}
                />
                <Wire
                  arrow={arrow}
                  d={`M${loud.x + loud.w} ${MID} H${WIDTH - 2}`}
                  look={flow}
                />
                <Label x={WIDTH - 2} y={MID + 12} anchor="end">
                  out
                </Label>
                <Wire
                  arrow={arrow}
                  d={`M${back} ${MID} V${over} H${loopX} V${top}`}
                  look={wire(up('monoLoop'))}
                />
                <circle cx={back} cy={MID} r={1.6} className={styles.head} />
                {toMixer(
                  'feedback',
                  <Label
                    x={(loopX + back) / 2}
                    y={over - 3}
                    anchor="middle"
                    on={up('monoLoop')}
                  >
                    feedback
                  </Label>,
                )}
                <Wire
                  arrow={arrow}
                  d={`M${noiseX} ${over - 12} V${top}`}
                  look={wire(up('monoNoise'))}
                />
                {toMixer(
                  'noise',
                  <Label
                    x={noiseX}
                    y={over - 15}
                    anchor="middle"
                    on={up('monoNoise')}
                  >
                    noise
                  </Label>,
                )}
                <Wire
                  arrow={arrow}
                  d={`M${tap} ${oscMid(2)} V${modMid} H${mod.x}`}
                />
                <circle
                  cx={tap}
                  cy={oscMid(2)}
                  r={1.6}
                  className={styles.head}
                />
                <Wire
                  arrow={arrow}
                  d={`M${mod.x + 12} ${ROW2} V${pitchY} H${frameX + FRAME_W / 2} V${FRAME_BOTTOM}`}
                  look={wire(up('monoModPitch'))}
                />
                <Wire
                  arrow={arrow}
                  d={`M${mod.x + mod.w} ${modMid} H${filter.x + filter.w / 2} V${top + BOX_H}`}
                  look={wire(up('monoModFilter'))}
                />
                <Wire
                  arrow={arrow}
                  d={`M${loud.x + loud.w / 2} ${ROW2} V${top + BOX_H}`}
                  look="dash"
                />
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
                <g pointerEvents="none">
                  <Wire
                    arrow={arrow}
                    d={`M${syncX} ${OSC_Y[0]! + OSC_H} V${OSC_Y[1]}`}
                    look={wire(up('monoSync'))}
                  />
                  <Label x={syncX + 4} y={gapY + 3} on={up('monoSync')}>
                    sync
                  </Label>
                  <Wire
                    arrow={arrow}
                    d={`M${fmX} ${OSC_Y[1]} V${OSC_Y[0]! + OSC_H}`}
                    look={wire(up('monoFm'))}
                  />
                  <Label
                    x={fmX - 4}
                    y={gapY + 3}
                    anchor="end"
                    on={up('monoFm')}
                  >
                    FM
                  </Label>
                </g>
                {boxes.map(b => (
                  <BoxView
                    key={b.id}
                    box={b}
                    selected={b.id === pick.selected}
                    onSelect={pick.toggle}
                  />
                ))}
              </>
            )}
          </Diagram>
        </div>
      </Zoomed>
      <BoxRows
        keys={open?.id === 'voice card' ? [] : open?.keys}
        verbs={part && verbs(part)}
      />
    </>
  )
}
