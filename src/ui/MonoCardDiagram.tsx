import { Chip, type ChipBox } from './BusDiagram.tsx'
import { CARDS, keyOf, type CardStage } from './cards.ts'
import { ChipDrawing } from './ChipDrawing.tsx'
import {
  boxHeight,
  boxWidth,
  useFlow,
  useReadings,
  useSelectedBox,
  card,
  spread,
  chainPaths,
  useOpensOnAim,
} from './diagram.ts'
import { Bend, BoxRows, Label, Wire } from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'
import type { CardSuffix } from '../monoCard.ts'

const SUFFIXES = [
  'Heat',
  'Leak',
  'Cap',
  'Mismatch',
  'Droop',
  'DacBit',
  'Sag',
  'RegTrip',
  'Thump',
  'Fold',
] as const satisfies readonly CardSuffix[]

function faultKeys(stage: CardStage) {
  const k = <S extends CardSuffix>(suffix: S) => keyOf(stage, suffix)
  const opens: Record<string, readonly ControlKey[]> = {
    regulator: [k('Sag'), k('RegTrip')],
    'key DAC': [k('DacBit')],
    hold: [k('Droop')],
    'exp conv': [k('Heat')],
    ladder: [k('Mismatch'), k('Fold')],
    VCA: [k('Leak'), k('Thump')],
    contours: [k('Cap')],
  }
  return { keys: SUFFIXES.map(k), opens }
}

const FAULT_KEYS = {
  Growler: faultKeys('Growler'),
  Howler: faultKeys('Howler'),
}

const WIDTH = 420
const TAIL = 30
const TOP = 4
const BAR_H = boxHeight('')
const CHIP_H = boxHeight('a')
const CHIP_Y = TOP + BAR_H + 18
const MID = CHIP_Y + CHIP_H / 2
const LOW_Y = CHIP_Y + CHIP_H + 18
const HEIGHT = LOW_Y + BAR_H + 4

const centre = (b: ChipBox) => b.x + b.w / 2

function CardFaultsDiagram({ stage }: { stage: CardStage }) {
  const { keys, opens } = FAULT_KEYS[stage]
  const k = <S extends (typeof SUFFIXES)[number]>(suffix: S) =>
    keyOf(stage, suffix)
  const r = useReadings(keys)
  const pick = useSelectedBox()
  useOpensOnAim(pick, opens)
  const on = (suffix: (typeof SUFFIXES)[number]) => r.value(k(suffix)) > 0
  const flow = useFlow(stage)

  const parts: { name: string; lit: boolean; help: string }[] = [
    {
      name: 'key DAC',
      lit: on('DacBit'),
      help: 'The converter that turns a key number into a pitch voltage. One bit stuck high displaces half the keys.',
    },
    {
      name: 'hold',
      lit: on('Droop'),
      help: 'The sample-and-hold capacitor that keeps the pitch voltage while the key is down. A leak makes a held note sink.',
    },
    {
      name: 'exp conv',
      lit: on('Heat'),
      help: 'The exponential converter that turns the pitch voltage into oscillator frequencies. Without its heater the three oscillators drift apart, and the board’s own heat adds to it.',
    },
    { name: 'oscs', lit: false, help: 'The three oscillators.' },
    {
      name: 'ladder',
      lit: on('Mismatch') || on('Fold'),
      help: 'The transistor ladder filter. One pair off its partners moves and widens the peak, and an input pair biased off centre folds the wave.',
    },
    {
      name: 'VCA',
      lit: on('Leak') || on('Thump'),
      help: 'The amplifier the loudness contour opens on every note. With a leak, the drone sounds with no key down, and with its control untrimmed every note thumps through.',
    },
  ]
  const widths = parts.map(p => boxWidth(p.name))
  const { xs } = spread(widths, WIDTH - TAIL)
  const boxes = parts.map((p, i): ChipBox => ({
    name: p.name,
    x: xs[i]!,
    y: CHIP_Y,
    w: widths[i]!,
    h: CHIP_H,
  }))
  const at = (name: string) => boxes.find(b => b.name === name)!
  const [conv, ladder, vca] = [at('exp conv'), at('ladder'), at('VCA')]
  const regX = conv.x
  const regW = ladder.x + ladder.w - regX
  const lowX = ladder.x
  const lowW = vca.x + vca.w - lowX
  const supplyBent = on('Sag') || on('RegTrip')

  return (
    <>
      <ChipDrawing
        width={WIDTH}
        height={HEIGHT}
        label={`${CARDS[stage].label} voice card faults`}
      >
        {arrow => (
          <>
            {chainPaths(boxes, MID).map(d => (
              <Wire key={d} arrow={arrow} d={d} look={flow} />
            ))}
            <Wire
              arrow={arrow}
              d={`M${vca.x + vca.w} ${MID} H${WIDTH - 2}`}
              look={flow}
            />
            <Label x={WIDTH - 2} y={MID + 12} anchor="end">
              out
            </Label>
            {[conv, ladder].map(b => {
              const d = `M${centre(b)} ${TOP + BAR_H} V${CHIP_Y}`
              return (
                <Bend
                  key={`sag${b.name}`}
                  name={`supply to ${b.name}`}
                  opens="regulator"
                  pick={pick}
                  hit={d}
                >
                  <Wire arrow={arrow} d={d} look={supplyBent ? 'on' : 'dash'} />
                </Bend>
              )
            })}
            {[ladder, vca].map(b => (
              <Wire
                key={`cap${b.name}`}
                arrow={arrow}
                d={`M${centre(b)} ${LOW_Y} V${CHIP_Y + CHIP_H}`}
                look={b === vca && on('Thump') ? 'on' : 'dash'}
              />
            ))}
            <Chip
              box={{ name: 'regulator', x: regX, y: TOP, w: regW, h: BAR_H }}
              lit={supplyBent}
              help="The voice card’s supply. Loud notes pull it down, which dips the pitch and closes the filter. A hot regulator shuts off and on in bursts at its thermal limit."
              pick={pick}
              keys={opens.regulator}
            />
            <Chip
              box={{ name: 'contours', x: lowX, y: LOW_Y, w: lowW, h: BAR_H }}
              lit={r.value(k('Cap')) > 1}
              help="The two contour generators, one for the filter and one for the loudness. Bigger timing capacitors stretch every attack, decay and release."
              pick={pick}
              keys={opens.contours}
            />
            {boxes.map((box, i) => (
              <Chip
                key={box.name}
                box={box}
                lit={parts[i]!.lit}
                help={parts[i]!.help}
                pick={pick}
                keys={opens[box.name]}
              />
            ))}
          </>
        )}
      </ChipDrawing>
      <BoxRows
        card={card(pick)}
        hint="Press a box for its settings."
        keys={pick.selected ? opens[pick.selected] : undefined}
      />
    </>
  )
}

export function MonoCardDiagram() {
  return <CardFaultsDiagram stage="Growler" />
}

export function LeadCardDiagram() {
  return <CardFaultsDiagram stage="Howler" />
}
