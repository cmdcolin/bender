import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../../controls'
import { BEND_GROUPS } from './bends'
import { FEEDBACK_GROUPS } from './feedback'
import { MASTER_GROUPS } from './master'
import { PATCH_GROUPS } from './patch'
import { PEDAL_GROUPS } from './pedals'
import { SOURCE_GROUPS } from './sources'
import { TAPE_GROUPS } from './tape'
import type { Group, SliderDef } from './types'

export { BENDS, BEND_SLOT_KEYS, bendAt } from './bends'
export {
  STAGE_ORDER,
  type Group,
  type SliderDef,
  type StagePlace,
} from './types'

// One file per place on the board, stitched together in the order the panel
// lays them out.
export const GROUPS: Group[] = [
  ...SOURCE_GROUPS,
  ...BEND_GROUPS,
  ...PEDAL_GROUPS,
  ...PATCH_GROUPS,
  ...FEEDBACK_GROUPS,
  ...TAPE_GROUPS,
  ...MASTER_GROUPS,
]

export const ALL_SLIDERS: SliderDef[] = GROUPS.flatMap(g => g.sliders)
export const EDITOR_KEYS = new Set<ControlKey>(
  GROUPS.flatMap(g => g.editor?.keys ?? []),
)

// Settled once, by name. The drawing asks after all twenty groups' keys every
// time it is built and the panel asks again per part on the shelf per render,
// and both of those happen on every frame a board is travelling.
const KEYS_BY_GROUP = new Map<string, readonly ControlKey[]>(
  GROUPS.map(g => [
    g.name,
    [...g.sliders.map(s => s.key), ...(g.editor?.keys ?? [])],
  ]),
)

/** Every control a group owns, whatever kind of widget turns it. */
export function groupKeys(group: Group | string): readonly ControlKey[] {
  return KEYS_BY_GROUP.get(typeof group === 'string' ? group : group.name) ?? []
}

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

// Yours, not the look's: how loud it comes out, how hot the mic runs and where
// your finger is on the pad. Neither a random roll nor a morph touches them, so
// picking a look never changes your monitoring level and a morph never drags the
// body pad out from under you mid-gesture.
export const HOLD_KEYS = new Set<ControlKey>([
  'outGain',
  'micLevel',
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

export const GROUP_BY_KEY = new Map<ControlKey, string>(
  GROUPS.flatMap(g => g.sliders.map(s => [s.key, g.name] as const)),
)

export function groupFor(key: ControlKey): string {
  const name = GROUP_BY_KEY.get(key)
  if (!name) throw new Error(`no group for ${key}`)
  return name
}

export function snapToStep(
  def: Pick<SliderDef, 'min' | 'max' | 'step'>,
  value: number,
): number {
  const stepped = def.min + Math.round((value - def.min) / def.step) * def.step
  return Math.min(def.max, Math.max(def.min, Number(stepped.toFixed(6))))
}
