import {
  BLEND_LINEAR,
  BLEND_LOG,
  BLEND_STEP,
  hash01,
  type WildPack,
} from '../dsp/arc.ts'
import { PARAM_DEFS } from '../engine/params.ts'
import { ALL_SLIDERS, OWNER_BY_KEY, snapToStep } from './controls/index.ts'
import { CLOCK_KEYS, PART_KEYS, YOURS } from './presets/yours.ts'
import { fromPos, toPos } from './slider-scale.ts'

import type { ControlKey, Controls } from '../controls.ts'
import type { SliderDef } from './controls/types.ts'

const MOVES = 0.45
const SWITCHES = 0.2
const LATEST_START = 0.6
const FAR = 0.25
const WANDER = 0.85
const WANDER_START = 0.2

const PARAM_AT = new Map<string, number>(PARAM_DEFS.map(([n], i) => [n, i]))
const PARAM_NAMES = PARAM_DEFS.map(([n]) => n)

const BOARD_WIDE = ['Power supply', 'Wear', 'Brownout']
const HELD_GROUPS = new Set([
  'Signal order',
  'Patch bay',
  'Trigger patch',
  'Body contact',
  'Mix bus',
  'Output',
  'Mic',
])

const keyHash = (key: string) => {
  let h = 0
  for (let i = 0; i < key.length; i++)
    h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return h
}

const streamFor = (key: string, seed: number) => {
  let n = 0
  const base = keyHash(key)
  return () => hash01(n++, base ^ Math.imul(seed + 1, 0x2545f491))
}

const wildable = (def: SliderDef, calm: Controls, shown: Set<string>) => {
  const owner = OWNER_BY_KEY.get(def.key)
  return (
    owner !== undefined &&
    !HELD_GROUPS.has(owner) &&
    (shown.has(owner) || BOARD_WIDE.includes(owner)) &&
    def.role !== 'level' &&
    !YOURS.has(def.key) &&
    !CLOCK_KEYS.has(def.key) &&
    !PART_KEYS.has(def.key) &&
    def.key !== 'drumWander' &&
    PARAM_AT.has(def.key) &&
    (!def.needs || def.needs(calm))
  )
}

function wildValue(def: SliderDef, calm: number, rand: () => number) {
  if (def.choices) {
    if (rand() >= SWITCHES) return calm
    return def.min + Math.floor(rand() * def.choices.length) * def.step
  }
  if (rand() >= MOVES) return calm
  const pos = toPos(def, calm)
  let to = rand() < 0.5 ? 0.05 + rand() * 0.25 : 0.7 + rand() * 0.22
  if (Math.abs(to - pos) < FAR) to = 1 - to
  return snapToStep(def, fromPos(def, to))
}

const blendFor = (def: SliderDef) =>
  def.choices
    ? BLEND_STEP
    : def.curve === 'log' && def.min > 0
      ? BLEND_LOG
      : BLEND_LINEAR

/** The board pushed out: about half the knobs on the stages you can hear
    driven toward an end, a fifth of the switches flipped, the kit's Wander
    up. Each control rolls off its own stream, so moving one knob on the board
    leaves every other control's wild end where it was. */
export function wildBoard(
  calm: Controls,
  seed: number,
  shown: Set<string>,
): WildPack {
  const moves: { key: ControlKey; to: number; start: number; blend: number }[] =
    []

  for (const def of ALL_SLIDERS) {
    if (!wildable(def, calm, shown)) continue
    const rand = streamFor(def.key, seed)
    const to = wildValue(def, calm[def.key], rand)
    if (to === calm[def.key]) continue
    moves.push({
      key: def.key,
      to,
      start: rand() * LATEST_START,
      blend: blendFor(def),
    })
  }
  if (shown.has('Clatter') && calm.drumWander < WANDER)
    moves.push({
      key: 'drumWander',
      to: WANDER,
      start: WANDER_START,
      blend: BLEND_LINEAR,
    })
  return {
    idx: Int16Array.from(moves, m => PARAM_AT.get(m.key) ?? 0),
    to: Float32Array.from(moves, m => m.to),
    start: Float32Array.from(moves, m => m.start),
    blend: Uint8Array.from(moves, m => m.blend),
  }
}

/** The wild board's controls as a board, for reading what the arc reaches. */
export function wildControls(calm: Controls, wild: WildPack): Controls {
  const out = { ...calm }
  for (let k = 0; k < wild.idx.length; k++)
    out[PARAM_NAMES[wild.idx[k]!]!] = wild.to[k]!
  return out
}
