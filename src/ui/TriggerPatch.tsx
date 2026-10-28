import { TRIGGER_CHIPS, TRIGGER_OPENS, TRIGGER_WIRED } from './cardWiring.ts'
import { ChipDrawing } from './ChipDrawing.tsx'
import {
  cableName,
  KIT_TO_PLINKY,
  PLINKY_TO_KIT,
  SIGNAL_COLOUR,
  wireId,
  type Connection,
} from './connections.ts'
import { sliderFor } from './controls/index.ts'
import { useBoardValue, useControlValue } from './ControlsContext.ts'
import diagramStyles from './Diagram.module.css'
import {
  besideOf,
  card,
  useOpensOnAim,
  useReadings,
  useSelectedBox,
} from './diagram.ts'
import { BoxRows, BoxView, Pressable } from './DiagramParts.tsx'
import styles from './TriggerPatch.module.css'

import type { ReactNode } from 'react'

const TO_KEYS = sliderFor('trigToKeys').choices!
const TO_DRUM = sliderFor('trigToDrum').choices!
const NOTE = sliderFor('trigKeysNote').choices!
const STRUCK = sliderFor('fmStruck').choices!

const READ = TRIGGER_CHIPS.flatMap(c => [c.struck.key, c.gate.key])

const BOX_W = 84
const BOX_H = 20
const WIDTH = 420
const LEFT_X = 4
const RIGHT_X = WIDTH - 4 - BOX_W
const TOP = 14
const Y0 = TOP + BOX_H / 2
const UP_Y = Y0 - 6
const DOWN_Y = Y0 + 6
const DRUM_MID = LEFT_X + BOX_W / 2
const KEYS_MID = RIGHT_X + BOX_W / 2
const CHIP_INSET = 24
const CHIP_X = DRUM_MID + CHIP_INSET
const CHIP_W = KEYS_MID - CHIP_INSET - CHIP_X
const CHIP_H = 20
const CHIP_TOP = TOP + BOX_H + 20
const CHIP_PITCH = CHIP_H + 6
const HEIGHT = CHIP_TOP + TRIGGER_CHIPS.length * CHIP_PITCH

const KIT = SIGNAL_COLOUR.hits
const KEYS = SIGNAL_COLOUR.notes
const OFF = 'var(--fg4)'

const arrowTo = (x: number, y: number, dir: 1 | -1) =>
  `M ${x - 6 * dir} ${y - 3} L ${x} ${y} L ${x - 6 * dir} ${y + 3}`

function bridge(
  on: boolean,
  colour: string,
  title: string,
  x1: number,
  x2: number,
  y: number,
  tag: string,
  tagY: number,
) {
  const dir = x2 > x1 ? 1 : -1
  const ink = on ? colour : OFF
  return (
    <g opacity={on ? 1 : 0.45}>
      <title>{title}</title>
      <line
        x1={x1}
        y1={y}
        x2={x2 - 6 * dir}
        y2={y}
        stroke={ink}
        strokeWidth={on ? 1.5 : 1}
        strokeDasharray={on ? undefined : '2 2'}
      />
      <path
        d={arrowTo(x2, y, dir)}
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
      />
      <text
        x={(x1 + x2) / 2}
        y={tagY}
        textAnchor="middle"
        className={styles.tag}
        fill={on ? 'var(--fg3)' : OFF}
      >
        {tag}
      </text>
    </g>
  )
}

const source = (x: number, name: string) => (
  <BoxView
    box={{
      x,
      y: TOP,
      w: BOX_W,
      h: BOX_H,
      name,
      touched: false,
      help: `${name} plays the machines its wires reach.`,
    }}
  />
)

