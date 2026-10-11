import { CONTROL_KEYS, type ControlKey, type Controls } from '../controls'
import { STEPS, stepBit } from '../drums'
import { engine } from '../engine/engine'
import { createStore } from '../listeners'
import { groupFor, sliderFor, snapToStep, type SliderDef } from './controls'
import { bendAt, BEND_SLOT_KEYS, BENDS } from './controls/bends'
import { LETTERS } from './keyboard'
import { read, write } from './persist'
import { inTime } from './presets/quantize'
import {
  ANTAGONISTS,
  drivable,
  gateOf,
  heard,
  inChain,
} from './presets/scenarios'
import { YOURS } from './presets/yours'
import { fromPos, toPos } from './slider-scale'

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
export const isBendName = (name: string) =>
  LETTERS.some(l => bendName(l) === name)
/** The same key held by the kit's bend row rather than by a hand, so the two
    let go of each other's hold without a fight. */
export const bendStepName = (letter: string) => `bend:${letter}:step`

// How hard a deal comes out. Tame moves one control a key, wild one to three
// with a fighting pair now and then, and wreck always three, with a third of
// the keys soldering a bay wire or a bend into the chain on top.
export const HEATS = ['tame', 'wild', 'wreck'] as const
export type Heat = (typeof HEATS)[number]
export const isHeat = (v: unknown): v is Heat => HEATS.some(h => h === v)

type Move = { def: SliderDef; pos: number }

const nearEnd = (rand: () => number, top: boolean) =>
  top ? 1 - rand() * 0.06 : rand() * 0.06

// A key that pushes a stage nobody can hear is a dead key, so a stage whose
// mix or level is down comes up with the push. Only as far as it has to: the
// hand's own level stays where the hand put it when that is already higher.
const GATE_POS = 0.75

function slamMoves(
  pool: SliderDef[],
  rand: () => number,
  count: number,
): Move[] {
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
  const which = 1 + Math.floor(rand() * BENDS.length)
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
      gates.set(
        gate,
        snapToStep(sliderFor(gate), fromPos(sliderFor(gate), GATE_POS)),
      )
  }
  const tail = solder ? ` ${solder.name}` : ''
  return {
    letter,
    keys: [...moved],
    name:
      moves.map(({ def, pos }) => `${def.label} ${arrow(pos)}`).join(' ') +
      tail,
    says:
      moves
        .map(
          ({ def, pos }) => `${groupFor(def.key)} ${def.label} ${arrow(pos)}`,
        )
        .join(', ') + tail,
    push: live => {
      const out: Partial<Controls> = { ...patch }
      for (const [gate, floor] of gates) out[gate] = Math.max(live[gate], floor)
      return out
    },
  }
}

/** Sixteen throws off the dice, one per letter key, for the board as it stands.
    No two keys share a control, so a chord of them is a chord. */
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
    return inChain(c, group) && (heard(c, d.key) || !gate || !YOURS.has(gate))
  })
  const taken = new Set<ControlKey>()
  let soldered = 0
  return LETTERS.map(letter => {
    let moves: Move[] = []
    if (heat !== 'tame' && rand() < 0.25) moves = edgeMoves(c, taken, rand)
    const want =
      heat === 'tame' ? 1 : heat === 'wild' ? 1 + Math.floor(rand() * 3) : 3
    if (moves.length < want)
      moves = [...moves, ...slamMoves(pool, rand, want - moves.length)]
    for (const { def } of moves) {
      taken.add(def.key)
      const at = pool.indexOf(def)
      if (at >= 0) pool.splice(at, 1)
    }
    const solder =
      heat === 'wreck' && rand() < 1 / 3
        ? rand() < 0.5
          ? solderWire(c, soldered++, rand)
          : solderBend(c, soldered++, rand)
        : null
    return keyFrom(letter, c, moves, solder)
  })
}

const HEAT_KEY = 'bender.bend.heat'
const SWELL_KEY = 'bender.bend.swell'
const EVERY_KEY = 'bender.bend.every'
const LETTERS_KEY = 'bender.bend.letters'

const storedHeat = read(HEAT_KEY)
export const bendHeat = createStore<Heat>(
  isHeat(storedHeat) ? storedHeat : 'wild',
)
export function setBendHeat(heat: Heat) {
  bendHeat.set(heat)
  write(HEAT_KEY, heat)
}

/** Keys ramp in over the morph time and fall back the same way, instead of
    snapping. */
export const bendSwell = createStore(read(SWELL_KEY) === '1')
export function setBendSwell(on: boolean) {
  bendSwell.set(on)
  write(SWELL_KEY, on ? '1' : '0')
}

/** Bars of the kit between deals, or 0 for a hand that keeps its deal. */
export const REDEAL_BARS = [0, 1, 4, 8] as const
export type RedealBars = (typeof REDEAL_BARS)[number]
const storedEvery = Number(read(EVERY_KEY))
export const redealEvery = createStore<RedealBars>(
  REDEAL_BARS.find(b => b === storedEvery) ?? 0,
)
export function setRedealEvery(bars: RedealBars) {
  redealEvery.set(bars)
  write(EVERY_KEY, String(bars))
}

