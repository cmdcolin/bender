import { PEDALS, pedalOrderAt } from '../pedals.ts'
import { BEND_SLOT_KEYS, bendAt } from './controls/index.ts'

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
