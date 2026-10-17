import { type Group, groupKeys } from '../controls/index.ts'
import { inTime } from './quantize.ts'
import { nudgeSliders, rollGroup, rollKeys, rollPattern } from './roll.ts'

import type { ControlKey, Controls } from '../../controls.ts'
import type { SliderDef } from '../controls/types.ts'

export interface StageRoll {
  name: string
  label: string
  blurb: string
  /** Whether the stage has anything for this roll to move. */
  fits: (group: Group) => boolean
  roll: (group: Group, current: Controls, rand: () => number) => Controls
}

// The folds a fault lives in: the knife on the bus, the die's supply and the
// card's own parts. Rolling them turns a machine into a different, broken one,
// so the plain roll leaves them where they stand.
const FAULT_PARTS: ReadonlySet<string> = new Set([
  'knife on the bus',
  'voice card faults',
  'die and driver',
  'the supply underneath',
])

// The folds that decide how a machine is played rather than how it sounds: key
// lock and the arpeggiator, the gate and trigger wiring, the key gates.
const PLAY_PARTS: ReadonlySet<string> = new Set([
  'arp and key lock',
  'clocks and wires',
  'clock and wires',
  'keys',
  'triggers and cross-patch',
])

const sliders = (group: Group, keep: (part: string | undefined) => boolean) =>
  group.sliders.filter(s => keep(s.part))

const keysOf = (defs: readonly SliderDef[]): ControlKey[] =>
  defs.map(d => d.key)

const isSound = (part: string | undefined) =>
  part === undefined || !(FAULT_PARTS.has(part) || PLAY_PARTS.has(part))

const isFault = (part: string | undefined) =>
  part !== undefined && FAULT_PARTS.has(part)

const isPlay = (part: string | undefined) =>
  part !== undefined && PLAY_PARTS.has(part)

const hasAny = (group: Group, keep: (part: string | undefined) => boolean) =>
  sliders(group, keep).length > 0

const NUDGE = 0.15

function nudgeSound(group: Group, current: Controls, rand: () => number) {
  const defs = sliders(group, isSound)
  const next = nudgeSliders(current, defs, NUDGE, rand)
  const moved = new Set(keysOf(defs).filter(k => next[k] !== current[k]))
  return inTime(next, k => moved.has(k))
}

export const STAGE_ROLLS: readonly StageRoll[] = [
  {
    name: 'sound',
    label: 'randomize',
    blurb:
      'Rolls the sound controls somewhere new. Faults, the supply, key lock and wiring stay where they are, and so does the pattern.',
    fits: () => true,
    roll: (group, current, rand) =>
      rollKeys(current, keysOf(sliders(group, isSound)), rand),
  },
  {
    name: 'nudge',
    label: 'nudge',
    blurb:
      'Moves a handful of the sound controls a little way. The same machine, a step off.',
    fits: group => hasAny(group, isSound),
    roll: nudgeSound,
  },
  {
    name: 'faults',
    label: 'faults',
    blurb:
      'Rolls only the knife on the bus, the supply and the card faults. The sound controls stay put, so you hear what the faults do.',
    fits: group => hasAny(group, isFault),
    roll: (group, current, rand) =>
      rollKeys(current, keysOf(sliders(group, isFault)), rand, true),
  },
  {
    name: 'play',
    label: 'play',
    blurb:
      'Rolls how the machine is played: key lock, arpeggio, gates and trigger wiring.',
    fits: group => hasAny(group, isPlay),
    roll: (group, current, rand) =>
      rollKeys(current, keysOf(sliders(group, isPlay)), rand, true),
  },
  {
    name: 'pattern',
    label: 'pattern',
    blurb: 'A new step pattern and row lengths. The sound stays.',
    fits: group => group.editor?.kind === 'drums',
    roll: (_group, current, rand) => rollPattern(current, rand),
  },
  {
    name: 'everything',
    label: 'everything',
    blurb:
      'Every control the machine owns, faults and wiring included — and the pattern on the kit.',
    fits: group => groupKeys(group).length > 0,
    roll: rollGroup,
  },
]

export const stageRollsFor = (group: Group) =>
  STAGE_ROLLS.filter(r => r.fits(group))
