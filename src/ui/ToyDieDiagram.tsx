import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import chip from './ChipLook.module.css'
import { CHANNELS, GROUPS, sliderFor } from './controls/index.ts'
import { useStoreSelect } from './ControlsContext.ts'
import diagram from './Diagram.module.css'
import {
  boxHeight,
  boxWidth,
  glyphBoxWidth,
  useReadings,
  useSelectedBox,
} from './diagram.ts'
import {
  Bend,
  BoxRows,
  Diagram,
  GlyphBox,
  Pressable,
  Wire,
  type WireLook,
} from './DiagramParts.tsx'
import { slidersFirst } from './slidersFirst.ts'
import { NODE_KEYS, POT } from './toyBoxKeys.ts'
import { CONE_H, ZoomCone, Zoomed } from './ZoomCone.tsx'

import type { ControlKey } from '../controls.ts'
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

// What lights each box: its own knobs, leaving the pot to the box it sits on.
const OWN_KEYS = Object.fromEntries(
  Object.entries(NODE_KEYS).map(([box, keys]) => [
    box,
    keys.filter(k => !POT.includes(k)),
  ]),
)
const BOX_KEYS = [...new Set(Object.values(OWN_KEYS).flat())]

const SPOTS = sliderFor('chipBendSpot').choices!

const TOY_TAP = CHANNELS.find(c => c.name === 'Plinky')!.tap

const WIDTH = 420
const ROOM = 22
const ROW_GAP = 44
const BOX_H = boxHeight('a')
const GAPS = [26, 38, 22]
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
const KNOB_LEAD = 3
const KNOB_R = 5
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

// A pot soldered to a spot on the die, drawn as its knob above or below its box.
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
  return (
    <Pressable
      name="bend pot"
      selected={pick.selected === box}
      onSelect={() => pick.toggle(box)}
      className={on ? styles.potOn : styles.pot}
    >
      <path d={`M${x} ${y} V${at(KNOB_LEAD)}`} />
      <circle cx={x} cy={at(KNOB_LEAD + KNOB_R)} r={KNOB_R} />
      <path
        d={`M${x} ${at(KNOB_LEAD + KNOB_R)} l${KNOB_R * 0.6} ${-KNOB_R * 0.6}`}
      />
      <text x={x + KNOB_R + 4} y={at(KNOB_LEAD + KNOB_R) + 3}>
        pot
      </text>
    </Pressable>
  )
}

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

// A clock input drawn as a labelled stub on a box's top edge instead of a wire:
// the clock reaches four parts, and wires to all of them crowd out the signal
// path. A plain tag shows only while the clock is open, to show where it
// reaches; a bent one always shows and opens the part whose bend it names.
function ClockTag({
  x,
  y,
  opens,
  pick,
  say = 'clk',
  bent = false,
}: {
  x: number
  y: number
  opens: string
  pick: ReturnType<typeof useSelectedBox>
  say?: string
  bent?: boolean
}) {
  const open = pick.selected === opens
  const look = bent ? 'On' : open ? 'Open' : ''
  if (!look) return null
  return (
    <Pressable
      name={`${opens} ${say}`}
      selected={open}
      onSelect={() => pick.toggle(opens)}
      className={styles.tagPick}
    >
      <path
        d={`M${x - 2} ${y} V${y - STUB - 3} H${x + 26} V${y} Z`}
        className={styles.tagHit}
      />
      <path d={`M${x} ${y} V${y - STUB}`} className={styles[`stub${look}`]} />
      <text x={x + 3} y={y - 1} className={styles[`tag${look}`]}>
        {say}
      </text>
    </Pressable>
  )
}

