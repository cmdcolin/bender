import { engine } from '../engine/engine.ts'
import { BEND_SLOT_KEYS, BENDS, bendAt } from './controls/index.ts'
import { bendRuns, patchedInto } from './controls/jacks.ts'

import type { Controls } from '../controls.ts'

const ADDED_MIX = 0.5

export const isBend = (stage: string) => BENDS.some(b => b.group === stage)

const idOf = (stage: string) => BENDS.findIndex(b => b.group === stage) + 1

const bendNamed = (stage: string) => BENDS[idOf(stage) - 1]!

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

export const bypassed = (c: Controls, stage: string) =>
  c[bendNamed(stage).mute] > 0.5

/** The machine the bend is patched onto, or undefined on the master run. */
export const patchedOn = (c: Controls, stage: string) =>
  patchedInto(c[bendNamed(stage).into])

export const sounds = (c: Controls, stage: string) =>
  bendRuns(c, stage) && c[bendNamed(stage).mix] > 0 && !bypassed(c, stage)

const silent = (c: Controls, slot: number) => {
  const bend = bendAt(c[BEND_SLOT_KEYS[slot]!])
  return !bend || c[bend.mix] === 0 || c[bend.mute] > 0.5
}

/** The first empty position, else the last one holding a silent bend, else the
    last position. */
const freeSlot = (c: Controls) => {
  const empty = BEND_SLOT_KEYS.findIndex(k => Math.round(c[k]) === 0)
  if (empty !== -1) return empty
  const quiet = BEND_SLOT_KEYS.findLastIndex((_, i) => silent(c, i))
  return quiet === -1 ? BEND_SLOT_KEYS.length - 1 : quiet
}

export function switchOn(stage: string) {
  const board = engine.controls.get()
  const { mix, mute } = bendNamed(stage)
  const next = { ...board, [mute]: 0 }
  if (!bendRuns(board, stage))
    next[BEND_SLOT_KEYS[freeSlot(board)]!] = idOf(stage)
  if (board[mix] === 0) next[mix] = ADDED_MIX
  if (
    !BEND_SLOT_KEYS.every(k => next[k] === board[k]) ||
    next[mix] !== board[mix] ||
    next[mute] !== board[mute]
  ) {
    engine.armStep()
    engine.writeBoard(next)
  }
}

export function switchOff(stage: string) {
  engine.armStep()
  engine.set(bendNamed(stage).mute, 1)
}
