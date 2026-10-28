import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import { DEST } from '../dsp/modbus.ts'
import { WIRE_TARGET } from './chain-map.ts'
import { choiceName, choiceValue } from './controls/index.ts'

import type { Facing } from './cablePaths.ts'
import type { Machine } from './connections.ts'

const WIRES = [
  { src: 'mod0Src', dest: 'mod0Dest', depth: 'mod0Depth' },
  { src: 'mod1Src', dest: 'mod1Dest', depth: 'mod1Depth' },
  { src: 'mod2Src', dest: 'mod2Dest', depth: 'mod2Depth' },
  { src: 'mod3Src', dest: 'mod3Dest', depth: 'mod3Depth' },
] as const satisfies readonly Record<'src' | 'dest' | 'depth', ControlKey>[]

const OFF = choiceValue('mod0Src', 'off')
export const LFO = choiceValue('mod0Src', 'LFO')

/** The bay's own modules, which keep a jack on the MOD plate whether or not a
    cable leaves them. Other sources get a jack while one does. */
export const MODULES = ['LFO', 'ADSR', 'phrase', 'lane A', 'lane B'].map(name =>
  choiceValue('mod0Src', name),
)

const PLATE_NAME: Record<string, string> = {
  envelope: 'env',
  'body X': 'body x',
  'body Y': 'body y',
  'fb bus': 'fb',
  'ROM step': 'rom',
  'drum hit': 'hit',
  'key hit': 'key',
  'lane A': 'lane a',
  'lane B': 'lane b',
}

export const sourceName = (src: number) => choiceName('mod0Src', src)

export const plateName = (src: number) => {
  const name = sourceName(src)
  return PLATE_NAME[name] ?? name
}

export const destName = (dest: number) => choiceName('mod0Dest', dest)

export const CV_MACHINES: readonly Machine[] = [
  'Plinky',
  'Glint',
  'Parlor',
  'Growler',
  'Clatter',
]

/** Where a fresh cable into a machine's CV jack lands: its pitch or clock where
    the bay reaches one, else its level. */
export const CV_DEST: Record<Machine, number> = {
  Plinky: DEST.chipClock,
  Glint: DEST.fmClock,
  Parlor: DEST.pcmLevel,
  Growler: DEST.monoPitch,
  Clatter: DEST.drumTune,
}

export const MOD_COLOUR = 'var(--mod)'

/** The CV jack on the kit sits on its plate and faces up; the rest sit on a
    case's right edge. */
export const cvFacing = (machine: Machine): Facing =>
  machine === 'Clatter' ? 'up' : 'right'

const machineOf = (dest: number) =>
  CV_MACHINES.find(m => m === WIRE_TARGET[dest])

export interface ModCable {
  /** Which of the bay's four wires, from 0. */
  wire: number
  src: number
  dest: number
  depth: number
  machine: Machine
}

/** The bay's wires that land on a machine with a CV jack. */
export function modCables(c: Controls): ModCable[] {
  return WIRES.flatMap(({ src, dest, depth }, wire) => {
    const s = Math.round(c[src])
    const d = Math.round(c[dest])
    const machine = machineOf(d)
    return s !== OFF && machine
      ? [{ wire, src: s, dest: d, depth: c[depth], machine }]
      : []
  })
}

/** The sources any wire picks up, wherever it lands. */
export const sourcesInUse = (c: Controls) =>
  new Set(WIRES.map(w => Math.round(c[w.src])).filter(s => s !== OFF))

export const spareWire = (c: Controls) =>
  WIRES.findIndex(w => Math.round(c[w.src]) === OFF)

/** The board with a spare wire run from `src` into the machine's CV jack, or
    the same board where all four wires are in use. */
export function patchCv(c: Controls, src: number, machine: Machine): Controls {
  const at = spareWire(c)
  if (at < 0) return c
  const w = WIRES[at]!
  const next = { ...c, [w.src]: src, [w.dest]: CV_DEST[machine] }
  if (next[w.depth] === 0) next[w.depth] = DEFAULT_CONTROLS[w.depth]
  return next
}

/** The board with the wire moved onto another machine's CV jack, its source
    and depth kept. */
export const moveCv = (c: Controls, wire: number, machine: Machine) => ({
  ...c,
  [WIRES[wire]!.dest]: CV_DEST[machine],
})

export const pullCv = (c: Controls, wire: number) => ({
  ...c,
  [WIRES[wire]!.src]: OFF,
})

export function cableSays(cable: ModCable): string {
  const depth =
    cable.depth === 0
      ? 'at zero depth'
      : `${Math.abs(cable.depth).toFixed(2)} ${cable.depth < 0 ? 'flipped' : 'straight'}`
  return `Wire ${cable.wire + 1}: ${sourceName(cable.src)} → ${destName(cable.dest)}, ${depth}`
}
