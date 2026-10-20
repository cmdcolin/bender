import { ChipDrawing } from './ChipDrawing.tsx'
import {
  boxWidth,
  ONE_LINE_H,
  useFlow,
  useReadings,
  useSelectedBox,
  boxMaker,
  chainPaths,
  spread,
} from './diagram.ts'
import { Bend, BoxRows, BoxView, OpenBox, Wire } from './DiagramParts.tsx'
import { FmVoiceDiagram } from './FmVoiceDiagram.tsx'
import { VOICE_IDS, VOICE_PICKS } from './fmVoicePicks.ts'

import type { Verbs, Zoom } from './foldHosting.ts'

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
  'fmSfxWire',
  'fmSfxPick',
  'fmSfxHold',
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
  'fmLevel',
  'fmMute',
  'fmVoice',
  ...KNIFE,
  ...DIE,
] as const

type Key = (typeof KEYS)[number]

// The folds these boxes took over, whose dice and named cuts go with them.
const PARTS: Record<string, string> = {
  bus: 'knife on the bus',
  die: 'die and driver',
}

const TOP = 4
const ROW = 34
const WIDTH = 420
const BOX_H = ONE_LINE_H

// The chip as the board wires it: a processor that decides the sound and writes
// it as bytes down a bus into the register file, two operators the bytes
// configure — the modulator feeding the carrier — and one output stage behind
// them. The key and the clocks come in from above, and the die's own faults sit
// under the operators. Each box opens the knobs of the part it stands for.
export function FmChipDiagram({ verbs, zoom }: { verbs: Verbs; zoom?: Zoom }) {
  const r = useReadings(KEYS)
  const pick = useSelectedBox('modulator')
  const flow = useFlow('Glint')
  const path: [string, readonly Key[], string][] = [
    [
      'key',
      ['fmStruck', 'fmKeyGate', 'fmLength'],
      'What strikes a note, and how long the processor holds it when nothing else does.',
    ],
    [
      'processor',
      [
        'fmVoice',
        'fmEffect',
        'fmSfxWire',
        'fmSfxPick',
        'fmSfxHold',
        'fmRhythm',
        'fmNoiseBlob',
      ],
      'The driver: it sends the voice, runs the effect ROM and the rhythm bank, and reads the effect buttons.',
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
    [
      'output',
      ['fmLevel', 'fmMute', 'fmDrive'],
      'The one output stage the four voices share, and Glint’s fader into the source mix.',
    ],
  ]
  const box = boxMaker(r.touched)
  const widths = path.map(([id]) => boxWidth(id))
  const { xs } = spread(widths, WIDTH - 2)
  const row = path.map(([id, keys, help], i) =>
    box(id, xs[i]!, TOP + ROW, widths[i]!, keys, help),
  )
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
  const open =
    boxes.find(b => b.id === pick.selected) ??
    VOICE_PICKS.find(p => p.id === pick.selected)
  const zoomed = pick.selected !== null && VOICE_IDS.includes(pick.selected)
  const feet = TOP + ROW * 2 + BOX_H + 4
  const mid = TOP + ROW + BOX_H / 2
  const drops = [mod.x + mod.w / 2, car.x + car.w / 2]
  const clockDrops = drops.map(dx => `M${dx} ${TOP + BOX_H} V${TOP + ROW}`)
  const dieDrops = drops.map(
    dx => `M${dx} ${TOP + ROW * 2} V${TOP + ROW + BOX_H}`,
  )
  const part = open && PARTS[open.id!]
  const close = zoomed ? <FmVoiceDiagram pick={pick} /> : part && zoom?.(part)
  return (
    <>
      <ChipDrawing width={WIDTH} height={feet} label="glint signal path">
        {arrow => (
          <>
            {chainPaths(row, mid).map((d, i) => (
              <Wire
                key={d}
                arrow={arrow}
                d={d}
                look={i === 0 ? 'plain' : flow}
              />
            ))}
            {(
              [
                ['clocks', 'clock wires', clockDrops],
                ['die', 'die wires', dieDrops],
              ] as const
            ).map(([opens, name, ds]) => (
              <Bend
                key={opens}
                name={name}
                opens={opens}
                pick={pick}
                hit={ds.join(' ')}
              >
                {ds.map(d => (
                  <Wire key={d} arrow={arrow} d={d} look="dash" />
                ))}
              </Bend>
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
      </ChipDrawing>
      {open && (
        <OpenBox name={open.id!} onHide={() => pick.toggle(open.id!)}>
          {close}
          <BoxRows
            title={open.id}
            keys={open.id === 'die' ? [] : open.keys}
            verbs={part && verbs(part)}
          />
        </OpenBox>
      )}
    </>
  )
}
