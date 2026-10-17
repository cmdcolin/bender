import {
  boxHeight,
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
  'fmVoice',
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

const TOP = 6
const ROW = 50
const TWO = boxHeight(['', ''])
const ONE = boxHeight('')

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
  const moved = (keys: readonly Key[]) => keys.filter(k => r.touched(k)).length
  const tally = (keys: readonly Key[]) => {
    const n = moved(keys)
    return n ? `${n} moved` : 'stock'
  }
  const box = (
    id: string,
    x: number,
    y: number,
    w: number,
    value: string | string[],
    keys: readonly Key[],
    help: string,
    off = false,
  ): BoxSpec => ({
    id,
    keys,
    x,
    y,
    w,
    name: id,
    value,
    off,
    touched: moved(keys) > 0,
    help,
  })
  const mid = TOP + ROW + TWO / 2
  const centred = (value: string | string[]) => mid - boxHeight(value) / 2
  const boxes = [
    box(
      'clocks',
      208,
      TOP,
      156,
      [`chip ${r.read('fmClockX')}`, `cpu ${r.read('fmCpuClockX')}`],
      ['fmClockX', 'fmCpuClockX'],
      'The chip’s clock and the processor’s: pitch and every envelope count off the first, the driver’s timers off the second.',
    ),
    box(
      'key',
      0,
      centred(r.read('fmLength')),
      50,
      r.read('fmLength'),
      ['fmStruck', 'fmKeyGate', 'fmLength'],
      'What strikes a note, and how long the processor holds it when nothing else does.',
    ),
    box(
      'processor',
      62,
      centred(r.read('fmVoice')),
      72,
      r.read('fmVoice'),
      ['fmEffect', 'fmRhythm', 'fmNoiseBlob'],
      'The driver: it sends the voice, runs the effect ROM and the rhythm bank.',
    ),
    box(
      'bus',
      146,
      centred(tally(KNIFE)),
      50,
      tally(KNIFE),
      KNIFE,
      'The eight data lines and six address lines the writes travel on: put a knife through one.',
    ),
    box(
      'modulator',
      208,
      TOP + ROW,
      72,
      [`bright ${r.read('fmBright')}`, `fb ${r.read('fmFeedback')}`],
      ['fmBright', 'fmFeedback', 'fmModRatio', 'fmModDecay'],
      'The operator that bends the carrier: how loud it is into it, how much of it goes back into itself, its ratio and decay.',
    ),
    box(
      'carrier',
      292,
      TOP + ROW,
      72,
      [r.read('fmCarRatio'), `vib ${r.read('fmLfo')}`],
      ['fmCarRatio', 'fmLfo'],
      'The operator you hear: its ratio, and whether the die’s one LFO is soldered to it.',
    ),
    box(
      'output',
      376,
      centred(r.read('fmDrive')),
      50,
      r.read('fmDrive'),
      ['fmDrive'],
      'The one output stage the four voices share.',
    ),
    box(
      'die',
      262,
      TOP + ROW * 2,
      102,
      tally(DIE),
      DIE,
      'The silicon’s own faults: the DAC slot, the voice allocator, the cold boot and the log adder.',
    ),
  ]
  const open = boxes.find(b => b.id === pick.selected)
  const y = (b: string) => {
    const spec = boxes.find(x => x.id === b)!
    return spec.y + boxHeight(spec.value) / 2
  }
  const edge = (a: string, to: string) => {
    const from = boxes.find(b => b.id === a)!
    const next = boxes.find(b => b.id === to)!
    return `M${from.x + from.w} ${y(a)} H${next.x}`
  }
  return (
    <>
      <Diagram
        width={430}
        height={TOP + ROW * 2 + ONE + 8}
        label="FM chip signal path"
      >
        {arrow => (
          <>
            <Wire arrow={arrow} d={edge('key', 'processor')} />
            <Wire arrow={arrow} d={edge('processor', 'bus')} look="on" />
            <Wire arrow={arrow} d={edge('bus', 'modulator')} look="on" />
            <Wire arrow={arrow} d={edge('modulator', 'carrier')} look="on" />
            <Wire arrow={arrow} d={edge('carrier', 'output')} look="on" />
            {[244, 328].map(x => (
              <Wire
                key={x}
                d={`M${x} ${y('clocks') + TWO / 2} V${TOP + ROW}`}
                look="dash"
              />
            ))}
            {[280, 328].map(x => (
              <Wire
                key={x}
                d={`M${x} ${TOP + ROW * 2} V${TOP + ROW + TWO}`}
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
