import { VOICE_LABELS } from '../drums.ts'
import {
  CHOKE_WIRING,
  CROSS_WIRING,
  RING_TRIG_WIRING,
} from '../dsp/stages/toyDrum.ts'
import styles from './BusDiagram.module.css'
import { Chip, type ChipBox } from './BusDiagram.tsx'
import chipLook from './ChipLook.module.css'
import {
  boxHeight,
  boxWidth,
  useReadings,
  useSelectedBox,
  card,
} from './diagram.ts'
import { BoxRows, Diagram, Dot, Pressable, Wire } from './DiagramParts.tsx'

import type { ControlKey } from '../controls.ts'

// What each box and each patch of the drawing opens.
const OPENS: Record<string, { keys: readonly ControlKey[]; help: string }> = {
  'trigger lines': {
    keys: ['drumRetrigHz', 'drumTrigFloor', 'drumScan'],
    help: 'One trigger line a voice off the pattern memory. The rows set how fast a step retriggers, how far a voice must drain before it answers again and how slowly the chip scans its lines.',
  },
  amps: {
    keys: ['drumAccentAmt', 'drumAccentSag'],
    help: 'One amplifier a voice, each following its own voice’s envelope unless the cross-patch bridges it to another. The accent cap feeds all of them.',
  },
  choke: {
    keys: ['drumChoke'],
    help: 'The one choke resistor, and which voice’s trigger line it is soldered to.',
  },
  'ring trigger': {
    keys: ['drumRingTrig'],
    help: 'A comparator on one tank’s ring, soldered onto other voices’ trigger lines.',
  },
  'cross-patch': {
    keys: ['drumCross', 'drumCrossAmt'],
    help: 'Bridges two voices’ envelope pins so each amplifier hears the wrong envelope.',
  },
}

const KEYS = [
  ...new Set(Object.values(OPENS).flatMap(o => o.keys)),
  'drumRom',
] as const

const CHIP_H = boxHeight('a\nb')
const CHIP_GAP = 12

const WIDTH = 420
const TOP = 16
const ROW = 22
const VOICE_H = 18
const N = VOICE_LABELS.length
const BOTTOM = TOP + N * ROW
const CHIP_Y = BOTTOM + 14
const HEIGHT = CHIP_Y + CHIP_H + 4
const PATTERN_W = boxWidth('trigger lines')
const VOICE_W = Math.max(...VOICE_LABELS.map(boxWidth))
const AMPS_W = boxWidth('amps')
const TAIL = 30
const LANES_W = 110
const VOICE_X = PATTERN_W + LANES_W
const AMPS_X = WIDTH - TAIL - AMPS_W
const LANE_STEP = 7
const EDGE = 5

const rowY = (v: number) => TOP + v * ROW + ROW / 2

type Kind = 'pedal' | 'choke' | 'ring'

// One wire in the lanes, from a trigger line (a choke) or a voice's tank (a ring
// trigger) to one or more voices.
interface Run {
  kind: Kind
  from: number
  to: number[]
}

const PEDAL_CUT = CHOKE_WIRING[0]!.findIndex(by => by >= 0)
const PEDAL_BY = CHOKE_WIRING[0]![PEDAL_CUT]!

// A choke wire runs from the trigger line that drains a voice to that voice's
// cap. The hats' pedal is wired in the metal, so every row of the table has it,
// and the drawing keeps it grey.
function runs(choke: number, ring: number): Run[] {
  const out: Run[] = [{ kind: 'pedal', from: PEDAL_BY, to: [PEDAL_CUT] }]
  const bySource = new Map<number, number[]>()
  ;(CHOKE_WIRING[choke] ?? CHOKE_WIRING[0]!).forEach((by, cut) => {
    if (by < 0 || cut === PEDAL_CUT) return
    bySource.set(by, [...(bySource.get(by) ?? []), cut])
  })
  for (const [from, to] of bySource) out.push({ kind: 'choke', from, to })
  const [tank, mask] = RING_TRIG_WIRING[ring] ?? RING_TRIG_WIRING[0]!
  if (tank >= 0)
    out.push({
      kind: 'ring',
      from: tank,
      to: VOICE_LABELS.map((_, v) => v).filter(v => (mask >> v) & 1),
    })
  return out
}

