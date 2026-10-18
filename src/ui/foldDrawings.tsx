import { BusDiagram } from './BusDiagram.tsx'
import { BUS_SPECS } from './busSpecs.ts'
import { FmDieDiagram } from './FmDieDiagram.tsx'
import { KitWiringDiagram } from './KitWiringDiagram.tsx'
import { MonoCardDiagram } from './MonoCardDiagram.tsx'
import { ToyDieDiagram } from './ToyDieDiagram.tsx'
import { ToyDrumDiagram } from './ToyDrumDiagram.tsx'

import type { Verbs } from './foldHosting.ts'
import type { ComponentType } from 'react'

const DRAWINGS: Record<string, ComponentType<{ verbs?: Verbs }>> = {
  'Toy drums|triggers and cross-patch': KitWiringDiagram,
  'Toy keyboard|inside the die': ToyDieDiagram,
  'Toy drums|inside the voices': ToyDrumDiagram,
  'FM chip|die and driver': FmDieDiagram,
  'Mono synth|voice card faults': MonoCardDiagram,
}

/** The drawing for one fold of a group, if it has one. */
export function FoldDrawing({
  group,
  part,
  verbs,
}: {
  group: string
  part: string
  verbs?: Verbs
}) {
  const key = `${group}|${part}`
  const Drawing = DRAWINGS[key]
  if (Drawing) return <Drawing verbs={verbs} />
  const spec = BUS_SPECS[key]
  return spec ? <BusDiagram spec={spec} /> : null
}
