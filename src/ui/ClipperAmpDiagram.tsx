import { STOCK_GAIN } from '../dsp/stages/clipper.ts'
import { SUPPLY, SUPPLY_NAMES } from '../dsp/supplies.ts'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import { ChipDrawing } from './ChipDrawing.tsx'
import {
  boxHeight,
  boxWidth,
  card,
  chainPaths,
  spread,
  useFlow,
  useOpensOnAim,
  useReadings,
  useSelectedBox,
} from './diagram.ts'
import { BoxRows, BoxView, Label, Wire } from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'
import type { DrawingProps } from './drawingFor.tsx'

const KEYS = [
  'distSupply',
  'distDraw',
  'distPinGain',
  'distBypass',
  'distBlock',
  'distSpeaker',
] as const

const OPENS: Record<string, readonly ControlKey[]> = {
  supply: ['distSupply', 'distDraw'],
  LM386: ['distPinGain'],
  'pin 7': ['distBypass'],
  'coupling cap': ['distBlock'],
  speaker: ['distSpeaker'],
}

const WIDTH = 380
const HEAD = 24
const TAIL = 30
const TOP = 4
const BAR_H = boxHeight('')
const CHIP_H = boxHeight('a')
const CHIP_Y = TOP + BAR_H + 18
const MID = CHIP_Y + CHIP_H / 2
const LOW_Y = CHIP_Y + CHIP_H + 18
const HEIGHT = LOW_Y + BAR_H + 4

const centre = (b: ChipBox) => b.x + b.w / 2

// The toy's output stage: the LM386 hangs off whichever supply it is wired
// to, drives a coupling cap and a small speaker, and its pin 7 sits underneath.
export function ClipperAmpDiagram({ verbs }: DrawingProps) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  useOpensOnAim(pick, OPENS)
  const flow = useFlow()
  const supply = Math.round(r.value('distSupply'))
  const loaded = r.value('distDraw') > 0

  const parts = [
    {
      name: 'LM386',
      lit: r.value('distPinGain') > STOCK_GAIN,
      help: 'The toy’s power amp. A cap across pins 1 and 8 lifts its gain from 20 toward 600, and past a few hundred it sings.',
    },
    {
      name: 'coupling cap',
      lit: r.value('distBlock') > 0,
      help: 'The cap between the amp and the speaker. Hard clipping charges it and chokes the amp after loud hits.',
    },
    {
      name: 'speaker',
      lit: r.value('distSpeaker') > 0,
      help: 'A small cone that loses the bass, rings at its resonance and rattles against its stops.',
    },
  ]
  const widths = parts.map(p => boxWidth(p.name))
  const { xs } = spread(widths, WIDTH - HEAD - TAIL, HEAD)
  const boxes = parts.map((p, i): ChipBox => ({
    name: p.name,
    x: xs[i]!,
    y: CHIP_Y,
    w: widths[i]!,
    h: CHIP_H,
  }))
  const amp = boxes[0]!
  const speaker = boxes[2]!
  const railName = SUPPLY_NAMES[supply] ?? SUPPLY_NAMES[SUPPLY.bench]!
  const railW = boxWidth(railName)
  const pinW = boxWidth('pin 7')

  return (
    <>
      <ChipDrawing width={WIDTH} height={HEIGHT} label="the toy's amp">
        {arrow => (
          <>
            <Wire arrow={arrow} d={`M0 ${MID} H${amp.x}`} look={flow} />
            <Label x={2} y={MID - 4}>
              in
            </Label>
            {chainPaths(boxes, MID).map(d => (
              <Wire key={d} arrow={arrow} d={d} look={flow} />
            ))}
            <Wire
              arrow={arrow}
              d={`M${speaker.x + speaker.w} ${MID} H${WIDTH - 2}`}
              look={flow}
            />
            <Label x={WIDTH - 2} y={MID + 12} anchor="end">
              out
            </Label>
            <Wire
              arrow={arrow}
              d={`M${centre(amp)} ${TOP + BAR_H} V${CHIP_Y}`}
              look={supply === SUPPLY.bench ? 'plain' : 'dash'}
            />
            {loaded && (
              <Label x={centre(amp) + 4} y={CHIP_Y - 5}>
                draw
              </Label>
            )}
            <Wire
              arrow={arrow}
              d={`M${centre(amp)} ${LOW_Y} V${CHIP_Y + CHIP_H}`}
              look="dash"
            />
            <BoxView
              box={{
                id: 'supply',
                keys: OPENS.supply,
                name: railName,
                x: centre(amp) - railW / 2,
                y: TOP,
                w: railW,
                h: BAR_H,
                touched: supply !== SUPPLY.bench || loaded,
                help: `The amp runs off the ${railName}. Its headroom is that rail's voltage, and Draw is how hard it pulls on it.`,
              }}
              selected={pick.selected === 'supply'}
              onSelect={pick.toggle}
            />
            <Chip
              box={{
                name: 'pin 7',
                x: centre(amp) - pinW / 2,
                y: LOW_Y,
                w: pinW,
                h: BAR_H,
              }}
              lit={r.value('distBypass') > 0}
              help="The bypass pin. Without its cap, supply ripple and the amp's own current come back into its input."
              pick={pick}
              keys={OPENS['pin 7']}
            />
            {boxes.map((box, i) => (
              <Chip
                key={box.name}
                box={box}
                lit={parts[i]!.lit}
                help={parts[i]!.help}
                pick={pick}
                keys={OPENS[box.name]}
              />
            ))}
          </>
        )}
      </ChipDrawing>
      <BoxRows
        card={card(pick)}
        hint="Press a box for its settings."
        keys={pick.selected ? OPENS[pick.selected] : undefined}
        verbs={pick.selected === 'speaker' ? verbs?.('the speaker') : undefined}
      />
    </>
  )
}
