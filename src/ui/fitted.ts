import { createStore } from '../listeners.ts'
import { bench, setBench, type Bench } from './bench.ts'
import { FIXED, GATES, gateOff, onBoard } from './chain-map.ts'
import { GROUPS, OWNER_BY_KEY, type Group } from './controls/index.ts'
import { readSession, writeSession } from './persist.ts'
import { coherePatch, cohereVoices } from './presets/patch.ts'
import { resetGroup } from './presets/roll.ts'

import type { Controls } from '../controls.ts'

// The stages on the map are the ones the board uses (`onBoard`), the ones you
// added or opened, which stay until you take them off, and the faces the bench
// lays out. Rolls change only those, so a roll never brings in an effect you
// didn't put there, and a face on screen always has its box on the map.

// Kept for the tab, so a reload keeps them and a fresh tab or a shared link
// starts with none.
const KEY = 'bender.addedStages'
const NAMES = new Set(GROUPS.map(g => g.name))

export function parseAdded(raw: string | null): Set<string> {
  try {
    const names: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(names)
      ? new Set(names.filter((n): n is string => NAMES.has(n)))
      : new Set()
  } catch {
    return new Set()
  }
}

/** Stages you added that the board would not otherwise show. */
export const added = createStore<ReadonlySet<string>>(
  parseAdded(readSession(KEY)),
)
added.subscribe(() => writeSession(KEY, JSON.stringify([...added.get()])))

/** The faces the bench lays out whatever the board holds: the instruments and
    pedals brought up. */
export const benchStages = (b: Bench): string[] => [
  ...b.instruments,
  ...b.pedals,
]

export const shownOn = (c: Controls, b: Bench = bench.get()): Set<string> =>
  new Set([...onBoard(c), ...added.get(), ...benchStages(b)])

export function add(names: Iterable<string>) {
  const next = new Set([...added.get(), ...names])
  if (next.size !== added.get().size) added.set(next)
}

export const clearAdded = () => added.set(new Set())

export const removable = (name: string) => !FIXED.has(name)

function putAway(name: string) {
  const b = bench.get()
  const pedals = b.pedals.filter(p => p !== name)
  const instruments = b.instruments.filter(s => s !== name)
  if (
    pedals.length !== b.pedals.length ||
    instruments.length !== b.instruments.length
  )
    setBench({ ...b, pedals, instruments })
}

/** The board with the stage closed off: a gated stage's level or mix down and
    its other knobs left as you set them, any other group back to stock. The
    stage's face leaves the bench too. */
export function takeOff(group: Group, c: Controls): Controls {
  const next = new Set(added.get())
  next.delete(group.name)
  added.set(next)
  putAway(group.name)
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
