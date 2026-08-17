import type { ControlKey, Controls } from '../../controls'

export interface SliderDef {
  key: ControlKey
  label: string
  min: number
  max: number
  step: number
  unit: string
  help: string
  choices?: string[]
  curve?: 'log'
  /** A value the control has a reason to jump to that isn't a place on its own
      travel — it is worked out from the rest of the board. One press, drawn
      beside the readout. */
  action?: {
    label: string
    title: string
    value: (c: Controls, def: SliderDef) => number
  }
}

export const STAGE_ORDER = [
  'Sources',
  'Bends',
  'Pedals',
  'Patch',
  'Feedback',
  'Tape',
  'Master',
] as const
export type StagePlace = (typeof STAGE_ORDER)[number]

export interface Group {
  name: string
  place: StagePlace
  sliders: SliderDef[]
  /** Controls a widget of the group's own turns, because a row of sliders is
      the wrong shape for them. */
  editor?: { kind: 'drums'; keys: ControlKey[] }
}
