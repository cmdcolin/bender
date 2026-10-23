import { CONTROL_KEYS, type ControlKey, type Controls } from '../controls.ts'
import { STEPS, stepBit } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import { createStore } from '../listeners.ts'
import { dealBendKeys, isHeat, type BendKey, type Heat } from './bendDeal.ts'
import {
  attackFrom,
  bendEnvelope,
  heldLevel,
  isBendEnvelope,
  releasedLevel,
  settles,
  type BendEnvelopeName,
  type Envelope,
} from './bendEnvelope.ts'
import { sliderFor, snapToStep } from './controls/index.ts'
import { LETTERS } from './keyboard.ts'
import { read, write } from './persist.ts'
import { fromPos, toPos } from './slider-scale.ts'

export const bendName = (letter: string) => `bend:${letter}`
export const isBendName = (name: string) =>
  LETTERS.some(l => bendName(l) === name)
/** The same key held by the kit's bend row rather than by a hand, so the two
    let go of each other's hold without a fight. */
export const bendStepName = (letter: string) => `bend:${letter}:step`

const HEAT_KEY = 'bender.bend.heat'
const SWELL_KEY = 'bender.bend.swell'
const ENVELOPE_KEY = 'bender.bend.envelope'
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

const storedEnvelope = read(ENVELOPE_KEY)
/** How a key moves into its push and back out. */
export const bendShape = createStore<BendEnvelopeName>(
  isBendEnvelope(storedEnvelope)
    ? storedEnvelope
    : read(SWELL_KEY) === '1'
      ? 'swell'
      : 'snap',
)
export function setBendShape(name: BendEnvelopeName) {
  bendShape.set(name)
  write(ENVELOPE_KEY, name)
}

/** The envelope a key moves by now, at the kit's tempo. */
export const bendEnvelopeNow = (morphSeconds: number) =>
  bendEnvelope(
    bendShape.get(),
    60 / engine.controls.get().drumBpm,
    morphSeconds,
  )

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

/** A new row at random, about a third of the steps lit and never none. */
export function shuffleBendRow(rand: () => number = Math.random) {
  const lit = Array.from({ length: STEPS }, (_, s) => s).filter(
    () => rand() < 1 / 3,
  )
  if (lit.length === 0) lit.push(Math.floor(rand() * STEPS))
  bendRow.set(lit.reduce((mask, s) => mask | stepBit(s), 0))
}

// One loop a held name, a frame at a time: every control in the push walks its
// own travel from where the board stands to where the key wants it, as far as
// the envelope says, and a choice control flips while the envelope is above
// zero. A new loop takes over from the level the old one had reached.
interface Hold {
  frame: number
  level: number
  to: Partial<Controls>
}
const holds = new Map<string, Hold>()

const patchKeys = (patch: Partial<Controls>) =>
  CONTROL_KEYS.filter(key => key in patch)

function eased(key: ControlKey, from: number, to: number, v: number): number {
  const def = sliderFor(key)
  if (def.choices) return v > 0 ? to : from
  const pos = toPos(def, from) + (toPos(def, to) - toPos(def, from)) * v
  return snapToStep(def, fromPos(def, pos))
}

function run(
  name: string,
  to: Partial<Controls>,
  level: (t: number) => number | null,
  settle: number,
  done?: () => void,
) {
  cancelRamp(name)
  const start = performance.now()
  const keys = patchKeys(to)
  const hold: Hold = { frame: -1, level: 0, to }
  holds.set(name, hold)
  const step = (now: number) => {
    const t = (now - start) / 1000
    const v = level(t)
    if (v === null) {
      holds.delete(name)
      done?.()
      return
    }
    const live = engine.controls.get()
    const patch: Partial<Controls> = {}
    for (const key of keys) patch[key] = eased(key, live[key], to[key]!, v)
    engine.holdThrow(name, patch)
    hold.level = v
    hold.frame = t < settle ? requestAnimationFrame(step) : -1
  }
  step(start)
}

function cancelRamp(name: string) {
  const hold = holds.get(name)
  if (hold && hold.frame >= 0) cancelAnimationFrame(hold.frame)
  holds.delete(name)
}

/** Hold a key's push under `name`, moving in as the envelope says. */
export function holdBend(name: string, k: BendKey, env: Envelope) {
  const to = k.push(engine.controls.get())
  const from = attackFrom(env, holds.get(name)?.level ?? 0)
  run(name, to, t => heldLevel(env, from + t), settles(env) - from)
}

/** Let go of a hold, falling back to the board over the release. */
export function letGoBend(name: string, env: Envelope) {
  const held = engine.held.get().get(name)
  if (held === undefined) return
  const hold = holds.get(name)
  const level = hold?.level ?? 1
  if (env.release <= 0 || level <= 0) {
    cancelRamp(name)
    engine.letGoThrow(name)
    return
  }
  run(
    name,
    hold?.to ?? held,
    t => releasedLevel(env, level, t),
    Infinity,
    () => engine.letGoThrow(name),
  )
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