// The kit, the keyboard and the three machines that play off them, with every
// wire that makes one machine strike another. A wire is dashed and grey while
// its setting is off. Pressing a wire opens its row underneath, and pressing a
// machine opens both of its rows.
export function TriggerPatch() {
  const pick = useSelectedBox()
  useOpensOnAim(pick, TRIGGER_OPENS)
  const r = useReadings(READ)
  const toKeys = Math.round(useControlValue('trigToKeys'))
  const toDrum = Math.round(useControlValue('trigToDrum'))
  const note = Math.round(useControlValue('trigKeysNote'))
  const upOn = toKeys > 0
  const downOn = toDrum > 0
  const upTag = useBoardValue(c =>
    upOn ? cableName(c, KIT_TO_PLINKY) : offTag(KIT_TO_PLINKY),
  )
  const downTag = useBoardValue(c =>
    downOn ? cableName(c, PLINKY_TO_KIT) : offTag(PLINKY_TO_KIT),
  )
  const upTitle = upOn
    ? `${TO_KEYS[toKeys]} on the kit strikes a key, playing ${NOTE[note]}.`
    : 'The kit does not play Plinky.'
  const downTitle = downOn
    ? `Every key you strike on Plinky fires ${TO_DRUM[toDrum]} on the kit.`
    : 'Plinky does not play the kit.'

  const readout = useBoardValue(c =>
    TRIGGER_CHIPS.map(
      ch => `${Math.round(c[ch.struck.key])}${ch.gate.plugged(c) ? 's' : 'c'}`,
    ).join(','),
  ).split(',')
  const machines = TRIGGER_CHIPS.map((chip, i) =>
    machineParts(chip, CHIP_TOP + i * CHIP_PITCH, readout[i]!),
  )

  const press = (id: string, hit: string, drawn: ReactNode) => {
    const selected = pick.selected === id
    return (
      <Pressable
        key={id}
        name={id}
        selected={selected}
        onSelect={() => pick.toggle(id)}
        className={selected ? diagramStyles.pickedLabel : ''}
      >
        <path
          d={hit}
          fill="none"
          strokeWidth={9}
          className={selected ? styles.hitOn : styles.hit}
        />
        {drawn}
      </Pressable>
    )
  }

  return (
    <>
      <ChipDrawing width={WIDTH} height={HEIGHT} label="trigger patch">
        {() => (
          <>
            {source(LEFT_X, 'Clatter')}
            {source(RIGHT_X, 'Plinky')}

            {press(
              wireId(KIT_TO_PLINKY),
              `M ${LEFT_X + BOX_W} ${UP_Y} H ${RIGHT_X}`,
              bridge(
                upOn,
                KIT,
                upTitle,
                LEFT_X + BOX_W,
                RIGHT_X,
                UP_Y,
                upTag,
                UP_Y - 4,
              ),
            )}
            {press(
              wireId(PLINKY_TO_KIT),
              `M ${RIGHT_X} ${DOWN_Y} H ${LEFT_X + BOX_W}`,
              bridge(
                downOn,
                KEYS,
                downTitle,
                RIGHT_X,
                LEFT_X + BOX_W,
                DOWN_Y,
                downTag,
                DOWN_Y + 12,
              ),
            )}

            <text
              x={DRUM_MID + 5}
              y={TOP + BOX_H + 14}
              className={styles.tag}
              fill="var(--fg3)"
            >
              kit hits
            </text>
            <text
              x={KEYS_MID - 5}
              y={TOP + BOX_H + 14}
              textAnchor="end"
              className={styles.tag}
              fill="var(--fg3)"
            >
              Plinky’s notes
            </text>

            {[false, true].flatMap(live =>
              machines
                .filter(m => m.struckOn === live)
                .map(m => press(m.strikeId, m.strike.hit, m.strike.drawn)),
            )}
            {[false, true].flatMap(live =>
              machines
                .filter(m => !m.gateCut === live)
                .map(m => press(m.gateId, m.gate.hit, m.gate.drawn)),
            )}
            {machines.map(m => (
              <BoxView
                key={m.name}
                box={{
                  id: m.name,
                  keys: TRIGGER_OPENS[m.name],
                  x: CHIP_X,
                  y: m.top,
                  w: CHIP_W,
                  h: CHIP_H,
                  name: m.name,
                  off: !m.played,
                  touched: r.touched(m.struck.key, m.jumper.key),
                  help: `What plays the ${m.name}: the kit's strike and Plinky's jumper.`,
                }}
                selected={pick.selected === m.name}
                onSelect={pick.toggle}
              />
            ))}
          </>
        )}
      </ChipDrawing>
      <BoxRows
        card={card(pick)}
        hint="Press a wire to set it, or a machine to set both of its wires."
        keys={TRIGGER_OPENS[pick.selected ?? '']}
        beside={besideOf(TRIGGER_OPENS, TRIGGER_WIRED, pick.selected)}
      />
    </>
  )
}

const offTag = (x: Connection) => `${x.signal} → ${x.to}`

interface Part {
  hit: string
  drawn: ReactNode
}

// The three drawn parts of a machine under the pair — the kit's wire onto it,
// the keyboard's wire onto it and the box — from `code`, its strike choice
// followed by `c` for a cut jumper or `s` for a soldered one.
function machineParts(
  chip: (typeof TRIGGER_CHIPS)[number],
  top: number,
  code: string,
) {
  const struck = Number.parseInt(code, 10)
  const gateCut = code.endsWith('c')
  const struckOn = struck > 0
  const mid = top + CHIP_H / 2

  const played = struckOn || !gateCut

  const struckTitle = struckOn
    ? `${STRUCK[struck]} on the kit plays a note on the ${chip.name}.`
    : `The kit does not play the ${chip.name}.`
  const gateTitle = gateCut
    ? `The jumper is cut, so the ${chip.name} ignores Plinky.`
    : `Soldered: every note Plinky plays, the ${chip.name} plays too — your keys, its tune and its arpeggio.`

  const strike: Part = {
    hit: `M ${DRUM_MID} ${mid} H ${CHIP_X}`,
    drawn: (
      <g opacity={struckOn ? 1 : 0.45}>
        <title>{struckTitle}</title>
        <path
          d={`M ${DRUM_MID} ${TOP + BOX_H} V ${mid} H ${CHIP_X - 6}`}
          fill="none"
          stroke={struckOn ? KIT : OFF}
          strokeWidth={struckOn ? 1.5 : 1}
          strokeDasharray={struckOn ? undefined : '2 2'}
        />
        <path
          d={arrowTo(CHIP_X, mid, 1)}
          fill="none"
          stroke={struckOn ? KIT : OFF}
          strokeWidth={1.5}
        />
      </g>
    ),
  }
  const gate: Part = {
    hit: `M ${KEYS_MID} ${mid} H ${CHIP_X + CHIP_W}`,
    drawn: (
      <g opacity={gateCut ? 0.45 : 1}>
        <title>{gateTitle}</title>
        <path
          d={`M ${KEYS_MID} ${TOP + BOX_H} V ${mid} H ${CHIP_X + CHIP_W + 6}`}
          fill="none"
          stroke={gateCut ? OFF : KEYS}
          strokeWidth={gateCut ? 1 : 1.5}
          strokeDasharray={gateCut ? '2 2' : undefined}
        />
        <path
          d={arrowTo(CHIP_X + CHIP_W, mid, -1)}
          fill="none"
          stroke={gateCut ? OFF : KEYS}
          strokeWidth={1.5}
        />
      </g>
    ),
  }
  return {
    name: chip.name,
    struck: chip.struck,
    jumper: chip.gate,
    strikeId: wireId(chip.struck),
    gateId: wireId(chip.gate),
    top,
    played,
    struckOn,
    gateCut,
    strike,
    gate,
  }
}