// The lowest lane whose span no earlier run of a different net overlaps.
function lanes(all: Run[]): number[] {
  const taken: [number, number][][] = []
  return all.map(run => {
    const rows = [run.from, ...run.to]
    const span: [number, number] = [Math.min(...rows), Math.max(...rows)]
    let lane = 0
    while ((taken[lane] ?? []).some(([a, b]) => span[0] <= b && a <= span[1]))
      lane++
    taken[lane] = [...(taken[lane] ?? []), span]
    return lane
  })
}

// A thin red wire with a small head, for a wire soldered where the board had none.
function Bodge({
  x1,
  y1,
  x2,
  y2,
  dashed,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  dashed?: boolean
}) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len]
  const [bx, by] = [x2 - ux * 5, y2 - uy * 5]
  return (
    <>
      <path
        d={`M${x1} ${y1} L${bx} ${by}`}
        className={styles.jumper}
        strokeDasharray={dashed ? '3 2' : undefined}
      />
      <path
        d={`M${x2} ${y2} L${bx - uy * 2.5} ${by + ux * 2.5} L${bx + uy * 2.5} ${by - ux * 2.5} Z`}
        className={styles.solder}
      />
    </>
  )
}

function RunWire({
  run,
  lane,
  arrow,
}: {
  run: Run
  lane: number
  arrow: string
}) {
  const x = VOICE_X - 12 - lane * LANE_STEP
  const ring = run.kind === 'ring'
  const startY = rowY(run.from) - (ring ? EDGE : 0)
  const ends = run.to.map(v => rowY(v) + (ring ? 0 : EDGE))
  const ys = [startY, ...ends]
  const pedal = run.kind === 'pedal'
  const look = pedal ? 'plain' : 'alarm'
  return (
    <>
      <path
        d={`${ring ? `M${VOICE_X} ${startY} H${x} ` : ''}M${x} ${Math.min(...ys)} V${Math.max(...ys)}`}
        className={pedal ? styles.trace : styles.jumper}
        strokeDasharray={ring ? undefined : '3 2'}
      />
      <Dot x={ring ? VOICE_X : x} y={startY} look={look} />
      {run.to.map((v, i) =>
        ring ? (
          <Dot key={v} x={x} y={ends[i]!} look={look} />
        ) : pedal ? (
          <Wire
            key={v}
            arrow={arrow}
            d={`M${x} ${ends[i]} H${VOICE_X}`}
            look="dash"
          />
        ) : (
          <Bodge
            key={v}
            x1={x}
            y1={ends[i]!}
            x2={VOICE_X}
            y2={ends[i]!}
            dashed
          />
        ),
      )}
    </>
  )
}

