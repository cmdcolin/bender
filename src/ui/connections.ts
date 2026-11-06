import { ANY_CHOICE, followsGate, GATE_ALL, GATE_CUT } from '../dsp/trigbus.ts'
import { MACHINES, recordOf } from '../machines.ts'
import { choiceName } from './controls/index.ts'

import type { ControlKey, Controls } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'
import type { BoardMachine } from '../machines.ts'

export type Machine = BoardMachine

/** Plinky's gate line carries notes; the kit's trigger lines carry hits. */
export type Signal = 'notes' | 'hits'

export interface Connection {
  key: ControlKey
  signal: Signal
  from: Machine
  to: Machine
  plugged: (c: Controls) => boolean
  /** The control's value with the cable plugged in by hand, and pulled out. */
  plugIn: number
  pullOut: number
}

export const MACHINE_OF: Record<NoteDest, Machine> = recordOf(
  MACHINES.flatMap(m => ('keybed' in m ? [m] : [])),
  m => m.keybed,
  m => m.name,
)

export const SIGNAL_COLOUR: Record<Signal, string> = {
  notes: 'var(--accent2)',
  hits: 'var(--hits)',
}

const jumper = (key: ControlKey, to: Machine): Connection => ({
  key,
  signal: 'notes',
  from: 'Plinky',
  to,
  plugged: c => followsGate(c[key]),
  plugIn: GATE_ALL,
  pullOut: GATE_CUT,
})

const voice = (
  key: ControlKey,
  signal: Signal,
  from: Machine,
  to: Machine,
): Connection => ({
  key,
  signal,
  from,
  to,
  plugged: c => Math.round(c[key]) > 0,
  plugIn: ANY_CHOICE,
  pullOut: 0,
})

const GATED = MACHINES.flatMap(m => ('keyGate' in m ? [m] : []))

export const KEY_LINE = GATED.map(m => jumper(m.keyGate, m.name))

/** The gate line's runs from the toy out: the wire the map draws each one as,
    the jumper that solders on the machine at its far end, and that machine's
    keybed. */
export const KEY_RUNS = GATED.map((m, i) => ({
  id: i === 0 ? 'key-line' : `key-line-${m.keybed}`,
  jumper: m.keyGate,
  machine: m.name,
  keybed: m.keybed,
}))

export const KIT_TO_PLINKY = voice('trigToKeys', 'hits', 'Clatter', 'Plinky')
export const PLINKY_TO_KIT = voice('trigToDrum', 'notes', 'Plinky', 'Clatter')

export const TRIGGER_CABLES = [
  KIT_TO_PLINKY,
  PLINKY_TO_KIT,
  ...MACHINES.flatMap(m =>
    'struck' in m ? [voice(m.struck, 'hits', 'Clatter', m.name)] : [],
  ),
]

export const CONNECTIONS = [...TRIGGER_CABLES, ...KEY_LINE]

export const connectionInto = (to: Machine, signal: Signal) =>
  CONNECTIONS.find(x => x.to === to && x.signal === signal)

/** The kit voice at the kit's end of a cable, or undefined for a cable that
    never touches the kit. */
function kitVoice(c: Controls, x: Connection): string | undefined {
  if (x.from !== 'Clatter' && x.to !== 'Clatter') return undefined
  return choiceName(x.key, Math.round(c[x.key]))
}

/** The pressable name of a cable in a drawing, from machine to machine. */
export const wireId = (x: Connection) => `${x.from} → ${x.to}`

/** A cable as the map and the trigger patch label it: the kit voice at the
    kit's end, the machine at the other. */
export function cableName(c: Controls, x: Connection): string {
  const v = kitVoice(c, x)
  if (v === undefined) return wireId(x)
  return x.from === 'Clatter' ? `${v} → ${x.to}` : `${x.from} → ${v}`
}
