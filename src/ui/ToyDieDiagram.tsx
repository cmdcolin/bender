import { TUNE_ALL_STEP_KEYS } from '../tune.ts'
import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import { ChipDrawing } from './ChipDrawing.tsx'
import { GROUPS, sliderFor } from './controls/index.ts'
import diagram from './Diagram.module.css'
import {
  boxWidth,
  glyphBoxWidth,
  ONE_LINE_H,
  partKeys,
  useFlow,
  useReadings,
  useSelectedBox,
  type BoxPick,
} from './diagram.ts'
import { BoxRows, GlyphBox, OpenBox, PickPart, Wire } from './DiagramParts.tsx'
import { rollGlyph, ROLL_GLYPH_W } from './rollGlyph.tsx'
import { slidersFirst } from './slidersFirst.ts'
import { NODE_KEYS, POT } from './toyBoxKeys.ts'
import { TuneRoll } from './TuneRoll.tsx'

import type { DrawingProps } from './drawingFor.tsx'

const KEYS = [
  'chipBendSpot',
  'chipBendPot',
  'chipCrosstalk',
  'chipScan',
  'chipPwm',
  'chipStepTap',
  'chipEnvRelax',
  'chipEnvDiv',
  'chipPwmTap',
  'chipHardSync',
  'chipXor',
  'chipDutyEnv',
  'chipEnvBits',
  'chipGhost',
  'chipShort',
  'chipHold',
  'chipFmClock',
  'chipOutAddr',
  'chipOutData',
] as const

const GROUP = GROUPS.find(g => g.name === 'Plinky')!

const BUS = 'knife on the bus'
const DIE = 'inside the die'
const KEYBOARD = 'keyboard'
const ROLL = 'piano roll'

const BUS_KEYS = partKeys('Plinky', BUS)

const MEMORY_KEYS = GROUP.lead ?? []
const WRITTEN_KEYS = [...MEMORY_KEYS, ...TUNE_ALL_STEP_KEYS, 'tuneLen'] as const
const KEYBOARD_KEYS = [
  ...slidersFirst(
    GROUP.sliders.filter(d => !d.part && !MEMORY_KEYS.includes(d.key)),
  ),
  ...slidersFirst(GROUP.sliders.filter(d => d.part === 'arp and key lock')),
].map(d => d.key)

// What lights each box: its own knobs, leaving the pot to the box it sits on.
const OWN_KEYS = Object.fromEntries(
  Object.entries(NODE_KEYS).map(([box, keys]) => [
    box,
    keys.filter(k => !POT.includes(k)),
  ]),
)
const BOX_KEYS = [...new Set(Object.values(OWN_KEYS).flat())]

const SPOTS = sliderFor('chipBendSpot').choices!

const WIDTH = 420
const ROOM = 22
const ROW_GAP = 44
const BOX_H = ONE_LINE_H
const GAPS = [26, 38, 22]
const MEMORY_GAP = 26
const TAIL = 28
const TOP = ROOM
const LOW = TOP + BOX_H + ROW_GAP
const STUB = 7
const BUS_Y = TOP + BOX_H + 12
const HEIGHT = LOW + BOX_H + ROOM
const VOICES_W = 84
// Five white keys, C to G, with the black keys of C, D and F.
const WHITE_W = 4
const GLYPH_W = 5 * WHITE_W
const GLYPH_H = 12
const BLACK_AT = [1, 2, 4]
const BLACK_W = 2.6
const BLACK_H = 7

// Which box each bend spot solders the pot onto.
const SPOT_BOX: Record<string, string> = {
  clock: 'clock',
  counter: 'tune ROM',
  bias: 'output pin',
  gate: 'envelope',
}

