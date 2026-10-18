import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import chip from './ChipLook.module.css'
import { CHANNELS, GROUPS, sliderFor } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import { boxHeight, boxWidth, useReadings, useSelectedBox } from './diagram.ts'
import {
  BoxRows,
  Diagram,
  Pressable,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'
import { slidersFirst } from './slidersFirst.ts'
import { NODE_KEYS } from './toyBoxKeys.ts'

import type { ControlKey } from '../controls.ts'
import type { DrawingProps } from './foldDrawings.tsx'

const KEYS = [
  'chipBendSpot',
  'chipBendPot',
  'chipDrift',
  'chipCrosstalk',
  'chipScan',
  'chipPwm',
  'chipEnvCap',
  'chipShort',
  'chipGhost',
  'chipStepTap',
  'chipEnvRelax',
  'chipEnvDiv',
  'chipOutAddr',
  'chipOutData',
  'chipPwmTap',
] as const

const GROUP = GROUPS.find(g => g.name === 'Toy keyboard')!

const BUS = 'knife on the bus'
const KEYBOARD = 'keyboard'

const keysOf = (part: string): ControlKey[] =>
  GROUP.sliders.filter(d => d.part === part).map(d => d.key)

const BUS_KEYS = keysOf(BUS)

const LEAD_KEYS = GROUP.lead ?? []
const PLAY_KEYS = [
  ...slidersFirst(
    GROUP.sliders.filter(d => !d.part && !LEAD_KEYS.includes(d.key)),
  ),
  ...slidersFirst(GROUP.sliders.filter(d => d.part === 'arp and key lock')),
].map(d => d.key)
const KEYBOARD_KEYS = [...LEAD_KEYS, ...PLAY_KEYS]

const SPOTS = sliderFor('chipBendSpot').choices!

const TOY_TAP = CHANNELS.find(c => c.name === 'Toy keyboard')!.tap

const WIDTH = 420
const ROOM = 22
const ROW_GAP = 44
const BOX_H = boxHeight('a')
const GAPS = [30, 38, 22]
const TAIL = 34
const TOP = ROOM
const LOW = TOP + BOX_H + ROW_GAP
const STUB = 7
const BUS_Y = TOP + BOX_H + 12
const HEIGHT = LOW + BOX_H + ROOM
const VOICES_W = 64
const GLYPH_W = 18
const GLYPH_GAP = 4
const INSET = boxWidth('') / 2
const SIDE = 6

// Which box each bend spot solders the pot onto.
const SPOT_BOX: Record<string, string> = {
  clock: 'clock',
  counter: 'tune ROM',
  bias: 'output pin',
  gate: 'envelope',
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const middle = (b: ChipBox) => b.x + b.w / 2

// A variable resistor from a spot on the die to ground, above or below its box.
function Pot({
  x,
  y,
  dir,
  on,
  box,
  pick,
}: {
  x: number
  y: number
  dir: 1 | -1
  on: boolean
  box: string
  pick: ReturnType<typeof useSelectedBox>
}) {
  const at = (d: number) => y + dir * d
  const zig = [3, 5, 7, 9, 11, 13]
    .map((d, i) => `L${x + (i % 2 ? 3 : -3)} ${at(d)}`)
    .join(' ')
  const g = at(16)
  return (
    <Pressable
      name="bend pot"
      selected={pick.selected === box}
      onSelect={() => pick.toggle(box)}
      className={on ? styles.potOn : styles.pot}
    >
      <path
        d={`M${x} ${y} V${at(3)} ${zig} L${x} ${at(14)} V${g} M${x - 5} ${g} H${x + 5} M${x - 3} ${g + dir * 2} H${x + 3} M${x - 1} ${g + dir * 4} H${x + 1}`}
      />
      <path d={`M${x - 6} ${at(12)} L${x + 6} ${at(4)}`} />
      <text x={x + 9} y={at(10) + 3}>
        pot
      </text>
    </Pressable>
  )
}

// The keys the player presses: the playing knobs live behind this box.
function KeyboardNode({
  box,
  lit,
  pick,
}: {
  box: ChipBox
  lit: boolean
  pick: ReturnType<typeof useSelectedBox>
}) {
  const x = box.x + INSET
  const y = box.y + (box.h - 12) / 2
  return (
    <Pressable
      name={KEYBOARD}
      selected={pick.selected === KEYBOARD}
      onSelect={() => pick.toggle(KEYBOARD)}
    >
      <title>
        keyboard — the tune, level, tone, accompaniment, arpeggio and key lock
      </title>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={3}
        className={lit ? styles.chipOn : styles.chip}
      />
      <g className={lit ? styles.glyphOn : undefined}>
        <rect
          x={x}
          y={y}
          width={GLYPH_W}
          height={12}
          rx={1.5}
          className={styles.glyph}
        />
        <path
          d={[4.5, 9, 13.5]
            .map(dx => `M${x + dx} ${y + 7} V${y + 12}`)
            .join(' ')}
          className={styles.glyph}
        />
        {[3.5, 8, 12.5].map(dx => (
          <rect
            key={dx}
            x={x + dx}
            y={y}
            width={2}
            height={7}
            className={styles.glyphKey}
          />
        ))}
      </g>
      <text
        x={x + GLYPH_W + GLYPH_GAP}
        y={box.y + box.h / 2 + 3}
        className={lit ? styles.chipNameOn : styles.chipName}
      >
        {KEYBOARD}
      </text>
    </Pressable>
  )
}

function Node({
  box,
  lit,
  help,
  pick,
}: {
  box: ChipBox
  lit?: boolean
  help: string
  pick: ReturnType<typeof useSelectedBox>
}) {
  return (
    <Pressable
      name={box.name}
      selected={pick.selected === box.name}
      onSelect={() => pick.toggle(box.name)}
    >
      <Chip box={box} lit={lit} help={help} />
    </Pressable>
  )
}

// A clock input or output drawn as a labelled stub instead of a wire: the clock
// reaches four parts, and wires to all of them crowd out the signal path.
function ClockTag({
  x,
  y,
  dir,
  say = 'clk',
  on = false,
}: {
  x: number
  y: number
  dir: 1 | -1
  say?: string
  on?: boolean
}) {
  const end = y + dir * STUB
  return (
    <>
      <Wire d={`M${x} ${y} V${end}`} look={on ? 'alarm' : 'plain'} />
      <text
        x={x + 3}
        y={dir < 0 ? y - 1 : end + 1}
        className={on ? styles.tagOn : styles.tag}
      >
        {say}
      </text>
    </>
  )
}

function Say({
  x,
  y,
  anchor,
  children,
}: {
  x: number
  y: number
  anchor?: 'start' | 'middle' | 'end'
  children: string
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={styles.knifed}>
      {children}
    </text>
  )
}

// The parts of the toy chip the pin bends reach. The key matrix and the tune ROM
// strike the voices, each voice's envelope sets its level, and the output pin
// carries every voice off the chip. One clock times the voices, the scan counter
// and the PWM carrier. Each feedback bend solders one part's signal onto another
// part, and the drawing gives each one its own red wire.
export function ToyDieDiagram({ verbs, editor }: DrawingProps) {
  const r = useReadings(KEYS)
  const knifed = useReadings(BUS_KEYS).touched(...BUS_KEYS)
  const played = useReadings(KEYBOARD_KEYS).touched(...KEYBOARD_KEYS)
  const pick = useSelectedBox(knifed ? 'bus' : KEYBOARD)
  const editing = Boolean(editor)
  const [wasEditing, setWasEditing] = useState(editing)
  if (editing !== wasEditing) {
    setWasEditing(editing)
    if (editing && pick.selected !== KEYBOARD) pick.toggle(KEYBOARD)
  }
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
  const up = (key: (typeof KEYS)[number]) => r.value(key) > 0
  const flow: WireLook = useStoreSelect(
    engine.sounding,
    lit => lit & (1 << TOY_TAP),
  )
    ? 'on'
    : 'plain'

  const names = ['key matrix', 'voices', 'envelope', 'output pin']
  const widths = [
    boxWidth('key matrix'),
    VOICES_W,
    boxWidth('envelope'),
    boxWidth('output pin'),
  ]
  const keyboardW = boxWidth(KEYBOARD) + GLYPH_W + GLYPH_GAP
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
  const mid = LOW + BOX_H / 2
  const pinRight = pin.x + pin.w
  const tap = middle(clock)
  const stepX = voices.x + 6
  const spot = read('chipBendSpot')
  const spotBox = spot > 0 ? SPOT_BOX[SPOTS[spot]!] : undefined
  const potted = (name: string) => spotBox === name
  const scan = up('chipScan')
  const pwmTap = up('chipPwmTap')
  const stepTap = up('chipStepTap')
  const cross = up('chipCrosstalk')
  const pwm = up('chipPwm') && !pwmTap
  const potAt: Record<string, [number, number, 1 | -1]> = {
    clock: [clock.x + 12, TOP, -1],
    'tune ROM': [middle(rom), TOP, -1],
    'output pin': [middle(pin), LOW + BOX_H, 1],
    envelope: [middle(env), LOW + BOX_H, 1],
  }
  const placed = spotBox ? potAt[spotBox] : undefined
  const loopL = env.x + env.w * 0.7
  const loopR = env.x + env.w - 5
  return (
    <>
      <div className={chip.chips}>
        <Diagram
          width={Math.max(WIDTH, width)}
          left={Math.max(0, (WIDTH - width) / 2)}
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
              <text
                x={width - 2}
                y={mid - 4}
                textAnchor="end"
                className={styles.bus}
              >
                out
              </text>
              <Wire d={`M${feed} ${TOP + BOX_H} V${bus.y}`} />
              <Wire
                arrow={arrow}
                d={`M${feed} ${bus.y + BOX_H} V${LOW}`}
                look={knifed ? 'alarm' : 'plain'}
              />
              {stepTap && (
                <>
                  <Wire
                    arrow={arrow}
                    d={`M${stepX} ${LOW} V${TOP + BOX_H}`}
                    look="alarm"
                  />
                  <Say x={stepX - 4} y={TOP + BOX_H + 22} anchor="end">
                    step tap
                  </Say>
                </>
              )}
              <ClockTag x={clock.x + 10} y={TOP + BOX_H} dir={1} />
              <ClockTag x={rom.x + 10} y={TOP} dir={-1} />
              <ClockTag x={voices.x + voices.w - 10} y={LOW} dir={-1} />
              <ClockTag
                x={env.x + 12}
                y={LOW}
                dir={-1}
                say={pwm ? 'PWM' : 'clk'}
                on={pwm}
              />
              <ClockTag
                x={pin.x + 12}
                y={LOW}
                dir={-1}
                say={scan ? 'scan' : 'clk'}
                on={scan}
              />
              {pwmTap && (
                <>
                  <Wire
                    arrow={arrow}
                    d={`M${voices.x + voices.w} ${mid - SIDE} H${env.x}`}
                    look="alarm"
                  />
                  <Say
                    x={(voices.x + voices.w + env.x) / 2}
                    y={LOW - 4}
                    anchor="middle"
                  >
                    PWM
                  </Say>
                </>
              )}
              {up('chipEnvDiv') && (
                <>
                  <Wire
                    arrow={arrow}
                    d={`M${env.x} ${mid + SIDE} H${voices.x + voices.w}`}
                    look="alarm"
                  />
                  <Say
                    x={(voices.x + voices.w + env.x) / 2}
                    y={LOW + BOX_H + 11}
                    anchor="middle"
                  >
                    dive
                  </Say>
                </>
              )}
              {up('chipEnvRelax') && (
                <>
                  <Wire
                    d={`M${loopL} ${LOW} V${LOW - 6} H${loopR} V${LOW}`}
                    look="alarm"
                  />
                  <Say x={env.x + env.w + 3} y={LOW - 2}>
                    relax
                  </Say>
                </>
              )}
              {cross && (
                <>
                  <Wire
                    arrow={arrow}
                    d={`M${tap} ${mid} V${TOP + BOX_H}`}
                    look="alarm"
                  />
                  <circle cx={tap} cy={mid} r={1.6} className={styles.solder} />
                  <Say x={tap - 4} y={LOW - 18} anchor="end">
                    crosstalk
                  </Say>
                </>
              )}
              <Node
                pick={pick}
                box={rom}
                lit={
                  up('chipOutAddr') || up('chipOutData') || potted('tune ROM')
                }
                help="The counter that steps through the tune and the ROM that holds its notes. The output pin can be soldered onto one of its address or note-code wires."
              />
              <Node
                pick={pick}
                box={clock}
                lit={up('chipDrift') || potted('clock')}
                help="The crystal and its divider. Pitch, tempo, the scan counter and the PWM carrier all count off it."
              />
              <Node
                pick={pick}
                box={keys}
                lit={up('chipGhost')}
                help="The rows and columns the keys close. With the diodes lifted, holding two keys also closes the other two corners of their rectangle."
              />
              <Node
                pick={pick}
                box={voices}
                help="The tone generators, one a note, each with its own pitch divider."
              />
              <Node
                pick={pick}
                box={env}
                lit={up('chipEnvCap') || potted('envelope')}
                help="The capacitor each note’s level follows. The PWM carrier switches that level on and off."
              />
              <Node
                pick={pick}
                box={pin}
                lit={(!scan && up('chipShort')) || potted('output pin')}
                help="The pin that carries every voice off the chip. The scan counter connects one voice to it at a time, and a short ties every voice onto it."
              />
              <KeyboardNode box={keyboard} lit={played} pick={pick} />
              <Node
                pick={pick}
                box={bus}
                lit={knifed}
                help="The address and data wires between the counter, the tune ROM and the voices. The rows put a knife on them."
              />
              {placed && (
                <Pot
                  x={placed[0]}
                  y={placed[1]}
                  dir={placed[2]}
                  on={up('chipBendPot')}
                  box={spotBox!}
                  pick={pick}
                />
              )}
            </>
          )}
        </Diagram>
      </div>
      {pick.selected === KEYBOARD ? (
        <BoxRows
          keys={KEYBOARD_KEYS}
          under={editor ? { keys: LEAD_KEYS, node: editor } : undefined}
        />
      ) : (
        <BoxRows
          hint="Press a box for its settings."
          keys={
            pick.selected === 'bus'
              ? BUS_KEYS
              : pick.selected
                ? NODE_KEYS[pick.selected]
                : undefined
          }
          verbs={pick.selected === 'bus' && verbs?.(BUS)}
        />
      )}
    </>
  )
}