// A bend soldered onto a box, drawn as a red stub with its name beside it and
// opening the knob that sets it. The stub leaves the bottom edge, or a side
// edge where the box has no room beneath it.
function BendTag({
  x,
  y,
  opens,
  pick,
  say,
  edge = 'bottom',
}: {
  x: number
  y: number
  opens: string
  pick: ReturnType<typeof useSelectedBox>
  say: string
  edge?: 'bottom' | 'left' | 'right'
}) {
  const side = edge === 'left' ? -1 : 1
  const down = edge === 'bottom'
  return (
    <Pressable
      name={`${opens} ${say}`}
      selected={pick.selected === opens}
      onSelect={() => pick.toggle(opens)}
      className={styles.tagPick}
    >
      <path
        d={
          down
            ? `M${x - 2} ${y} V${y + STUB + 10} H${x + 26} V${y} Z`
            : `M${x} ${y - 6} H${x + side * (STUB + 30)} V${y + 6} H${x} Z`
        }
        className={styles.tagHit}
      />
      <path
        d={down ? `M${x} ${y} V${y + STUB}` : `M${x} ${y} H${x + side * STUB}`}
        className={styles.stubOn}
      />
      <text
        x={down ? x + 3 : x + side * (STUB + 3)}
        y={down ? y + STUB + 8 : y + 3}
        textAnchor={side < 0 ? 'end' : 'start'}
        className={styles.tagOn}
      >
        {say}
      </text>
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
export function ToyDieDiagram({ verbs, editor, zoom }: DrawingProps) {
  const r = useReadings(KEYS)
  const own = useReadings(BOX_KEYS)
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
  const mid = LOW + BOX_H / 2
  const pinRight = pin.x + pin.w
  const tap = middle(clock)
  const stepX = voices.x + 6
  const spot = read('chipBendSpot')
  const spotBox = spot > 0 ? SPOT_BOX[SPOTS[spot]!] : undefined
  const potted = (name: string) => spotBox === name
  const lit = (name: string) => own.touched(...OWN_KEYS[name]!) || potted(name)
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
  const close = pick.selected === 'bus' ? zoom?.(BUS) : null
  const span = Math.max(WIDTH, width)
  const left = Math.max(0, (WIDTH - width) / 2)
  return (
    <>
      <Zoomed close={close}>
        <div className={chip.chips}>
          <Diagram
            width={span}
            left={left}
            height={close ? HEIGHT + CONE_H : HEIGHT}
            label="toy chip die"
          >
            {arrow => (
              <>
                {close && (
                  <ZoomCone
                    to={{ x: -left, w: span }}
                    top={HEIGHT}
                    bottom={HEIGHT + CONE_H}
                    title="zoom: bus"
                  />
                )}
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
                <Pressable
                  name="output pin out"
                  selected={pick.selected === 'output pin'}
                  onSelect={() => pick.toggle('output pin')}
                >
                  <text
                    x={width - 2}
                    y={mid + 11}
                    textAnchor="end"
                    className={styles.bus}
                  >
                    out
                  </text>
                </Pressable>
                <Wire d={`M${feed} ${TOP + BOX_H} V${bus.y}`} />
                <Wire
                  arrow={arrow}
                  d={`M${feed} ${bus.y + BOX_H} V${LOW}`}
                  look={knifed ? 'alarm' : 'plain'}
                />
                {stepTap && (
                  <Bend
                    name="step tap"
                    opens="tune ROM"
                    pick={pick}
                    hit={`M${stepX} ${LOW} V${TOP + BOX_H}`}
                  >
                    <Wire
                      arrow={arrow}
                      d={`M${stepX} ${LOW} V${TOP + BOX_H}`}
                      look="alarm"
                    />
                    <Say x={stepX - 4} y={TOP + BOX_H + 22} anchor="end">
                      step tap
                    </Say>
                  </Bend>
                )}
                <ClockTag x={rom.x + 7} y={TOP} opens="clock" pick={pick} />
                <ClockTag
                  x={voices.x + voices.w - 24}
                  y={LOW}
                  opens="clock"
                  pick={pick}
                />
                <ClockTag
                  x={env.x + 12}
                  y={LOW}
                  opens={pwm ? 'envelope' : 'clock'}
                  pick={pick}
                  say={pwm ? 'PWM' : 'clk'}
                  bent={pwm}
                />
                <ClockTag
                  x={pin.x + 12}
                  y={LOW}
                  opens={scan ? 'output pin' : 'clock'}
                  pick={pick}
                  say={scan ? 'scan' : 'clk'}
                  bent={scan}
                />
                {pwmTap && (
                  <Bend
                    name="pwm tap"
                    opens="voices"
                    pick={pick}
                    hit={`M${voices.x + voices.w} ${mid - SIDE} H${env.x}`}
                  >
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
                  </Bend>
                )}
                {up('chipEnvDiv') && (
                  <Bend
                    name="dive"
                    opens="envelope"
                    pick={pick}
                    hit={`M${env.x} ${mid + SIDE} H${voices.x + voices.w}`}
                  >
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
                  </Bend>
                )}
                {up('chipEnvRelax') && (
                  <Bend
                    name="relax"
                    opens="envelope"
                    pick={pick}
                    hit={`M${loopL} ${LOW} V${LOW - 6} H${loopR} V${LOW}`}
                  >
                    <Wire
                      d={`M${loopL} ${LOW} V${LOW - 6} H${loopR} V${LOW}`}
                      look="alarm"
                    />
                    <Say x={loopR} y={LOW - 10} anchor="end">
                      relax
                    </Say>
                  </Bend>
                )}
                {cross && (
                  <Bend
                    name="crosstalk"
                    opens="clock"
                    pick={pick}
                    hit={`M${tap} ${mid} V${TOP + BOX_H}`}
                  >
                    <Wire
                      arrow={arrow}
                      d={`M${tap} ${mid} V${TOP + BOX_H}`}
                      look="alarm"
                    />
                    <circle
                      cx={tap}
                      cy={mid}
                      r={1.6}
                      className={styles.solder}
                    />
                    <Say x={tap - 4} y={LOW - 18} anchor="end">
                      crosstalk
                    </Say>
                  </Bend>
                )}
                {up('chipHardSync') && (
                  <BendTag
                    x={clock.x}
                    y={TOP + 5}
                    edge="left"
                    opens="clock"
                    pick={pick}
                    say="sync"
                  />
                )}
                {up('chipFmClock') && (
                  <BendTag
                    x={clock.x}
                    y={TOP + BOX_H - 5}
                    edge="left"
                    opens="clock"
                    pick={pick}
                    say="fm"
                  />
                )}
                {up('chipOutAddr') && (
                  <BendTag
                    x={rom.x + rom.w}
                    y={TOP + 5}
                    edge="right"
                    opens="tune ROM"
                    pick={pick}
                    say="addr"
                  />
                )}
                {up('chipOutData') && (
                  <BendTag
                    x={rom.x + rom.w}
                    y={TOP + BOX_H - 5}
                    edge="right"
                    opens="tune ROM"
                    pick={pick}
                    say="data"
                  />
                )}
                {up('chipGhost') && (
                  <BendTag
                    x={keys.x + 6}
                    y={LOW + BOX_H}
                    opens="key matrix"
                    pick={pick}
                    say="ghost"
                  />
                )}
                {up('chipShort') && (
                  <BendTag
                    x={voices.x + 2}
                    y={LOW + BOX_H}
                    opens="voices"
                    pick={pick}
                    say="short"
                  />
                )}
                {up('chipXor') && (
                  <BendTag
                    x={voices.x + 38}
                    y={LOW + BOX_H}
                    opens="voices"
                    pick={pick}
                    say="xor"
                  />
                )}
                {up('chipDutyEnv') && (
                  <BendTag
                    x={voices.x + 62}
                    y={LOW + BOX_H}
                    opens="voices"
                    pick={pick}
                    say="duty"
                  />
                )}
                {up('chipEnvBits') && (
                  <BendTag
                    x={env.x + 4}
                    y={LOW + BOX_H}
                    opens="envelope"
                    pick={pick}
                    say="bits"
                  />
                )}
                {up('chipHold') && (
                  <BendTag
                    x={pin.x + 2}
                    y={LOW + BOX_H}
                    opens="output pin"
                    pick={pick}
                    say="hold"
                  />
                )}
                <Node
                  pick={pick}
                  box={rom}
                  lit={lit('tune ROM')}
                  help="The counter that steps through the tune and the ROM that holds its notes. The output pin can be soldered onto one of its address or note-code wires."
                />
                <Node
                  pick={pick}
                  box={clock}
                  lit={lit('clock')}
                  help="The crystal and its divider. Pitch, tempo, the scan counter and the PWM carrier all count off it."
                />
                <Node
                  pick={pick}
                  box={keys}
                  lit={lit('key matrix')}
                  help="The rows and columns the keys close. With the diodes lifted, holding two keys also closes the other two corners of their rectangle."
                />
                <Node
                  pick={pick}
                  box={voices}
                  lit={lit('voices')}
                  help="The tone generators, one a note, each with its own pitch divider."
                />
                <Node
                  pick={pick}
                  box={env}
                  lit={lit('envelope')}
                  help="The capacitor each note’s level follows. The PWM carrier switches that level on and off."
                />
                <Node
                  pick={pick}
                  box={pin}
                  lit={lit('output pin')}
                  help="The pin that carries every voice off the chip. The scan counter connects one voice to it at a time, and a short ties every voice onto it."
                />
                <GlyphBox
                  {...keyboard}
                  help="the tune, level, tone, accompaniment, arpeggio and key lock"
                  lit={played}
                  selected={pick.selected === KEYBOARD}
                  onSelect={() => pick.toggle(KEYBOARD)}
                  glyphW={GLYPH_W}
                  glyph={keyboardGlyph}
                />
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
      </Zoomed>
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
          verbs={
            pick.selected === 'bus'
              ? verbs?.(BUS)
              : pick.selected &&
                verbs?.(DIE, {
                  name: pick.selected,
                  keys: NODE_KEYS[pick.selected]!,
                })
          }
        />
      )}
    </>
  )
}
