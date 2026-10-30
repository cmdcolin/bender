import { type ControlKey, type Controls } from '../controls.ts'
import { BEND_ENDS, STAGE_DB } from './bendEnds.ts'
import { bendAt, BEND_SLOT_KEYS, BENDS } from './controls/bends.ts'
import {
  groupFor,
  sliderFor,
  snapToStep,
  type SliderDef,
} from './controls/index.ts'
import { LETTERS } from './keyboard.ts'
import { inTime } from './presets/quantize.ts'
import {
  ANTAGONISTS,
  drivable,
  gateOf,
  heard,
  inChain,
} from './presets/scenarios.ts'
import { YOURS } from './presets/yours.ts'
import { fromPos, toPos } from './slider-scale.ts'

// A bend key is a throw dealt by the dice: one letter of the keyboard that
// pushes a few controls to an end of their travel while it is down and springs
// back when it is let go.
export interface BendKey {
  letter: string
  /** The stages you hear, loudest change first, for the pad. */
  stages: string[]
  /** Each control and which way it goes, for the tip. */
  says: string
  /** What the key drives, before any level it brings up to be heard. */
  keys: ControlKey[]
  push: (c: Controls) => Partial<Controls>
}

// How hard a deal comes out. Tame moves one control a key, wild one to three
// with a fighting pair now and then, and wreck always three, with a third of
// the keys soldering a bay wire or a bend into the chain on top.
export const HEATS = ['tame', 'wild', 'wreck'] as const
export type Heat = (typeof HEATS)[number]
export const isHeat = (v: unknown): v is Heat => HEATS.some(h => h === v)

/** Where a silent stage's mix or level goes when a key needs it heard. */
const GATE_POS = 0.75

/** The two ends a key slams a control to. */
export const LOW_POS = 0.03
export const HIGH_POS = 0.97

// A silent stage that comes up louder than this over the board — the
// feedback bus, the chaos oscillator — is one a key leaves down, and a level
// or mix that turns the board up by more than this is a volume knob rather
// than a bend. Feedback slammed loud stays in the deal.
const LOUDEST_DB = 6

const STRIP_KEY = /^four[1-4](?:Trim|Low|MidHz|Mid|High|Pan)$/
const FADERS = ['four1Fader', 'four2Fader', 'four3Fader', 'four4Fader'] as const

/** The fader of the channel a strip control belongs to, which has to be up for
    the strip to be heard. */
export const faderOf = (key: ControlKey): ControlKey | undefined =>
  STRIP_KEY.test(key)
    ? FADERS.find(fader => fader.slice(0, 5) === key.slice(0, 5))
    : undefined

type Move = { def: SliderDef; pos: number }

const nearEnd = (rand: () => number, top: boolean) =>
  top ? 1 - rand() * 0.06 : rand() * 0.06

// The ends that measured as a change you can hear, less any the control
// already sits at on this board. A control the table has not measured gets
// both.
const liveEnds = (c: Controls, key: ControlKey): boolean[] => {
  const def = sliderFor(key)
  const at = toPos(def, c[key])
  const ends = BEND_ENDS[key] ?? [0, 0]
  return ends.map(
    (db, end) =>
      db !== null &&
      !(def.role !== undefined && db > LOUDEST_DB) &&
      Math.abs(at - end) > 0.1,
  )
}

const endDb = (key: ControlKey, pos: number) =>
  BEND_ENDS[key]?.[pos >= 0.5 ? 1 : 0] ?? 0

const pickEnd = (c: Controls, key: ControlKey, rand: () => number) => {
  const [low, high] = liveEnds(c, key)
  return low && high ? rand() < 0.5 : !!high
}

/** The gate a move would have to bring up to be heard, if any. */
const silentGate = (c: Controls, key: ControlKey) => {
  const gate = gateOf(groupFor(key))
  return gate && gate !== key && !YOURS.has(gate) && !heard(c, key)
    ? gate
    : undefined
}

