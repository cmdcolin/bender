import { engine } from '../engine/engine.ts'
import { CHANNELS } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import {
  boxHeight,
  boxWidth,
  useReadings,
  useSelectedBox,
  type BoxSpec,
} from './diagram.ts'
import { BoxRows, BoxView, Diagram, Wire } from './DiagramParts.tsx'

import type { ReactNode } from 'react'

const KNIFE = [
  'fmDataLine',
  'fmDataFault',
  'fmAddrLine',
  'fmAddrFault',
  'fmWaveLine',
  'fmWaveFault',
  'fmWaveDataLine',
  'fmWaveDataFault',
  'fmPatchLine',
  'fmPatchFault',
  'fmPatchDataLine',
  'fmPatchDataFault',
  'fmBusCut',
  'fmStrobe',
  'fmToyBus',
] as const

const DIE = [
  'fmDacSlot',
  'fmDacSlip',
  'fmAlloc',
  'fmColdBoot',
  'fmAdder',
] as const

const KEYS = [
  'fmStruck',
  'fmKeyGate',
  'fmLength',
  'fmEffect',
  'fmRhythm',
  'fmNoiseBlob',
  'fmClockX',
  'fmCpuClockX',
  'fmBright',
  'fmFeedback',
  'fmModRatio',
  'fmModDecay',
  'fmCarRatio',
  'fmLfo',
  'fmDrive',
  ...KNIFE,
  ...DIE,
] as const

type Key = (typeof KEYS)[number]

// The folds these boxes took over, whose dice and named cuts go with them.
const PARTS: Record<string, string> = {
  bus: 'knife on the bus',
  die: 'die and driver',
}

const FM_TAP = CHANNELS.find(c => c.name === 'FM chip')!.tap

const TOP = 4
const ROW = 38
const WIDTH = 420
const BOX_H = boxHeight('')

// The chip as the board wires it: a processor that decides the sound and writes
// it as bytes down a bus into the register file, two operators the bytes
// configure — the modulator feeding the carrier — and one output stage behind
// them. The key and the clocks come in from above, and the die's own faults sit
// under the operators. Each box opens the knobs of the part it stands for.
export function FmChipDiagram({
  verbs,
}: {
  verbs: (part: string) => ReactNode
}) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox('modulator')
  // Off the meter on the chip's channel, as the map's glyph reads it.
  const flow = useStoreSelect(engine.sounding, lit => lit & (1 << FM_TAP))
    ? 'on'
    : 'plain'
  const path: [string, readonly Key[], string][] = [
    [
      'key',
      ['fmStruck', 'fmKeyGate', 'fmLength'],
      'What strikes a note, and how long the processor holds it when nothing else does.',
    ],
    [
      'processor',
      ['fmEffect', 'fmRhythm', 'fmNoiseBlob'],
      'The driver: it sends the voice, runs the effect ROM and the rhythm bank.',
    ],
    [
      'bus',
      KNIFE,
      'The eight data lines and six address lines the writes travel on: put a knife through one.',
    ],
    [
      'modulator',
      ['fmBright', 'fmFeedback', 'fmModRatio', 'fmModDecay'],
      'The operator that bends the carrier: how loud it is into it, how much of it goes back into itself, its ratio and decay.',
    ],
    [
      'carrier',
      ['fmCarRatio', 'fmLfo'],
      'The operator you hear: its ratio, and whether the die’s one LFO is soldered to it.',
    ],
    ['output', ['fmDrive'], 'The one output stage the four voices share.'],
  ]
  const box = (
    id: string,
    x: number,
    y: number,
    w: number,
    keys: readonly Key[],
    help: string,
  ): BoxSpec => ({
    id,
    keys,
    x,
    y,
    w,
    name: id,
    touched: r.touched(...keys),
    help,
  })
  const widths = path.map(([id]) => boxWidth(id))
  const gap = (WIDTH - 2 - widths.reduce((a, b) => a + b)) / (widths.length - 1)
  let x = 0
  const row = path.map(([id, keys, help], i) => {
    const spec = box(id, Math.round(x), TOP + ROW, widths[i]!, keys, help)
    x += spec.w + gap
    return spec
  })
  const at = (id: string) => row.find(b => b.id === id)!
  const mod = at('modulator')
  const car = at('carrier')
  const span = car.x + car.w - mod.x
  const boxes = [
    ...row,
    box(
      'clocks',
      mod.x,
      TOP,
      span,
      ['fmClockX', 'fmCpuClockX'],
      'The chip’s clock and the processor’s: pitch and every envelope count off the first, the driver’s timers off the second.',
    ),
    box(
      'die',
      mod.x,
      TOP + ROW * 2,
      span,
      DIE,
      'The silicon’s own faults: the DAC slot, the voice allocator, the cold boot and the log adder.',
    ),
  ]
  const open = boxes.find(b => b.id === pick.selected)
  const mid = TOP + ROW + BOX_H / 2
  const edge = (from: BoxSpec, to: BoxSpec) =>
    `M${from.x + from.w} ${mid} H${to.x}`
  const drops = [mod.x + mod.w / 2, car.x + car.w / 2]
  return (
    <>
      <Diagram
        width={WIDTH}
        height={TOP + ROW * 2 + BOX_H + 4}
        label="FM chip signal path"
      >
        {arrow => (
          <>
            {row.slice(1).map((to, i) => (
              <Wire
                key={to.id}
                arrow={arrow}
                d={edge(row[i]!, to)}
                look={i === 0 ? 'plain' : flow}
              />
            ))}
            {drops.map(drop => (
              <Wire
                key={`clock${drop}`}
                d={`M${drop} ${TOP + BOX_H} V${TOP + ROW}`}
                look="dash"
              />
            ))}
            {drops.map(drop => (
              <Wire
                key={`die${drop}`}
                d={`M${drop} ${TOP + ROW * 2} V${TOP + ROW + BOX_H}`}
                look="dash"
              />
            ))}
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
      <BoxRows
        keys={open?.keys}
        verbs={open && PARTS[open.id!] && verbs(PARTS[open.id!]!)}
      />
    </>
  )
}
