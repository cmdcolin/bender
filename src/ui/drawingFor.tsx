import { BusDiagram } from './BusDiagram.tsx'
import { BUS_SPECS } from './busSpecs.ts'
import { FmDieDiagram } from './FmDieDiagram.tsx'
import { DRAWN_ROWS, type Verbs, type Zoom } from './foldHosting.ts'
import { KitWiringDiagram } from './KitWiringDiagram.tsx'
import { MonoCardDiagram } from './MonoCardDiagram.tsx'
import { SupplyDiagram } from './SupplyDiagram.tsx'
import { ToyDieDiagram } from './ToyDieDiagram.tsx'
import { ToyDrumDiagram } from './ToyDrumDiagram.tsx'

import type { ComponentType, ReactNode } from 'react'

export interface DrawingProps {
  verbs?: Verbs
  /** The stage's editor, for a drawing that holds the whole stage. */
  editor?: ReactNode
  zoom?: Zoom
}

const DRAWINGS: Record<string, ComponentType<DrawingProps>> = {
  'Toy drums|triggers and cross-patch': KitWiringDiagram,
  'Toy keyboard|inside the die': ToyDieDiagram,
  'Toy drums|inside the voices': ToyDrumDiagram,
  'FM chip|die and driver': FmDieDiagram,
  'Mono synth|voice card faults': MonoCardDiagram,
  'Power supply|the cells': SupplyDiagram,
}

/** The drawing for one fold of a group, or null when it has none. */
export function foldDrawing(
  group: string,
  part: string,
  { verbs, editor }: DrawingProps = {},
): ReactNode {
  const key = `${group}|${part}`
  const Drawing = DRAWINGS[key]
  if (Drawing)
    return <Drawing verbs={verbs} editor={editor} zoom={zoomFor(group)} />
  const spec = BUS_SPECS[key]
  return spec ? <BusDiagram spec={spec} /> : null
}

/** A close-up of another fold of the group, never a drawing of a whole stage. */
export const zoomFor =
  (group: string): Zoom =>
  part =>
    DRAWN_ROWS.has(`${group}|${part}`) ? null : foldDrawing(group, part)
