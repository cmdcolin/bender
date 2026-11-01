import { isPedal, PEDALS, pedalOrderAt, pedalOrderOf } from '../pedals.ts'
import { BEND_SLOT_KEYS, BENDS, bendAt } from './controls/index.ts'
import { move } from './reorder.ts'

import type { Controls } from '../controls.ts'

export const FROM_BUS = 'the mix bus'
export const TO_OUTPUT = 'the output'

export function effectChain(c: Controls) {
  const bends = BEND_SLOT_KEYS.flatMap(k => {
    const bend = bendAt(c[k])
    return bend ? [bend.group] : []
  })
  return [
    ...new Set(bends),
    ...pedalOrderAt(c.pedalOrder).map(i => PEDALS[i]!.group),
  ]
}

export interface Cord {
  from: string
  to: string
  through: string[]
}

export function cordsFor(chain: readonly string[], shown: readonly string[]) {
  const on = new Set(shown)
  const cords: Cord[] = []
  let from = FROM_BUS
  let through: string[] = []
  for (const stage of [...chain, TO_OUTPUT]) {
    if (on.has(stage) || stage === TO_OUTPUT) {
      cords.push({ from, to: stage, through })
      from = stage
      through = []
    } else through.push(stage)
  }
  return cords
}

const passing = (through: readonly string[]) =>
  through.length > 0 ? `, through ${through.join(', ')}` : ''

export const inSays = (x: Cord) => `In from ${x.from}${passing(x.through)}.`

export const outSays = (x: Cord) => `Out to ${x.to}${passing(x.through)}.`

export interface Landing {
  stage: string
  side: 'in' | 'out'
}

const sameRun = (a: string, b: string) => isPedal(a) === isPedal(b)

export function landingOf(attr: string | undefined): Landing | null {
  const [side, stage] = (attr ?? '').split(/:(.*)/s)
  return (side === 'in' || side === 'out') && stage ? { side, stage } : null
}

function moveNextTo<T>(
  items: readonly T[],
  from: number,
  at: number,
  side: Landing['side'],
) {
  const shifted = from < at ? at - 1 : at
  return move(items, from, side === 'in' ? shifted : shifted + 1)
}

const pedalIndex = (stage: string) => PEDALS.findIndex(p => p.group === stage)
const bendId = (stage: string) => BENDS.findIndex(b => b.group === stage) + 1

function pedalLanding(c: Controls, stage: string, onto: Landing) {
  const order = pedalOrderAt(c.pedalOrder)
  const at = pedalOrderOf(
    moveNextTo(
      order,
      order.indexOf(pedalIndex(stage)),
      order.indexOf(pedalIndex(onto.stage)),
      onto.side,
    ),
  )
  return at === Math.round(c.pedalOrder) ? null : { ...c, pedalOrder: at }
}

function bendLanding(c: Controls, stage: string, onto: Landing) {
  const slots = BEND_SLOT_KEYS.map(k => Math.round(c[k]))
  const from = slots.indexOf(bendId(stage))
  const at = slots.indexOf(bendId(onto.stage))
  const next =
    from >= 0 && at >= 0 ? moveNextTo(slots, from, at, onto.side) : slots
  return next.every((v, i) => v === slots[i])
    ? null
    : {
        ...c,
        ...Object.fromEntries(BEND_SLOT_KEYS.map((k, i) => [k, next[i]!])),
      }
}

export const canLand = (stage: string, onto: string) =>
  stage !== onto && sameRun(stage, onto)

export const landed = (c: Controls, stage: string, onto: Landing) =>
  !canLand(stage, onto.stage)
    ? null
    : isPedal(stage)
      ? pedalLanding(c, stage, onto)
      : bendLanding(c, stage, onto)
