import chipLook from './ChipLook.module.css'
import { sliderFor } from './controls/index.ts'
import { useBoardValue, useControlValue } from './ControlsContext.ts'
import diagramStyles from './Diagram.module.css'
import { useSelectedBox, card } from './diagram.ts'
import { BoxRows } from './DiagramParts.tsx'
import styles from './TriggerPatch.module.css'

import type { ControlKey } from '../controls.ts'
import type { ReactNode } from 'react'

const TO_KEYS = sliderFor('trigToKeys').choices!
const TO_DRUM = sliderFor('trigToDrum').choices!
const NOTE = sliderFor('trigKeysNote').choices!
const STRUCK = sliderFor('fmStruck').choices!

// The machines with no sequencer of their own: each takes the toy keyboard's
// notes through one jumper and the kit's hits through one strike selector.
const CHIPS = [
  { name: 'Glint', struck: 'fmStruck', gate: 'fmKeyGate' },
  { name: 'Parlor', struck: 'pcmStruck', gate: 'pcmKeyGate' },
  { name: 'Growler', struck: 'monoStruck', gate: 'monoKeyGate' },
] as const satisfies readonly {
  name: string
  struck: ControlKey
  gate: ControlKey
}[]

type ChipName = (typeof CHIPS)[number]['name']
type Wire = 'kit → keys' | 'keys → kit' | `${'kit' | 'keys'} → ${ChipName}`
type Pick = Wire | ChipName

const OPENS = new Map<string, readonly ControlKey[]>([
  ['kit → keys', ['trigToKeys', 'trigKeysNote']],
  ['keys → kit', ['trigToDrum']],
  ...CHIPS.flatMap(
    c =>
      [
        [`kit → ${c.name}`, [c.struck]],
        [`keys → ${c.name}`, [c.gate]],
        [c.name, [c.struck, c.gate]],
      ] as const,
  ),
])

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
const HEIGHT = CHIP_TOP + CHIPS.length * CHIP_PITCH - 6 + 6

const KIT = 'var(--cool)'
const KEYS = 'var(--accent2)'
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

// The kit, the keyboard and the three machines that play off them, with every
// wire that makes one machine strike another. A wire is dashed and grey while
// its setting is off. Pressing a wire opens its row underneath, and pressing a
// machine opens both of its rows.
export function TriggerPatch() {
  const pick = useSelectedBox()
  const toKeys = Math.round(useControlValue('trigToKeys'))
  const toDrum = Math.round(useControlValue('trigToDrum'))
  const note = Math.round(useControlValue('trigKeysNote'))
  const upOn = toKeys > 0
  const downOn = toDrum > 0
  const upTitle = upOn
    ? `${TO_KEYS[toKeys]} on the kit strikes a key, playing ${NOTE[note]}.`
    : 'The kit does not play Plinky.'
  const downTitle = downOn
    ? `Every key you strike on Plinky fires ${TO_DRUM[toDrum]} on the kit.`
    : 'Plinky does not play the kit.'

  const readout = useBoardValue(c =>
    CHIPS.map(
      ch => `${Math.round(c[ch.struck])}${c[ch.gate] >= 0.5 ? 'c' : 's'}`,
    ).join(','),
  ).split(',')
  const machines = CHIPS.map((chip, i) =>
    machineParts(chip, CHIP_TOP + i * CHIP_PITCH, readout[i]!),
  )

  const press = (id: Pick, hit: string, drawn: ReactNode) => {
    const selected = pick.selected === id
    return (
      <g
        key={id}
        className={`${diagramStyles.pick} ${selected ? diagramStyles.pickedLabel : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${id} controls`}
        onClick={() => pick.toggle(id)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            pick.toggle(id)
          }
        }}
      >
        <path
          d={hit}
          fill="none"
          strokeWidth={9}
          className={
            selected && !CHIPS.some(c => c.name === id)
              ? styles.hitOn
              : styles.hit
          }
        />
        {drawn}
      </g>
    )
  }

  const box = (x: number, name: string) => (
    <>
      <rect
        x={x}
        y={TOP}
        width={BOX_W}
        height={BOX_H}
        rx={3}
        stroke="var(--border-hover)"
      />
      <text
        x={x + BOX_W / 2}
        y={TOP + BOX_H / 2 + 3}
        textAnchor="middle"
        className={styles.label}
        fill="var(--fg)"
      >
        {name}
      </text>
    </>
  )

  return (
    <>
      <div className={chipLook.chips}>
        <svg
          className={styles.diagram}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="trigger patch"
        >
          {box(LEFT_X, 'Clatter')}
          {box(RIGHT_X, 'Plinky')}

          {press(
            'kit → keys',
            `M ${LEFT_X + BOX_W} ${UP_Y} H ${RIGHT_X}`,
            bridge(
              upOn,
              KIT,
              upTitle,
              LEFT_X + BOX_W,
              RIGHT_X,
              UP_Y,
              'kit plays keys',
              UP_Y - 4,
            ),
          )}
          {press(
            'keys → kit',
            `M ${RIGHT_X} ${DOWN_Y} H ${LEFT_X + BOX_W}`,
            bridge(
              downOn,
              KIT,
              downTitle,
              RIGHT_X,
              LEFT_X + BOX_W,
              DOWN_Y,
              'keys play kit',
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
            keyboard notes
          </text>

          {[false, true].flatMap(live =>
            machines
              .filter(m => m.struckOn === live)
              .map(m => press(`kit → ${m.name}`, m.strike.hit, m.strike.drawn)),
          )}
          {[false, true].flatMap(live =>
            machines
              .filter(m => !m.gateCut === live)
              .map(m => press(`keys → ${m.name}`, m.gate.hit, m.gate.drawn)),
          )}
          {machines.map(m => press(m.name, m.box.hit, m.box.drawn))}
        </svg>
      </div>
      {!pick.selected && (
        <p className={styles.hint}>
          Press a wire to set it, or a machine to set both of its wires.
        </p>
      )}
      <BoxRows card={card(pick)} keys={OPENS.get(pick.selected ?? '')} />
    </>
  )
}

interface Part {
  hit: string
  drawn: ReactNode
}

// The three drawn parts of a machine under the pair — the kit's wire onto it,
// the keyboard's wire onto it and the box — from `code`, its strike choice
// followed by `c` for a cut jumper or `s` for a soldered one.
function machineParts(chip: (typeof CHIPS)[number], top: number, code: string) {
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
  const box: Part = {
    hit: `M ${CHIP_X} ${top} h ${CHIP_W} v ${CHIP_H} h ${-CHIP_W} z`,
    drawn: (
      <>
        <rect
          x={CHIP_X}
          y={top}
          width={CHIP_W}
          height={CHIP_H}
          rx={3}
          stroke="var(--border-hover)"
        />
        <text
          x={CHIP_X + CHIP_W / 2}
          y={mid + 3}
          textAnchor="middle"
          className={styles.label}
          fill={played ? 'var(--fg)' : OFF}
        >
          {chip.name}
        </text>
      </>
    ),
  }
  return { name: chip.name, struckOn, gateCut, strike, gate, box }
}