// Which box each bend's knob opens.
const BEND_BOX: Partial<Record<(typeof KEYS)[number], string>> = {
  chipCrosstalk: 'clock',
  chipHardSync: 'clock',
  chipFmClock: 'clock',
  chipScan: 'output pin',
  chipHold: 'output pin',
  chipPwm: 'envelope',
  chipEnvRelax: 'envelope',
  chipEnvDiv: 'envelope',
  chipEnvBits: 'envelope',
  chipStepTap: 'tune ROM',
  chipOutAddr: 'tune ROM',
  chipOutData: 'tune ROM',
  chipPwmTap: 'voices',
  chipShort: 'voices',
  chipXor: 'voices',
  chipDutyEnv: 'voices',
  chipGhost: 'key matrix',
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const middle = (b: ChipBox) => b.x + b.w / 2

// The keys the player presses, as five white keys from C with the black keys
// of C, D and F.
function keyboardGlyph(x: number, mid: number) {
  const y = mid - GLYPH_H / 2
  return (
    <>
      <rect
        x={x}
        y={y}
        width={GLYPH_W}
        height={GLYPH_H}
        rx={1}
        className={diagram.glyphLine}
      />
      <path
        d={[1, 2, 3, 4]
          .map(i => {
            const top = BLACK_AT.includes(i) ? y + BLACK_H : y
            return `M${x + i * WHITE_W} ${top} V${y + GLYPH_H}`
          })
          .join(' ')}
        className={diagram.glyphLine}
      />
      <path
        d={BLACK_AT.map(
          i =>
            `M${x + i * WHITE_W - BLACK_W / 2} ${y} h${BLACK_W} v${BLACK_H} h${-BLACK_W} Z`,
        ).join(' ')}
        className={diagram.glyphFill}
      />
    </>
  )
}

// A clock input drawn as a labelled stub on a box's top edge instead of a wire:
// the clock reaches four parts, and wires to all of them crowd out the signal
// path. The tag shows only while the clock is open, to show where it reaches.
function ClockTag({ x, y, pick }: { x: number; y: number; pick: BoxPick }) {
  if (pick.selected !== 'clock') return null
  return (
    <PickPart
      name="clock clk"
      opens="clock"
      pick={pick}
      className={styles.tagPick}
    >
      <path
        d={`M${x - 2} ${y} V${y - STUB - 3} H${x + 26} V${y} Z`}
        className={styles.tagHit}
      />
      <path d={`M${x} ${y} V${y - STUB}`} className={styles.stubOpen} />
      <text x={x + 3} y={y - 1} className={styles.tagOpen}>
        clk
      </text>
    </PickPart>
  )
}

// The parts of the toy chip the pin bends reach. The key matrix and the tune ROM
// strike the voices, each voice's envelope sets its level, and the output pin
// carries every voice off the chip. The piano roll writes a melody memory on
// the ROM's bus. One clock times the voices, the scan counter and the PWM
// carrier. Bends that are on show as the keys under the drawing.
export function ToyDieDiagram({ verbs, zoom }: DrawingProps) {
  const r = useReadings(KEYS)
  const own = useReadings(BOX_KEYS)
  const knifed = useReadings(BUS_KEYS).touched(...BUS_KEYS)
  const played = useReadings(KEYBOARD_KEYS).touched(...KEYBOARD_KEYS)
  const written = useReadings(WRITTEN_KEYS).touched(...WRITTEN_KEYS)
  const pick = useSelectedBox(KEYBOARD)
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
  const up = (key: (typeof KEYS)[number]) => r.value(key) > 0
  const flow = useFlow('Plinky')

  const names = ['key matrix', 'voices', 'envelope', 'output pin']
  const widths = [
    boxWidth('key matrix'),
    VOICES_W,
    boxWidth('envelope'),
    boxWidth('output pin'),
  ]
  const keyboardW = glyphBoxWidth(KEYBOARD, GLYPH_W)
  const lead = Math.max(0, (keyboardW - widths[0]!) / 2)
  const width = widths.reduce((a, b) => a + b, lead + TAIL + sum(GAPS))
  const row = names.map((name, i): ChipBox => ({
    name,
    x: Math.round(lead + sum(widths.slice(0, i)) + sum(GAPS.slice(0, i))),
    y: LOW,
    w: widths[i]!,
    h: BOX_H,
  }))
  const [keys, voices, env, pin] = [row[0]!, row[1]!, row[2]!, row[3]!]
  const over = (under: ChipBox, name: string, w = boxWidth(name)): ChipBox => ({
    name,
    x: Math.round(middle(under) - w / 2),
    y: TOP,
    w,
    h: BOX_H,
  })
  const keyboard = over(keys, KEYBOARD, keyboardW)
  const rom = over(voices, 'tune ROM')
  const clockW = boxWidth('clock')
  const clock: ChipBox = {
    name: 'clock',
    x: width - clockW,
    y: TOP,
    w: clockW,
    h: BOX_H,
  }
  const feed = middle(voices)
  const busW = boxWidth('bus')
  const bus: ChipBox = {
    name: 'bus',
    x: feed - busW / 2,
    y: BUS_Y,
    w: busW,
    h: BOX_H,
  }
  const memory: ChipBox = {
    name: ROLL,
    x: rom.x + rom.w + MEMORY_GAP,
    y: TOP,
    w: glyphBoxWidth(ROLL, ROLL_GLYPH_W),
    h: BOX_H,
  }
  const memoryDrop = memory.x + 12
  const mid = LOW + BOX_H / 2
  const pinRight = pin.x + pin.w
  const spot = read('chipBendSpot')
  const potted = spot > 0 ? SPOT_BOX[SPOTS[spot]!] : undefined
  const lit = (name: string) =>
    own.touched(...OWN_KEYS[name]!) || potted === name
  const open = pick.selected
  const bends = KEYS.flatMap(key => {
    const box = BEND_BOX[key]
    return box && up(key) ? [[key, box] as const] : []
  })
  const span = Math.max(WIDTH, width)
  const left = Math.max(0, (WIDTH - width) / 2)
  return (
    <>
      <ChipDrawing
        width={span}
        left={left}
        height={HEIGHT}
        label="toy chip die"
      >
        {arrow => (
          <>
            <Wire
              arrow={arrow}
              d={`M${middle(keys)} ${TOP + BOX_H} V${LOW}`}
              look={flow}
            />
            {row.slice(1).map((to, i) => (
              <Wire
                key={to.name}
                arrow={arrow}
                d={`M${row[i]!.x + row[i]!.w} ${mid} H${to.x}`}
                look={flow}
              />
            ))}
            <Wire
              arrow={arrow}
              d={`M${pinRight} ${mid} H${width - 2}`}
              look={flow}
            />
            <PickPart name="output pin out" opens="output pin" pick={pick}>
              <text
                x={width - 2}
                y={mid + 11}
                textAnchor="end"
                className={styles.bus}
              >
                out
              </text>
            </PickPart>
            <Wire d={`M${feed} ${TOP + BOX_H} V${bus.y}`} />
            <Wire
              arrow={arrow}
              d={`M${memoryDrop} ${TOP + BOX_H} V${bus.y + BOX_H / 2} H${bus.x + bus.w}`}
              look={written ? flow : 'plain'}
            />
            <Wire
              arrow={arrow}
              d={`M${feed} ${bus.y + BOX_H} V${LOW}`}
              look={knifed ? 'alarm' : 'plain'}
            />
            <ClockTag x={rom.x + 7} y={TOP} pick={pick} />
            <ClockTag x={voices.x + voices.w - 24} y={LOW} pick={pick} />
            <ClockTag x={env.x + 12} y={LOW} pick={pick} />
            <ClockTag x={pin.x + 12} y={LOW} pick={pick} />
            <Chip
              pick={pick}
              box={rom}
              keys={NODE_KEYS[rom.name]}
              lit={lit('tune ROM')}
              help="The counter that steps through the tune and the ROM that holds its notes. The output pin can be soldered onto one of its address or note-code wires."
            />
            <Chip
              pick={pick}
              box={clock}
              keys={NODE_KEYS[clock.name]}
              lit={lit('clock')}
              help="The crystal and its divider. Pitch, tempo, the scan counter and the PWM carrier all count off it."
            />
            <Chip
              pick={pick}
              box={keys}
              keys={NODE_KEYS[keys.name]}
              lit={lit('key matrix')}
              help="The rows and columns the keys close. With the diodes lifted, holding two keys also closes the other two corners of their rectangle."
            />
            <Chip
              pick={pick}
              box={voices}
              keys={NODE_KEYS[voices.name]}
              lit={lit('voices')}
              help="The tone generators, one a note, each with its own pitch divider."
            />
            <Chip
              pick={pick}
              box={env}
              keys={NODE_KEYS[env.name]}
              lit={lit('envelope')}
              help="The capacitor each note’s level follows. The PWM carrier switches that level on and off."
            />
            <Chip
              pick={pick}
              box={pin}
              keys={NODE_KEYS[pin.name]}
              lit={lit('output pin')}
              help="The pin that carries every voice off the chip. The scan counter connects one voice to it at a time, and a short ties every voice onto it."
            />
            <GlyphBox
              {...keyboard}
              help="level, tone, accompaniment, arpeggio and key lock"
              lit={played}
              selected={pick.selected === KEYBOARD}
              onSelect={() => pick.toggle(KEYBOARD)}
              glyphW={GLYPH_W}
              glyph={keyboardGlyph}
            />
            <GlyphBox
              {...memory}
              help="the song the chip plays, and your own melody on a piano roll"
              lit={written}
              selected={pick.selected === ROLL}
              onSelect={() => pick.toggle(ROLL)}
              glyphW={ROLL_GLYPH_W}
              glyph={rollGlyph}
            />
            <Chip
              pick={pick}
              box={bus}
              keys={BUS_KEYS}
              lit={knifed}
              help="The address and data wires between the counter, the tune ROM and the voices. The rows put a knife on them."
            />
          </>
        )}
      </ChipDrawing>
      {bends.length > 0 && (
        <div className={diagram.bends}>
          <p className={diagram.key}>bends you turned on</p>
          {bends.map(([key, box]) => (
            <button
              key={key}
              className={diagram.bend}
              aria-pressed={open === box}
              onClick={() => pick.toggle(box)}
            >
              {sliderFor(key).label}
            </button>
          ))}
        </div>
      )}
      {open === null ? (
        <BoxRows hint="Press a box for its settings." keys={undefined} />
      ) : (
        <OpenBox name={open} onHide={() => pick.toggle(open)}>
          {open === 'bus' && zoom?.(BUS)}
          {open === KEYBOARD ? (
            <BoxRows title={open} keys={KEYBOARD_KEYS} />
          ) : open === ROLL ? (
            <BoxRows
              title={open}
              keys={MEMORY_KEYS}
              inOrder
              under={{ keys: MEMORY_KEYS, node: <TuneRoll /> }}
            />
          ) : (
            <BoxRows
              title={open}
              keys={open === 'bus' ? BUS_KEYS : NODE_KEYS[open]}
              verbs={open === 'bus' ? verbs?.(BUS) : verbs?.(DIE)}
            />
          )}
        </OpenBox>
      )}
    </>
  )
}
