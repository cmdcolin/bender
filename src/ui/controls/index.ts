import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls.ts'
import { BEND_GROUPS } from './bends.ts'
import { FEEDBACK_GROUPS } from './feedback.ts'
import { MASTER_GROUPS } from './master.ts'
import { MIX_GROUPS } from './mix.ts'
import { ORDER_GROUPS } from './order.ts'
import { PATCH_GROUPS } from './patch.ts'
import { PEDAL_GROUPS } from './pedals.ts'
import { SOURCE_GROUPS } from './sources.ts'
import { SUPPLY_GROUPS } from './supply.ts'
import { TAPE_GROUPS } from './tape.ts'

import type { Group, SliderDef } from './types.ts'

export { BENDS, BEND_SLOT_KEYS, bendAt } from './bends.ts'
export { CHANNELS, type Channel } from './mix.ts'
export { TRACK_NUMBERS, type Track } from './fourTrack.ts'
export {
  STAGE_ORDER,
  type Group,
  type SliderDef,
  type StagePlace,
} from './types.ts'

// One file per place on the board, stitched together in the order the panel
// lays them out.
export const GROUPS: Group[] = [
  ...SOURCE_GROUPS,
  ...SUPPLY_GROUPS,
  ...MIX_GROUPS,
  ...BEND_GROUPS,
  ...PEDAL_GROUPS,
  ...PATCH_GROUPS,
  ...FEEDBACK_GROUPS,
  ...TAPE_GROUPS,
  ...MASTER_GROUPS,
  ...ORDER_GROUPS,
]

export const ALL_SLIDERS: SliderDef[] = GROUPS.flatMap(g => g.sliders)
// The controls a widget of the group's own turns, rather than a slider: sixteen
// bits and a step count on the kit, a note per step on the memory. The desk's
// widget names no keys of its own — the faders on it belong to the machines
// they came from.
const editorKeys = (g: Group): ControlKey[] => [
  ...(g.editor?.kind === 'drums' || g.editor?.kind === 'roll'
    ? g.editor.keys
    : []),
  ...(g.memory?.keys ?? []),
]

export const EDITOR_KEYS = new Set<ControlKey>(GROUPS.flatMap(editorKeys))

// Settled once, by name. The drawing asks after all twenty groups' keys every
// time it is built and the panel asks again per part on the shelf per render,
// and both of those happen on every frame a board is travelling.
const KEYS_BY_GROUP = new Map<string, readonly ControlKey[]>(
  GROUPS.map(g => [
    g.name,
    [...g.sliders.map(s => s.key), ...editorKeys(g), ...(g.borrows ?? [])],
  ]),
)

/** Every control a group draws, whatever kind of widget turns it and whoever
    owns it — which is what its count, its reset and its roll are all about. */
export function groupKeys(group: Group | string): readonly ControlKey[] {
  return KEYS_BY_GROUP.get(typeof group === 'string' ? group : group.name) ?? []
}

const OWN_KEYS = new Map<string, readonly ControlKey[]>(
  GROUPS.map(g => [g.name, [...g.sliders.map(s => s.key), ...editorKeys(g)]]),
)

/** The group whose own slider or widget turns the key; borrowers don't count. */
export const OWNER_BY_KEY = new Map<ControlKey, string>(
  [...OWN_KEYS].flatMap(([name, keys]) => keys.map(k => [k, name] as const)),
)

/** Whether a control the group owns sits off stock. */
export const ownTouched = (group: string, c: Controls): boolean =>
  (OWN_KEYS.get(group) ?? []).some(k => c[k] !== DEFAULT_CONTROLS[k])

/** How far off stock a group is sitting, counted in controls. */
export function touchedCount(group: Group | string, c: Controls): number {
  let n = 0
  for (const k of groupKeys(group)) if (c[k] !== DEFAULT_CONTROLS[k]) n++
  return n
}

// Halfway between two enum choices is no choice at all, and halfway between two
// step masks is a pattern neither side wrote — a morph cuts both at its
// midpoint rather than interpolating them.
export const CUT_KEYS = new Set<ControlKey>([
  ...ALL_SLIDERS.filter(s => s.choices).map(s => s.key),
  ...EDITOR_KEYS,
])

// Yours, not the look's: how loud it comes out, which machines you have muted,
// how hot the mic runs and where your finger is on the pad. Neither a random roll nor a morph touches them, so
// picking a look never changes your monitoring level and a morph never drags the
// body pad out from under you mid-gesture.
export const HOLD_KEYS = new Set<ControlKey>([
  'outGain',
  'micLevel',
  'chipMute',
  'drumMute',
  'fmMute',
  'pcmMute',
  'monoMute',
  'stompMute',
  'dlyMute',
  'echoMute',
  'revMute',
  'ensMute',
  'ampMute',
  'bodyX',
  'bodyY',
])
export const SLIDER_BY_KEY = new Map<ControlKey, SliderDef>(
  ALL_SLIDERS.map(s => [s.key, s]),
)

export function sliderFor(key: ControlKey): SliderDef {
  const def = SLIDER_BY_KEY.get(key)
  if (!def) throw new Error(`no slider for ${key}`)
  return def
}

/** Where a control sits when it is off: the bottom of its travel, except on
    one that boots at the top, such as the reverb's Dry level. */
export const offValue = (def: SliderDef): number =>
  DEFAULT_CONTROLS[def.key] === def.max ? def.max : def.min

export const GROUP_BY_KEY = new Map<ControlKey, string>(
  GROUPS.flatMap(g => g.sliders.map(s => [s.key, g.name] as const)),
)

export function groupFor(key: ControlKey): string {
  const name = GROUP_BY_KEY.get(key)
  if (!name) throw new Error(`no group for ${key}`)
  return name
}

/** The number behind a named choice, so a catalog naming a wire survives the
    bus growing another one — and a name that has gone fails loudly rather than
    landing on whatever sits at that index now. */
export function choiceValue(key: ControlKey, choice: string): number {
  const def = sliderFor(key)
  const at = def.choices?.indexOf(choice)
  if (at === undefined || at < 0)
    throw new Error(`${key} has no choice named '${choice}'`)
  return def.min + at
}

/** The name a choice number stands for, so a row can print what a wire picked
    up rather than the number it is stored as. */
export function choiceName(key: ControlKey, value: number): string {
  const def = sliderFor(key)
  const name = def.choices?.[Math.round(value) - def.min]
  if (name === undefined) throw new Error(`${key} has no choice at ${value}`)
  return name
}

export function snapToStep(
  def: Pick<SliderDef, 'min' | 'max' | 'step'>,
  value: number,
): number {
  const stepped = def.min + Math.round((value - def.min) / def.step) * def.step
  return Math.min(def.max, Math.max(def.min, Number(stepped.toFixed(6))))
}
