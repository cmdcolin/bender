import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import chip from './ChipLook.module.css'
import {
  boxHeight,
  boxWidth,
  useFlow,
  useReadings,
  useSelectedBox,
} from './diagram.ts'
import { BoxRows, Diagram, Label, Pressable, Wire } from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'
import type { ReactNode } from 'react'

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

function Bar({
  x,
  y,
  w,
  name,
  lit,
  help,
}: {
  x: number
  y: number
  w: number
  name: string
  lit: boolean
  help: string
}) {
  return (
    <g>
      <title>{`${name} — ${help}`}</title>
      <rect
        x={x}
        y={y}
        width={w}
        height={BAR_H}
        rx={3}
        className={lit ? styles.chipOn : styles.chip}
      />
      <text
        x={x + w / 2}
        y={y + BAR_H - 6}
        textAnchor="middle"
        className={lit ? styles.chipNameOn : styles.chipName}
      >
        {name}
      </text>
    </g>
  )
}

export function MonoCardDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
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
  const gap = (WIDTH - TAIL - widths.reduce((a, b) => a + b)) / 5
  const boxes = parts.map((p, i): ChipBox => ({
    name: p.name,
    x: Math.round(widths.slice(0, i).reduce((a, b) => a + b + gap, 0)),
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

  const node = (name: string, child: ReactNode) => (
    <Pressable
      key={name}
      name={name}
      selected={pick.selected === name}
      onSelect={() => pick.toggle(name)}
    >
      {child}
    </Pressable>
  )

  return (
    <>
      <div className={chip.chips}>
        <Diagram
          width={WIDTH}
          height={HEIGHT}
          label="growler voice card faults"
        >
          {arrow => (
            <>
              {boxes.slice(1).map((to, i) => (
                <Wire
                  key={to.name}
                  arrow={arrow}
                  d={`M${boxes[i]!.x + boxes[i]!.w} ${MID} H${to.x}`}
                  look={flow}
                />
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
              {node(
                'regulator',
                <Bar
                  x={regX}
                  y={TOP}
                  w={regW}
                  name="regulator"
                  lit={on('monoSag')}
                  help="The voice card’s supply. Loud notes pull it down, which dips the pitch and closes the filter."
                />,
              )}
              {node(
                'contours',
                <Bar
                  x={lowX}
                  y={LOW_Y}
                  w={lowW}
                  name="contours"
                  lit={r.value('monoCap') > 1}
                  help="The two contour generators, one for the filter and one for the loudness. Bigger timing capacitors stretch every attack, decay and release."
                />,
              )}
              {boxes.map((box, i) => {
                const chipBox = (
                  <Chip
                    key={box.name}
                    box={box}
                    lit={parts[i]!.lit}
                    help={parts[i]!.help}
                  />
                )
                return OPENS[box.name] ? node(box.name, chipBox) : chipBox
              })}
            </>
          )}
        </Diagram>
      </div>
      <BoxRows
        hint="Press a box for its settings."
        keys={pick.selected ? OPENS[pick.selected] : undefined}
      />
    </>
  )
}
