import { boxWidth } from './diagram.ts'

export const WIDTH = 420
export const LEAD = 48
export const TAIL = 40
export const GAP = 90
export const OP_W = boxWidth('modulator')
export const SPAN_W = LEAD + 2 * OP_W + GAP + TAIL
export const X0 = Math.round((WIDTH - SPAN_W) / 2)

/** Where the operators sit across the drawing, for the cone that leads to them. */
export const OPERATORS_SPAN = { x: X0, w: SPAN_W }
