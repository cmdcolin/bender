import type { ReactNode } from 'react'

/** Shows the verbs of another fold of the same group. */
export type Verbs = (part: string) => ReactNode

/** Stages drawn whole by one fold's drawing, which then holds every row. */
export const STAGE_DRAWINGS: Record<string, string> = {
  'Toy keyboard': 'inside the die',
  'Toy drums': 'inside the voices',
  'Power supply': 'the cells',
}

/** Folds whose drawing opens the rows itself, one box at a time. */
export const DRAWN_ROWS = new Set([
  'Toy keyboard|inside the die',
  'Toy drums|inside the voices',
  'Power supply|the cells',
])

/** Folds the drawing of another fold has taken over, drawn as boxes in it. */
const HOSTED: Record<string, readonly string[]> = {
  'Toy drums|inside the voices': [
    'the converter',
    'Sample ROM',
    'triggers and cross-patch',
    'knife on the bus',
  ],
  'Toy keyboard|inside the die': ['arp and key lock', 'knife on the bus'],
  'Power supply|the cells': ['the reset chip', 'the clip'],
}

export const hostedBy = (group: string, part: string) =>
  HOSTED[`${group}|${part}`] ?? []

export const isHosted = (group: string, part: string) =>
  Object.entries(HOSTED).some(
    ([host, parts]) => host.startsWith(`${group}|`) && parts.includes(part),
  )
