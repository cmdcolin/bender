import { BusDiagram } from './BusDiagram.tsx'
import { BUS_SPECS } from './busSpecs.ts'
import { KitWiringDiagram } from './KitWiringDiagram.tsx'
import { ToyDieDiagram } from './ToyDieDiagram.tsx'

import type { ComponentType } from 'react'

const DRAWINGS: Record<string, ComponentType> = {
  'Toy drums|triggers and cross-patch': KitWiringDiagram,
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
