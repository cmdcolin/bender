import type { ReactNode } from 'react'

/** Shows the verbs of another fold of the same group. */
export type Verbs = (part: string) => ReactNode

/** Another fold's drawing, drawn under the box that holds its part, or null. */
export type Zoom = (part: string) => ReactNode

/** Stages drawn whole by one fold's drawing, which then holds every row. */
export const STAGE_DRAWINGS: Record<string, string> = {
  Plinky: 'inside the die',
  Clatter: 'inside the voices',
  'Power supply': 'the cells',
}

/** Folds whose drawing opens the rows itself, one box at a time. */
export const DRAWN_ROWS = new Set(
  Object.entries(STAGE_DRAWINGS).map(([group, part]) => `${group}|${part}`),
)

/** Folds a drawing has taken over, drawn as boxes in it, keyed by the stage
    and the fold or drawing that holds them. */
const HOSTED: Record<string, readonly string[]> = {
  'Growler|voice card': ['melody'],
  'Clatter|inside the voices': [
    'the converter',
    'Sample ROM',
    'triggers and cross-patch',
    'fault on the bus',
  ],
  'Plinky|inside the die': ['arp and key lock', 'fault on the bus'],
  'Power supply|the cells': ['the reset chip', 'the clip', 'second cells'],
  'Clipper|the amp': ['the speaker'],
}

export const hostedBy = (group: string, part: string) =>
  HOSTED[`${group}|${part}`] ?? []

export const isHosted = (group: string, part: string) =>
  Object.entries(HOSTED).some(
    ([host, parts]) => host.startsWith(`${group}|`) && parts.includes(part),
  )
