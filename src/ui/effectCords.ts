import { isPedal, PEDALS, pedalOrderAt, pedalOrderOf } from '../pedals.ts'
import { BEND_SLOT_KEYS, BENDS, bendAt } from './controls/index.ts'
import { intoOf, JACK_NAMES, MASTER, patchedInto } from './controls/jacks.ts'
import { move } from './reorder.ts'

import type { Controls } from '../controls.ts'

export const FROM_BUS = 'the mix bus'
export const TO_OUTPUT = 'the output'

export interface Run {
  from: string
  to: string
  chain: string[]
}

function rackOrder(c: Controls) {
  const slotted: string[] = [
    ...new Set(
      BEND_SLOT_KEYS.flatMap(k => {
        const bend = bendAt(c[k])
        return bend ? [bend.group] : []
      }),
    ),
  ]
  return {
    slotted,
    order: [
      ...slotted,
      ...BENDS.map(b => b.group).filter(g => !slotted.includes(g)),
      ...pedalOrderAt(c.pedalOrder).map(i => PEDALS[i]!.group),
    ],
  }
}

const lineOf = (c: Controls, stage: string) => {
  const into = intoOf(stage)
  return into ? patchedInto(c[into]) : undefined
}

export function effectRuns(c: Controls): Run[] {
  const { slotted, order } = rackOrder(c)
  const master = order.filter(
    s => lineOf(c, s) === undefined && (isPedal(s) || slotted.includes(s)),
  )
  const lines = JACK_NAMES.filter(name => name !== MASTER).flatMap(line => {
    const chain = order.filter(s => lineOf(c, s) === line)
    return chain.length > 0 ? [{ from: line, to: FROM_BUS, chain }] : []
  })
  return [{ from: FROM_BUS, to: TO_OUTPUT, chain: master }, ...lines]
}

export const runText = (runs: readonly Run[]) =>
  runs.map(r => [r.from, r.to, ...r.chain].join('|')).join('\n')

export const runsFrom = (text: string): Run[] =>
  text.split('\n').map(row => {
    const [from = '', to = '', ...chain] = row.split('|')
    return { from, to, chain }
  })

export interface Cord {
  from: string
  to: string
  through: string[]
}

export function cordsFor(run: Run, shown: readonly string[]) {
  const on = new Set(shown)
  const cords: Cord[] = []
  let from = run.from
  let through: string[] = []
  for (const stage of [...run.chain, run.to]) {
    if (on.has(stage) || stage === run.to) {
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
