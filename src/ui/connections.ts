import { ANY_CHOICE } from '../dsp/trigbus.ts'
import { choiceName } from './controls/index.ts'

import type { ControlKey, Controls } from '../controls.ts'
import type { NoteDest } from '../engine/messages.ts'

export type Machine = 'Plinky' | 'Clatter' | 'Glint' | 'Parlor' | 'Growler'

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

export const MACHINE_OF: Record<NoteDest, Machine> = {
  toy: 'Plinky',
  fm: 'Glint',
  pcm: 'Parlor',
  mono: 'Growler',
}

export const SIGNAL_COLOUR: Record<Signal, string> = {
  notes: 'var(--accent2)',
  hits: 'var(--hits)',
}

const jumper = (key: ControlKey, to: Machine): Connection => ({
  key,
  signal: 'notes',
  from: 'Plinky',
  to,
  plugged: c => c[key] < 0.5,
  plugIn: 0,
  pullOut: 1,
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

export const KEY_LINE = [
  jumper('fmKeyGate', 'Glint'),
  jumper('pcmKeyGate', 'Parlor'),
  jumper('monoKeyGate', 'Growler'),
]

export const KIT_TO_PLINKY = voice('trigToKeys', 'hits', 'Clatter', 'Plinky')
export const PLINKY_TO_KIT = voice('trigToDrum', 'notes', 'Plinky', 'Clatter')

export const TRIGGER_CABLES = [
  KIT_TO_PLINKY,
  PLINKY_TO_KIT,
  voice('fmStruck', 'hits', 'Clatter', 'Glint'),
  voice('pcmStruck', 'hits', 'Clatter', 'Parlor'),
  voice('monoStruck', 'hits', 'Clatter', 'Growler'),
]

export const CONNECTIONS = [...TRIGGER_CABLES, ...KEY_LINE]

export const connectionInto = (to: Machine, signal: Signal) =>
  CONNECTIONS.find(x => x.to === to && x.signal === signal)

/** The kit voice at the kit's end of a cable, or undefined for a cable that
    never touches the kit. */
export function kitVoice(c: Controls, x: Connection): string | undefined {
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
