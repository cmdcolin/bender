import type { ControlKey } from '../../controls'

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