function slamMove(
  c: Controls,
  pool: SliderDef[],
  rand: () => number,
  open: (def: SliderDef) => boolean,
): Move | null {
  const candidates = pool.filter(open)
  if (candidates.length === 0) return null
  const def = candidates[Math.floor(rand() * candidates.length)]!
  return { def, pos: nearEnd(rand, pickEnd(c, def.key, rand)) }
}

function edgeMoves(
  c: Controls,
  taken: Set<ControlKey>,
  rand: () => number,
  open: (def: SliderDef) => boolean,
): Move[] {
  const pairs = ANTAGONISTS.filter(
    ([a, b]) =>
      inChain(c, groupFor(a)) &&
      !taken.has(a) &&
      !taken.has(b) &&
      open(sliderFor(a)) &&
      open(sliderFor(b)) &&
      liveEnds(c, a)[1] &&
      liveEnds(c, b).some(Boolean),
  )
  const pair = pairs[Math.floor(rand() * pairs.length)]
  if (!pair) return []
  const [a, b] = pair
  return [
    { def: sliderFor(a), pos: 0.82 + rand() * 0.18 },
    {
      def: sliderFor(b),
      pos: pickEnd(c, b, rand) ? 0.82 + rand() * 0.18 : rand() * 0.18,
    },
  ]
}

const arrow = (pos: number) => (pos >= 0.5 ? '▲' : '▼')

/** Something soldered on top of a wreck key: a wire in the bay, or a bend
    dropped into the chain with its mix up. */
interface Solder {
  name: string
  patch: Partial<Controls>
}

// The nth free slot, or the nth slot of all of them once every one is taken:
// a wreck key over a board with a full bay replaces a wire for as long as it
// is held.
const emptyOr = <T>(
  items: readonly T[],
  free: (t: T) => boolean,
  nth: number,
) => {
  const open = items.filter(free)
  const from = open.length > 0 ? open : items
  return from[nth % from.length]!
}

const WIRES = ([0, 1, 2, 3] as const).map(i => ({
  src: `mod${i}Src` as const,
  dest: `mod${i}Dest` as const,
  depth: `mod${i}Depth` as const,
}))

function solderWire(c: Controls, nth: number, rand: () => number): Solder {
  const { src, dest, depth } = emptyOr(WIRES, w => c[w.src] === 0, nth)
  const srcDef = sliderFor(src)
  const destDef = sliderFor(dest)
  const to = 1 + Math.floor(rand() * (destDef.max - 1))
  return {
    name: `+ ${destDef.choices?.[to] ?? 'wire'}`,
    patch: {
      [src]: 1 + Math.floor(rand() * (srcDef.max - 1)),
      [dest]: to,
      [depth]: snapToStep(sliderFor(depth), fromPos(sliderFor(depth), 0.95)),
    },
  }
}

function solderBend(c: Controls, nth: number, rand: () => number): Solder {
  const slot = emptyOr(BEND_SLOT_KEYS, k => c[k] === 0, nth)
  const quiet = BENDS.flatMap((b, i) =>
    (STAGE_DB[b.mix] ?? 0) <= LOUDEST_DB ? [i + 1] : [],
  )
  const which = quiet[Math.floor(rand() * quiet.length)]!
  const bend = bendAt(which)!
  return {
    name: `+ ${bend.label}`,
    patch: {
      [slot]: which,
      [bend.mix]: snapToStep(
        sliderFor(bend.mix),
        fromPos(sliderFor(bend.mix), 0.85),
      ),
    },
  }
}

/** The patch that brings a silent stage up to be heard. */
export const gateUp = (gate: ControlKey) =>
  snapToStep(sliderFor(gate), fromPos(sliderFor(gate), GATE_POS))

