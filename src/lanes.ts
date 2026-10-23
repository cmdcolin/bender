import type { ControlKey } from './controls.ts'

// Two rows of sixteen values the patch bay reads as sources, one step per step
// of the kit's counter: a parameter lock on anything a wire reaches.
export const LANE_STEPS = 16
export const LANE_MAX = 12

export const LANE_KEYS = [
  [
    'modLaneA0',
    'modLaneA1',
    'modLaneA2',
    'modLaneA3',
    'modLaneA4',
    'modLaneA5',
    'modLaneA6',
    'modLaneA7',
    'modLaneA8',
    'modLaneA9',
    'modLaneA10',
    'modLaneA11',
    'modLaneA12',
    'modLaneA13',
    'modLaneA14',
    'modLaneA15',
  ],
  [
    'modLaneB0',
    'modLaneB1',
    'modLaneB2',
    'modLaneB3',
    'modLaneB4',
    'modLaneB5',
    'modLaneB6',
    'modLaneB7',
    'modLaneB8',
    'modLaneB9',
    'modLaneB10',
    'modLaneB11',
    'modLaneB12',
    'modLaneB13',
    'modLaneB14',
    'modLaneB15',
  ],
] as const satisfies readonly (readonly ControlKey[])[]

export const LANE_LEN_KEYS = [
  'modLaneALen',
  'modLaneBLen',
] as const satisfies readonly ControlKey[]

export const LANE_VALUE_KEYS = new Set<ControlKey>(LANE_KEYS.flat())

export const asLaneValue = (v: number) =>
  Math.min(Math.max(Math.round(v), -LANE_MAX), LANE_MAX)

export const asLaneLen = (v: number) =>
  Math.min(Math.max(Math.round(v), 1), LANE_STEPS)

export const LANE_LEN_SET = new Set<ControlKey>(LANE_LEN_KEYS)
