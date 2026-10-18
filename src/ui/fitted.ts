import { createStore } from '../listeners.ts'
import { FIXED, GATES, gateOff, onBoard } from './chain-map.ts'
import { OWNER_BY_KEY, type Group } from './controls/index.ts'
import { coherePatch, cohereVoices } from './presets/patch.ts'
import { resetGroup } from './presets/roll.ts'

import type { Controls } from '../controls.ts'

// The stages on the map are the ones the board uses (`onBoard`) plus the ones
// you added or opened, which stay until you take them off. Rolls change only
// those, so a roll never brings in an effect you didn't put there.

/** Stages you added that the board would not otherwise show. */
export const added = createStore<ReadonlySet<string>>(new Set())

export const shownOn = (c: Controls): Set<string> =>
  new Set([...onBoard(c), ...added.get()])

export function add(names: Iterable<string>) {
  const next = new Set([...added.get(), ...names])
  if (next.size !== added.get().size) added.set(next)
}

export const clearAdded = () => added.set(new Set())

export const removable = (name: string) => !FIXED.has(name)

/** The board with the stage closed off: a gated stage's level or mix down and
    its other knobs left as you set them, any other group back to stock. */
export function takeOff(group: Group, c: Controls): Controls {
  const next = new Set(added.get())
  next.delete(group.name)
  added.set(next)
  const gate = GATES[group.name]
  if (!gate) return resetGroup(group, c)
  const out = { ...c }
  for (const key of gate) out[key] = gateOff(key)
  return out
}

/** A roll held to the stages on the map: every control a stage off the map
    owns stays where it was. The stages shown before the roll stay shown after
    it, even where the roll took them back to stock. */
export function confine(
  next: Controls,
  current: Controls,
  rand: () => number,
): Controls {
  const shown = shownOn(current)
  const held = { ...next }
  for (const [key, owner] of OWNER_BY_KEY)
    if (!shown.has(owner)) held[key] = current[key]
  const out = cohereVoices(coherePatch(held, rand, { wake: false }), rand)
  const after = onBoard(out)
  add([...shown].filter(name => !after.has(name)))
  return out
}
