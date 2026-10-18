import { engine } from '../engine/engine.ts'
import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import chip from './ChipLook.module.css'
import { CHANNELS, sliderFor } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import { boxHeight, boxWidth, useReadings } from './diagram.ts'
import { Diagram, Label, Wire, type WireLook } from './DiagramParts.tsx'

const KEYS = [
  'monoHeat',
  'monoLeak',
  'monoCap',
  'monoMismatch',
  'monoDroop',
  'monoDacBit',
  'monoSag',
] as const

const DAC_BITS = sliderFor('monoDacBit').choices!

const MONO_TAP = CHANNELS.find(c => c.name === 'Mono synth')!.tap

const WIDTH = 420
const TAIL = 30
const TOP = 4
const BAR_H = boxHeight('')
const CHIP_H = boxHeight('a\nb')
const CHIP_Y = TOP + BAR_H + 18
const MID = CHIP_Y + CHIP_H / 2
const LOW_Y = CHIP_Y + CHIP_H + 18
const HEIGHT = LOW_Y + BAR_H + 4

const centre = (b: ChipBox) => b.x + b.w / 2

const percent = (v: number) => `${Math.round(v * 100)}%`
const perSecond = (v: number) => `${+v.toFixed(2)}/s`
const fullPercent = (key: (typeof KEYS)[number]) => percent(sliderFor(key).max)

function Bar({
  x,
  y,
  w,
  name,
  reading,
  help,
}: {
  x: number
  y: number
  w: number
  name: string
  reading?: string
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
        className={styles.chip}
      />
      <text
        x={x + w / 2}
        y={y + BAR_H - 6}
        textAnchor="middle"
        className={styles.chipName}
      >
        {name}
        {reading && (
          <tspan dx={6} className={styles.knifed}>
            {reading}
          </tspan>
        )}
      </text>
    </g>
  )
}

export function MonoCardDiagram() {
  const r = useReadings(KEYS)
  const on = (key: (typeof KEYS)[number]) => r.value(key) > 0
  const flow: WireLook = useStoreSelect(
    engine.sounding,
    lit => lit & (1 << MONO_TAP),
  )
    ? 'on'
    : 'plain'
  const bit = Math.round(r.value('monoDacBit'))
  const cap = r.value('monoCap')

  const parts: {
    name: string
    room: string
    reading?: string
    help: string
  }[] = [
    {
      name: 'key DAC',
      room: DAC_BITS.at(-1)!,
      reading: bit > 0 ? DAC_BITS[bit] : undefined,
      help: 'The converter that turns a key number into a pitch voltage. One bit stuck high displaces half the keys.',
    },
    {
      name: 'hold',
      room: perSecond(sliderFor('monoDroop').max - 0.01),
      reading: on('monoDroop') ? perSecond(r.value('monoDroop')) : undefined,
      help: 'The sample-and-hold capacitor that keeps the pitch voltage while the key is down. A leak makes a held note sink.',
    },
    {
      name: 'exp conv',
      room: fullPercent('monoHeat'),
      reading: on('monoHeat') ? percent(r.value('monoHeat')) : undefined,
      help: 'The exponential converter that turns the pitch voltage into oscillator frequencies. Without its heater the three oscillators drift apart, and the board’s own heat adds to it.',
    },
    { name: 'oscs', room: '', help: 'The three oscillators.' },
    {
      name: 'ladder',
      room: fullPercent('monoMismatch'),
      reading: on('monoMismatch')
        ? percent(r.value('monoMismatch'))
        : undefined,
      help: 'The transistor ladder filter. One pair off its partners moves and widens the peak.',
    },
    {
      name: 'VCA',
      room: fullPercent('monoLeak'),
      reading: on('monoLeak') ? percent(r.value('monoLeak')) : undefined,
      help: 'The amplifier the loudness contour opens on every note. With a leak, the drone sounds with no key down.',
    },
  ]
  const widths = parts.map(p => Math.max(boxWidth(p.name), boxWidth(p.room)))
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

  return (
    <div className={chip.chips}>
      <Diagram
        width={WIDTH}
        height={HEIGHT}
        label="mono synth voice card faults"
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
            <Bar
              x={regX}
              y={TOP}
              w={regW}
              name="regulator"
              reading={on('monoSag') ? percent(r.value('monoSag')) : undefined}
              help="The voice card’s supply. Loud notes pull it down, which dips the pitch and closes the filter."
            />
            <Bar
              x={lowX}
              y={LOW_Y}
              w={lowW}
              name="contours"
              reading={cap > 1 ? `×${+cap.toFixed(1)}` : undefined}
              help="The two contour generators, one for the filter and one for the loudness. Bigger timing capacitors stretch every attack, decay and release."
            />
            {boxes.map((box, i) => (
              <Chip
                key={box.name}
                box={box}
                reading={parts[i]!.reading}
                help={parts[i]!.help}
              />
            ))}
          </>
        )}
      </Diagram>
    </div>
  )
}