function keyFrom(
  letter: string,
  c: Controls,
  moves: Move[],
  solder: Solder | null,
): BendKey {
  const next = { ...c }
  const moved = new Set<ControlKey>()
  for (const { def, pos } of moves) {
    next[def.key] = snapToStep(def, fromPos(def, pos))
    moved.add(def.key)
  }
  inTime(next, key => moved.has(key))
  const patch: Partial<Controls> = { ...solder?.patch }
  for (const key of moved) patch[key] = next[key]
  const gates = new Map<ControlKey, number>()
  for (const key of moved) {
    const gate = gateOf(groupFor(key))
    if (gate && !moved.has(gate) && !YOURS.has(gate))
      gates.set(gate, gateUp(gate))
  }
  // The stage a key brings up is most of what it sounds like, so it leads.
  const heardAs = new Map<string, number>()
  for (const { def, pos } of moves) {
    const gate = silentGate(c, def.key)
    const db = gate ? Infinity : Math.abs(endDb(def.key, pos))
    const group = groupFor(def.key)
    heardAs.set(group, Math.max(heardAs.get(group) ?? 0, db))
  }
  const stages = [...heardAs.entries()]
    .toSorted((a, b) => (a[1] === b[1] ? 0 : a[1] < b[1] ? 1 : -1))
    .map(([group]) => group.toLowerCase())
  return {
    letter,
    keys: [...moved],
    stages: solder ? [...stages, solder.name] : stages,
    says:
      moves
        .map(
          ({ def, pos }) => `${groupFor(def.key)} ${def.label} ${arrow(pos)}`,
        )
        .join(', ') + (solder ? ` ${solder.name}` : ''),
    push: live => {
      const out: Partial<Controls> = { ...patch }
      for (const [gate, floor] of gates) out[gate] = Math.max(live[gate], floor)
      return out
    },
  }
}

/** Sixteen throws off the dice, one per letter key, for the board as it stands.
    No two keys share a control, and no two bring up the same silent stage, so
    a chord of them is a chord. */
export function dealBendKeys(
  c: Controls,
  rand: () => number,
  heat: Heat = 'wild',
): BendKey[] {
  // A stage whose level is yours — the sampler's — is not brought up by a
  // key, so its controls are dealt only while it can already be heard.
  const pool = drivable(c).filter(d => {
    const group = groupFor(d.key)
    const gate = gateOf(group)
    const fader = faderOf(d.key)
    return (
      (!fader || c[fader] > sliderFor(fader).min) &&
      liveEnds(c, d.key).some(Boolean) &&
      inChain(c, group) &&
      (heard(c, d.key) || !gate || !YOURS.has(gate))
    )
  })
  const taken = new Set<ControlKey>()
  const raised = new Set<ControlKey>()
  let soldered = 0
  return LETTERS.map(letter => {
    const mine = new Set<ControlKey>()
    const open = (def: SliderDef) => {
      const gate = silentGate(c, def.key)
      return (
        !gate ||
        mine.has(gate) ||
        (!raised.has(gate) && (STAGE_DB[gate] ?? 0) <= LOUDEST_DB)
      )
    }
    const add = (more: Move[]) => {
      for (const { def } of more) {
        taken.add(def.key)
        const gate = silentGate(c, def.key)
        if (gate) mine.add(gate)
        const at = pool.indexOf(def)
        if (at >= 0) pool.splice(at, 1)
      }
      return more
    }
    let moves: Move[] = []
    if (heat !== 'tame' && rand() < 0.25)
      moves = add(edgeMoves(c, taken, rand, open))
    const want =
      heat === 'tame' ? 1 : heat === 'wild' ? 1 + Math.floor(rand() * 3) : 3
    while (moves.length < want) {
      const move = slamMove(c, pool, rand, open)
      if (!move) break
      moves = [...moves, ...add([move])]
    }
    for (const gate of mine) raised.add(gate)
    const solder =
      heat === 'wreck' && rand() < 1 / 3
        ? rand() < 0.5
          ? solderWire(c, soldered++, rand)
          : solderBend(c, soldered++, rand)
        : null
    return keyFrom(letter, c, moves, solder)
  })
}
