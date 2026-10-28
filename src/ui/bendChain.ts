import { engine } from '../engine/engine.ts'
import { BEND_SLOT_KEYS, BENDS, bendAt } from './controls/index.ts'

import type { Controls } from '../controls.ts'

const ADDED_MIX = 0.5

const lastMix = new Map<string, number>()

export const isBend = (stage: string) => BENDS.some(b => b.group === stage)

const idOf = (stage: string) => BENDS.findIndex(b => b.group === stage) + 1

const mixOf = (stage: string) => BENDS[idOf(stage) - 1]!.mix

/** The first chain position holding the bend, counting from 1; 0 when no
    position holds it. */
export const positionOf = (c: Controls, stage: string) =>
  BEND_SLOT_KEYS.findIndex(k => Math.round(c[k]) === idOf(stage)) + 1

/** The step of the walk where the signal first meets the bend, counting from
    1; 0 when no position holds it. The walk is the chain's running order, which
    differs from the positions while Re-solder is moving them. */
export const stepOf = (c: Controls, walk: readonly number[], stage: string) =>
  walk.findIndex(slot => Math.round(c[BEND_SLOT_KEYS[slot]!]) === idOf(stage)) +
  1

/** Whether the bend sits in the chain with its mix up, so the signal reaches it
    and some of it comes out. */
export const sounds = (c: Controls, stage: string) =>
  positionOf(c, stage) > 0 && c[mixOf(stage)] > 0

const silent = (c: Controls, slot: number) => {
  const bend = bendAt(c[BEND_SLOT_KEYS[slot]!])
  return !bend || c[bend.mix] === 0
}

/** The first empty position, else the last one holding a silent bend, else the
    last position. */
const freeSlot = (c: Controls) => {
  const empty = BEND_SLOT_KEYS.findIndex(k => Math.round(c[k]) === 0)
  if (empty !== -1) return empty
  const quiet = BEND_SLOT_KEYS.findLastIndex((_, i) => silent(c, i))
  return quiet === -1 ? BEND_SLOT_KEYS.length - 1 : quiet
}

/** Puts the bend in a free position (see freeSlot) and brings its mix back to
    where it last sounded. A bend already in the chain keeps its position. */
export function switchOn(stage: string) {
  const board = engine.controls.get()
  const mix = mixOf(stage)
  const next = { ...board }
  if (positionOf(board, stage) === 0)
    next[BEND_SLOT_KEYS[freeSlot(board)]!] = idOf(stage)
  if (board[mix] === 0) next[mix] = lastMix.get(stage) ?? ADDED_MIX
  if (
    BEND_SLOT_KEYS.every(k => next[k] === board[k]) &&
    next[mix] === board[mix]
  )
    return
  engine.armStep()
  engine.writeBoard(next)
}

/** Drops the bend's mix to nothing and remembers it for the next switchOn. */
export function switchOff(stage: string) {
  const mix = mixOf(stage)
  lastMix.set(stage, engine.controls.get()[mix])
  engine.armStep()
  engine.set(mix, 0)
}
