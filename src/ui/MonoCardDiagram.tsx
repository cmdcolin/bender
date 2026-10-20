import { Chip, type ChipBox } from './BusDiagram.tsx'
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
import { BoxRows, Label, Wire } from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'

const KEYS = [
  'monoHeat',
  'monoLeak',
  'monoCap',
  'monoMismatch',
  'monoDroop',
  'monoDacBit',
  'monoSag',
] as const

const OPENS: Record<string, readonly ControlKey[]> = {
  regulator: ['monoSag'],
  'key DAC': ['monoDacBit'],
  hold: ['monoDroop'],
  'exp conv': ['monoHeat'],
  ladder: ['monoMismatch'],
  VCA: ['monoLeak'],
  contours: ['monoCap'],
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

export function MonoCardDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  useOpensOnAim(pick, OPENS)
  const on = (key: (typeof KEYS)[number]) => r.value(key) > 0
  const flow = useFlow('Growler')

  const parts: { name: string; lit: boolean; help: string }[] = [
    {
      name: 'key DAC',
      lit: on('monoDacBit'),
      help: 'The converter that turns a key number into a pitch voltage. One bit stuck high displaces half the keys.',
    },
    {
      name: 'hold',
      lit: on('monoDroop'),
      help: 'The sample-and-hold capacitor that keeps the pitch voltage while the key is down. A leak makes a held note sink.',
    },
    {
      name: 'exp conv',
      lit: on('monoHeat'),
      help: 'The exponential converter that turns the pitch voltage into oscillator frequencies. Without its heater the three oscillators drift apart, and the board’s own heat adds to it.',
    },
    { name: 'oscs', lit: false, help: 'The three oscillators.' },
    {
      name: 'ladder',
      lit: on('monoMismatch'),
      help: 'The transistor ladder filter. One pair off its partners moves and widens the peak.',
    },
    {
      name: 'VCA',
      lit: on('monoLeak'),
      help: 'The amplifier the loudness contour opens on every note. With a leak, the drone sounds with no key down.',
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

  return (
    <>
      <ChipDrawing
        width={WIDTH}
        height={HEIGHT}
        label="growler voice card faults"
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
            {[conv, ladder].map(b => (
              <Wire
                key={`sag${b.name}`}
                arrow={arrow}
                d={`M${centre(b)} ${TOP + BAR_H} V${CHIP_Y}`}
                look="dash"
              />
            ))}
            {[ladder, vca].map(b => (
              <Wire
                key={`cap${b.name}`}
                arrow={arrow}
                d={`M${centre(b)} ${LOW_Y} V${CHIP_Y + CHIP_H}`}
                look="dash"
              />
            ))}
            <Chip
              box={{ name: 'regulator', x: regX, y: TOP, w: regW, h: BAR_H }}
              lit={on('monoSag')}
              help="The voice card’s supply. Loud notes pull it down, which dips the pitch and closes the filter."
              pick={pick}
              keys={OPENS.regulator}
            />
            <Chip
              box={{ name: 'contours', x: lowX, y: LOW_Y, w: lowW, h: BAR_H }}
              lit={r.value('monoCap') > 1}
              help="The two contour generators, one for the filter and one for the loudness. Bigger timing capacitors stretch every attack, decay and release."
              pick={pick}
              keys={OPENS.contours}
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
      />
    </>
  )
}
