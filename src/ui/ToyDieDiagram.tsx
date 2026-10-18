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
import { BEND_KEYS, NODE_KEYS } from './toyBoxKeys.ts'

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
const ROW_GAP = 32
const BOX_H = boxHeight('a\nb')
const GAPS = [22, 38, 22]
const TAIL = 34
const TOP = ROOM
const LOW = ROOM + BOX_H + ROW_GAP
const SMALL_H = boxHeight('a')
const SMALL_GAP = 14
const SMALL_Y = LOW + BOX_H + SMALL_GAP
const HEIGHT = SMALL_Y + SMALL_H + 4
const VOICES_W = 64
const KEYBOARD_W = 30
const KEYBOARD_GAP = 18
const SIDE = 11

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const bent = (on: boolean): WireLook => (on ? 'alarm' : 'dash')

// A variable resistor from a spot on the die to ground, above or below its box.
function Pot({
  x,
  y,
  dir,
  on,
}: {
  x: number
  y: number
  dir: 1 | -1
  on: boolean
}) {
  const at = (d: number) => y + dir * d
  const zig = [3, 5, 7, 9, 11, 13]
    .map((d, i) => `L${x + (i % 2 ? 3 : -3)} ${at(d)}`)
    .join(' ')
  const g = at(16)
  return (
    <g className={on ? styles.potOn : styles.pot}>
      <path
        d={`M${x} ${y} V${at(3)} ${zig} L${x} ${at(14)} V${g} M${x - 5} ${g} H${x + 5} M${x - 3} ${g + dir * 2} H${x + 3} M${x - 1} ${g + dir * 4} H${x + 1}`}
      />
      <path d={`M${x - 6} ${at(12)} L${x + 6} ${at(4)}`} />
      <text x={x + 9} y={at(10) + 3}>
        pot
      </text>
    </g>
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
  const x = box.x + (box.w - 18) / 2
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
          width={18}
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
  const start = KEYBOARD_W + KEYBOARD_GAP
  const width = widths.reduce((a, b) => a + b, start + TAIL + sum(GAPS))
  const row = names.map((name, i): ChipBox => ({
    name,
    x: Math.round(start + sum(widths.slice(0, i)) + sum(GAPS.slice(0, i))),
    y: LOW,
    w: widths[i]!,
    h: BOX_H,
  }))
  const [keys, voices, env, pin] = [row[0]!, row[1]!, row[2]!, row[3]!]
  const keyboard: ChipBox = {
    name: KEYBOARD,
    x: 0,
    y: LOW,
    w: KEYBOARD_W,
    h: BOX_H,
  }
  const bus: ChipBox = {
    name: 'bus',
    x: voices.x + (voices.w - boxWidth('bus')) / 2,
    y: SMALL_Y,
    w: boxWidth('bus'),
    h: SMALL_H,
  }
  const rom: ChipBox = {
    name: 'tune ROM',
    x: start,
    y: TOP,
    w: boxWidth('tune ROM'),
    h: BOX_H,
  }
  const clockRight = pin.x + pin.w * 0.6
  const clock: ChipBox = {
    name: 'clock',
    x: voices.x + 22,
    y: TOP,
    w: clockRight - voices.x - 22,
    h: BOX_H,
  }
  const mid = LOW + BOX_H / 2
  const clockMid = TOP + BOX_H / 2
  const pinRight = pin.x + pin.w
  const tap = pinRight + 12
  const route = LOW - 9
  const tuneX = rom.x + rom.w * 0.75
  const stepFrom = voices.x + 20
  const stepTo = rom.x + rom.w * 0.3
  const spot = read('chipBendSpot')
  const scan = up('chipScan')
  const pwmTap = up('chipPwmTap')
  const stepTap = up('chipStepTap')
  const cross = up('chipCrosstalk')
  const drops: [number, boolean, string][] = [
    [voices.x + voices.w / 2, false, ''],
    [env.x + env.w / 2, up('chipPwm') && !pwmTap, 'PWM'],
    [pin.x + pin.w * 0.3, scan, 'scan'],
  ]
  const potAt: Record<string, [number, number, 1 | -1]> = {
    clock: [clock.x + 14, TOP, -1],
    counter: [rom.x + rom.w / 2, TOP, -1],
    bias: [pin.x + pin.w / 2, LOW + BOX_H, 1],
    gate: [env.x + env.w / 2, LOW + BOX_H, 1],
  }
  const placed = spot > 0 ? potAt[SPOTS[spot]!] : undefined
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
                d={`M${keyboard.w} ${mid} H${keys.x}`}
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
              <Wire
                arrow={arrow}
                d={`M${clock.x} ${clockMid} H${rom.x + rom.w}`}
                look={stepTap ? 'dash' : 'plain'}
              />
              <text
                x={(clock.x + rom.x + rom.w) / 2}
                y={clockMid - 4}
                textAnchor="middle"
                className={styles.bus}
              >
                tempo
              </text>
              <Wire
                arrow={arrow}
                d={`M${tuneX} ${TOP + BOX_H} V${route} H${voices.x + 10} V${LOW}`}
              />
              {stepTap && (
                <>
                  <Wire
                    arrow={arrow}
                    d={`M${stepFrom} ${LOW} V${route - 8} H${stepTo} V${TOP + BOX_H}`}
                    look="alarm"
                  />
                  <Say x={tuneX + 4} y={route - 13}>
                    step tap
                  </Say>
                </>
              )}
              {drops.map(([x, on, say]) => (
                <g key={x}>
                  <Wire
                    arrow={arrow}
                    d={`M${x} ${TOP + BOX_H} V${LOW}`}
                    look={bent(on)}
                  />
                  {on && (
                    <Say x={x + 4} y={TOP + BOX_H + 11}>
                      {say}
                    </Say>
                  )}
                </g>
              ))}
              {pwmTap && (
                <>
                  <Wire
                    arrow={arrow}
                    d={`M${voices.x + voices.w} ${mid - SIDE} H${env.x}`}
                    look="alarm"
                  />
                  <Say
                    x={(voices.x + voices.w + env.x) / 2}
                    y={mid - SIDE - 6}
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
                    y={mid + SIDE + 13}
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
              <Wire
                arrow={arrow}
                d={`M${tap} ${mid} V${clockMid} H${clockRight}`}
                look={bent(cross)}
              />
              <circle
                cx={tap}
                cy={mid}
                r={1.6}
                className={cross ? styles.solder : styles.joint}
              />
              <text
                x={width - 2}
                y={clockMid - 4}
                textAnchor="end"
                className={cross ? styles.knifed : styles.bus}
              >
                crosstalk
              </text>
              <Node
                pick={pick}
                box={rom}
                lit={up('chipOutAddr') || up('chipOutData')}
                help="The counter that steps through the tune and the ROM that holds its notes. The output pin can be soldered onto one of its address or note-code wires."
              />
              <Node
                pick={pick}
                box={clock}
                lit={up('chipDrift')}
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
                lit={up('chipEnvCap')}
                help="The capacitor each note’s level follows. The PWM carrier switches that level on and off."
              />
              <Node
                pick={pick}
                box={pin}
                lit={!scan && up('chipShort')}
                help="The pin that carries every voice off the chip. The scan counter connects one voice to it at a time, and a short ties every voice onto it."
              />
              <Wire
                arrow={arrow}
                d={`M${bus.x + bus.w / 2} ${bus.y} V${voices.y + BOX_H}`}
                look={bent(knifed)}
              />
              <KeyboardNode box={keyboard} lit={played} pick={pick} />
              <Node
                pick={pick}
                box={bus}
                help="The address and data wires between the counter, the tune ROM and the voices. The rows put a knife on them."
              />
              {placed && (
                <Pot
                  x={placed[0]}
                  y={placed[1]}
                  dir={placed[2]}
                  on={up('chipBendPot')}
                />
              )}
            </>
          )}
        </Diagram>
      </div>
      {pick.selected === KEYBOARD && editor ? (
        <>
          <BoxRows keys={LEAD_KEYS} />
          {editor}
          <BoxRows keys={PLAY_KEYS} />
        </>
      ) : pick.selected === KEYBOARD ? (
        <BoxRows keys={KEYBOARD_KEYS} />
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
      <BoxRows keys={BEND_KEYS} />
    </>
  )
}
