import { createStore } from '../listeners'
import { groupFor, sliderFor, snapToStep, type SliderDef } from './controls'
import { LETTERS } from './keyboard'
import { inTime } from './presets/quantize'
import {
  ANTAGONISTS,
  drivable,
  gateOf,
  heard,
  inChain,
} from './presets/scenarios'
import { YOURS } from './presets/yours'
import { fromPos } from './slider-scale'

import type { ControlKey, Controls } from '../controls'

// A bend key is a throw dealt by the dice: one letter of the keyboard that
// pushes a few controls to an end of their travel while it is down and springs
// back when it is let go. The hold row has six throws somebody chose; this is
// sixteen more nobody did, so the keyboard can throw the board around instead
// of playing notes on it. A deal is a hand's worth, and a hand that has learned
// where the good ones landed keeps it until it asks for another.
export interface BendKey {
  letter: string
  /** What is on the pad: each control's label and which way it goes. */
  name: string
  /** The same with the stage named, for the tip. */
  says: string
  /** What the key drives, before any level it brings up to be heard. */
  keys: ControlKey[]
  push: (c: Controls) => Partial<Controls>
}

export const bendName = (letter: string) => `bend:${letter}`

type Move = { def: SliderDef; pos: number }

const nearEnd = (rand: () => number, top: boolean) =>
  top ? 1 - rand() * 0.06 : rand() * 0.06

// A key that pushes a stage nobody can hear is a dead key, so a stage whose
// mix or level is down comes up with the push. Only as far as it has to: the
// hand's own level stays where the hand put it when that is already higher.
const GATE_POS = 0.75

function slamMoves(pool: SliderDef[], rand: () => number): Move[] {
  const count = 1 + Math.floor(rand() * 3)
  const moves: Move[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const def = pool.splice(Math.floor(rand() * pool.length), 1)[0]!
    moves.push({ def, pos: nearEnd(rand, rand() < 0.5) })
  }
  return moves
}

function edgeMoves(
  c: Controls,
  taken: Set<ControlKey>,
  rand: () => number,
): Move[] {
  const pairs = ANTAGONISTS.filter(
    ([a, b]) => inChain(c, groupFor(a)) && !taken.has(a) && !taken.has(b),
  )
  const pair = pairs[Math.floor(rand() * pairs.length)]
  if (!pair) return []
  const [a, b] = pair
  return [
    { def: sliderFor(a), pos: 0.82 + rand() * 0.18 },
    {
      def: sliderFor(b),
      pos: rand() < 0.5 ? 0.82 + rand() * 0.18 : rand() * 0.18,
    },
  ]
}

const arrow = (pos: number) => (pos >= 0.5 ? '▲' : '▼')

function keyFrom(letter: string, c: Controls, moves: Move[]): BendKey {
  const next = { ...c }
  const moved = new Set<ControlKey>()
  for (const { def, pos } of moves) {
    next[def.key] = snapToStep(def, fromPos(def, pos))
    moved.add(def.key)
  }
  inTime(next, key => moved.has(key))
  const patch: Partial<Controls> = {}
  for (const key of moved) patch[key] = next[key]
  const gates = new Map<ControlKey, number>()
  for (const key of moved) {
    const gate = gateOf(groupFor(key))
    if (gate && !moved.has(gate) && !YOURS.has(gate))
      gates.set(
        gate,
        snapToStep(sliderFor(gate), fromPos(sliderFor(gate), GATE_POS)),
      )
  }
  return {
    letter,
    keys: [...moved],
    name: moves.map(({ def, pos }) => `${def.label} ${arrow(pos)}`).join(' '),
    says: moves
      .map(({ def, pos }) => `${groupFor(def.key)} ${def.label} ${arrow(pos)}`)
      .join(', '),
    push: live => {
      const out: Partial<Controls> = { ...patch }
      for (const [gate, floor] of gates) out[gate] = Math.max(live[gate], floor)
      return out
    },
  }
}

/** Sixteen throws off the dice, one per letter key, for the board as it stands:
    mostly a control or three slammed to an end, now and then a pair that fight
    driven to opposite corners. No two keys share a control, so a chord of them
    is a chord. */
export function dealBendKeys(c: Controls, rand: () => number): BendKey[] {
  // A stage whose level is yours — the sampler's — is not brought up by a
  // key, so its controls are dealt only while it can already be heard.
  const pool = drivable(c).filter(d => {
    const group = groupFor(d.key)
    const gate = gateOf(group)
    return inChain(c, group) && (heard(c, d.key) || !gate || !YOURS.has(gate))
  })
  const taken = new Set<ControlKey>()
  return LETTERS.map(letter => {
    let moves = rand() < 0.25 ? edgeMoves(c, taken, rand) : []
    if (moves.length === 0) moves = slamMoves(pool, rand)
    for (const { def } of moves) {
      taken.add(def.key)
      const at = pool.indexOf(def)
      if (at >= 0) pool.splice(at, 1)
    }
    return keyFrom(letter, c, moves)
  })
}

/** The hand dealt, empty until the row first asks for one. */
export const bendDeal = createStore<BendKey[]>([])

export const redealBendKeys = (c: Controls, rand: () => number = Math.random) =>
  bendDeal.set(dealBendKeys(c, rand))
