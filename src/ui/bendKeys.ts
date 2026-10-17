import { CONTROL_KEYS, type ControlKey, type Controls } from '../controls.ts'
import { STEPS, stepBit } from '../drums.ts'
import { engine } from '../engine/engine.ts'
import { createStore } from '../listeners.ts'
import { dealBendKeys, isHeat, type BendKey, type Heat } from './bendDeal.ts'
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