/** Whether the letters went to the bend keys last time, so a reload keeps
    them there; `?bend` on the url says the same for a link. */
export const lettersWantBends = (search: string) =>
  new URLSearchParams(search).has('bend') || read(LETTERS_KEY) === '1'
export const rememberLetters = (bends: boolean) =>
  write(LETTERS_KEY, bends ? '1' : '0')

/** The hand dealt, empty until the row first asks for one. */
export const bendDeal = createStore<BendKey[]>([])

export const redealBendKeys = (c: Controls, rand: () => number = Math.random) =>
  bendDeal.set(dealBendKeys(c, rand, bendHeat.get()))

/** Let go of every bend key a hand, a pad or the kit's row is holding. */
export function letGoAllBends() {
  for (const name of engine.held.get().keys())
    if (name.startsWith('bend:')) {
      cancelRamp(name)
      engine.letGoThrow(name)
    }
}

/** A fresh hand for the board as it stands, with nothing from the old one
    still held. */
export function redealAll() {
  letGoAllBends()
  redealBendKeys(engine.controls.get())
}

/** Steps of the kit's bar that fire a bend key: step n fires key n, held for
    the step. Not a control — the deal it points at is this session's. */
export const bendRow = createStore(0)
export const bendRowLit = (step: number) =>
  (bendRow.get() & stepBit(step)) !== 0
export const toggleBendStep = (step: number) =>
  bendRow.set(bendRow.get() ^ stepBit(step))

// A push eased over `seconds` rather than dropped on the board: every control
// in it walks its own travel from where the board stands to where the key
// wants it, a frame at a time, and a choice control jumps at the start on the
// way in and at the end on the way out. One ramp per throw name; a new one
// takes over from wherever the old one had got to.
const ramps = new Map<string, number>()

const patchKeys = (patch: Partial<Controls>) =>
  CONTROL_KEYS.filter(key => key in patch)

function eased(
  key: ControlKey,
  from: number,
  to: number,
  t: number,
  arriving: boolean,
): number {
  const def = sliderFor(key)
  if (def.choices) return (arriving ? t > 0 : t >= 1) ? to : from
  const pos = toPos(def, from) + (toPos(def, to) - toPos(def, from)) * t
  return snapToStep(def, fromPos(def, pos))
}

function ramp(
  name: string,
  from: Partial<Controls>,
  to: Partial<Controls>,
  seconds: number,
  arriving: boolean,
  done?: () => void,
) {
  const start = performance.now()
  const keys = patchKeys(to)
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / (seconds * 1000))
    const patch: Partial<Controls> = {}
    for (const key of keys)
      patch[key] = eased(key, from[key] ?? to[key]!, to[key]!, t, arriving)
    engine.holdThrow(name, patch)
    if (t < 1) ramps.set(name, requestAnimationFrame(step))
    else {
      ramps.delete(name)
      done?.()
    }
  }
  cancelRamp(name)
  step(start)
}

function cancelRamp(name: string) {
  const id = ramps.get(name)
  if (id !== undefined) cancelAnimationFrame(id)
  ramps.delete(name)
}

/** Hold a key's push under `name`: at once, or swelling in over `seconds`. */
export function holdBend(name: string, k: BendKey, seconds: number) {
  const live = engine.controls.get()
  const to = k.push(live)
  if (seconds <= 0) {
    cancelRamp(name)
    engine.holdThrow(name, to)
    return
  }
  const from = { ...engine.held.get().get(name) }
  for (const key of patchKeys(to)) from[key] ??= live[key]
  ramp(name, from, to, seconds, true)
}

/** Let go of a hold: at once, or falling back to the board over `seconds`. */
export function letGoBend(name: string, seconds: number) {
  const held = engine.held.get().get(name)
  if (held === undefined) return
  if (seconds <= 0) {
    cancelRamp(name)
    engine.letGoThrow(name)
    return
  }
  const live = engine.controls.get()
  const to: Partial<Controls> = {}
  for (const key of patchKeys(held)) to[key] = live[key]
  ramp(name, held, to, seconds, false, () => engine.letGoThrow(name))
}

/** The kit's bar clock running the bend row and the redeal counter. Returns
    the way to stop listening. */
export function runBendClock(): () => void {
  let lastTick = engine.meter.get().tick
  let holding: string | null = null
  let bars = 0
  const letGo = () => {
    if (holding !== null) engine.letGoThrow(holding)
    holding = null
  }
  const unsubscribe = engine.meter.subscribe(() => {
    const tick = engine.meter.get().tick
    if (tick === lastTick) return
    lastTick = tick
    const step = tick % STEPS
    letGo()
    if (step === 0 && redealEvery.get() > 0) {
      bars += 1
      if (bars >= redealEvery.get()) {
        bars = 0
        redealAll()
      }
    }
    const k = bendDeal.get()[step]
    if (k !== undefined && bendRowLit(step) && engine.drumsPlaying.get()) {
      holding = bendStepName(k.letter)
      engine.holdThrow(holding, k.push(engine.controls.get()))
    }
  })
  const stopped = engine.drumsPlaying.subscribe(() => {
    if (!engine.drumsPlaying.get()) letGo()
  })
  return () => {
    unsubscribe()
    stopped()
    letGo()
  }
}