// The kit's trigger side as the board wires it. The pattern's trigger lines run
// into the eight voices, every voice runs into the amps, and three wires can
// move. A choke wire drains a voice from another voice's trigger line, a ring
// trigger fires trigger lines off one voice's tank, and the cross-patch hands an
// amp another voice's envelope.
export function KitWiringDiagram() {
  const r = useReadings(KEYS)
  const pick = useSelectedBox()
  const read = (key: (typeof KEYS)[number]) => Math.round(r.value(key))
  const choke = read('drumChoke')
  const ring = read('drumRingTrig')
  const cross = read('drumCross')
  const sampled = read('drumRom') > 0
  const crossing = cross > 0 && r.value('drumCrossAmt') > 0
  const wiring = CROSS_WIRING[cross] ?? CROSS_WIRING[0]!
  const all = runs(choke, ring)
  const laneOf = lanes(all)
  const pattern: ChipBox = {
    name: 'trigger lines',
    x: 0,
    y: TOP,
    w: PATTERN_W,
    h: N * ROW,
  }
  const amps: ChipBox = {
    name: 'amps',
    x: AMPS_X,
    y: TOP,
    w: AMPS_W,
    h: N * ROW,
  }
  const voices = VOICE_LABELS.map((name, v): ChipBox => ({
    name,
    x: VOICE_X,
    y: rowY(v) - VOICE_H / 2,
    w: VOICE_W,
    h: VOICE_H,
  }))
  const voiceRight = VOICE_X + VOICE_W
  const patches = [
    { name: 'choke', lit: choke > 0 },
    { name: 'ring trigger', lit: ring > 0 },
    { name: 'cross-patch', lit: cross > 0 },
  ]
  const widths = patches.map(p => boxWidth(p.name))
  const spanW = widths.reduce((a, b) => a + b, 0) + CHIP_GAP * 2
  const patchBoxes = patches.map((p, i): ChipBox => ({
    name: p.name,
    x:
      (WIDTH - spanW) / 2 +
      widths.slice(0, i).reduce((a, b) => a + b + CHIP_GAP, 0),
    y: CHIP_Y,
    w: widths[i]!,
    h: CHIP_H,
  }))
  const open = pick.selected ? OPENS[pick.selected] : undefined
  const node = (box: ChipBox, lit?: boolean) => (
    <Pressable
      key={box.name}
      name={box.name}
      selected={pick.selected === box.name}
      onSelect={() => pick.toggle(box.name)}
    >
      <Chip box={box} lit={lit} help={OPENS[box.name]!.help} />
    </Pressable>
  )
  return (
    <>
      <div className={chipLook.chips}>
        <Diagram width={WIDTH} height={HEIGHT} label="drum kit wiring">
          {arrow => (
            <>
              {voices.map((b, v) => (
                <g key={b.name}>
                  <Wire
                    arrow={arrow}
                    d={`M${PATTERN_W} ${rowY(v)} H${VOICE_X}`}
                  />
                  <Wire
                    arrow={arrow}
                    d={`M${voiceRight} ${rowY(v)} H${AMPS_X}`}
                    look={crossing && wiring[v] !== v ? 'dash' : 'plain'}
                  />
                </g>
              ))}
              {crossing &&
                wiring.map((from, v) =>
                  from === v ? null : sampled ? (
                    <Wire
                      key={v}
                      arrow={arrow}
                      d={`M${voiceRight} ${rowY(from)} L${AMPS_X} ${rowY(v)}`}
                      look="dash"
                    />
                  ) : (
                    <Bodge
                      key={v}
                      x1={voiceRight}
                      y1={rowY(from)}
                      x2={AMPS_X}
                      y2={rowY(v)}
                    />
                  ),
                )}
              {all.map((run, i) => (
                <RunWire
                  key={`${run.kind}${run.from}`}
                  run={run}
                  lane={laneOf[i]!}
                  arrow={arrow}
                />
              ))}
              <Wire
                arrow={arrow}
                d={`M${AMPS_X + AMPS_W} ${TOP + (N * ROW) / 2} H${WIDTH - 2}`}
              />
              <text
                x={WIDTH - 2}
                y={TOP + (N * ROW) / 2 - 4}
                textAnchor="end"
                className={styles.bus}
              >
                out
              </text>
              {node(pattern)}
              {voices.map(b => (
                <Chip key={b.name} box={b} />
              ))}
              {node(amps)}
              {patchBoxes.map((b, i) => node(b, patches[i]!.lit))}
            </>
          )}
        </Diagram>
      </div>
      <BoxRows
        card={card(pick)}
        keys={open?.keys}
        hint="Press the trigger lines, the amps or a patch for its settings."
      />
    </>
  )
}
