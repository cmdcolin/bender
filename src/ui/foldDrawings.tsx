import { BusDiagram } from './BusDiagram.tsx'
import { BUS_SPECS } from './busSpecs.ts'
import { ToyDieDiagram } from './ToyDieDiagram.tsx'

import type { ComponentType } from 'react'

const DRAWINGS: Record<string, ComponentType> = {
  'Toy keyboard|inside the die': ToyDieDiagram,
}

/** The drawing for one fold of a group, if it has one. */
export function FoldDrawing({ group, part }: { group: string; part: string }) {
  const key = `${group}|${part}`
  const Drawing = DRAWINGS[key]
  if (Drawing) return <Drawing />
  const spec = BUS_SPECS[key]
  return spec ? <BusDiagram spec={spec} /> : null
}
