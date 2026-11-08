import { isPedal, PEDALS, pedalOrderAt } from '../pedals.ts'
import { BEND_SLOT_KEYS, BENDS, bendAt } from './controls/index.ts'
import { intoOf, linesNamed } from './controls/jacks.ts'

import type { Controls } from '../controls.ts'

export interface Bundle {
  lines: number
  names: string[]
  units: string[]
}

export function rackOrder(c: Controls) {
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

export const linesOfUnit = (c: Controls, stage: string) => {
  const into = intoOf(stage)
  return into ? Math.round(c[into]) : 0
}

function popcount(mask: number) {
  let n = 0
  for (let m = mask; m !== 0; m &= m - 1) n++
  return n
}

export function bundlesOf(c: Controls): Bundle[] {
  const { order } = rackOrder(c)
  const masks = [
    ...new Set(order.map(s => linesOfUnit(c, s)).filter(m => m !== 0)),
  ]
  return masks
    .toSorted((a, b) => popcount(a) - popcount(b))
    .map(lines => ({
      lines,
      names: linesNamed(lines),
      units: order.filter(s => linesOfUnit(c, s) === lines),
    }))
}

export function masterRun(c: Controls) {
  const { slotted, order } = rackOrder(c)
  return order.filter(
    s => linesOfUnit(c, s) === 0 && (isPedal(s) || slotted.includes(s)),
  )
}

export const hears = (bundle: Bundle, inner: Bundle) =>
  inner !== bundle && (inner.lines & ~bundle.lines) === 0
