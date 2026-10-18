import type { ControlKey } from '../controls.ts'

// Parts of the operator close-up that open one knob rather than a whole operator.
export const VOICE_PICKS: { id: string; keys: readonly ControlKey[] }[] = [
  { id: 'brightness', keys: ['fmBright'] },
  { id: 'feedback', keys: ['fmFeedback'] },
  { id: 'lfo', keys: ['fmLfo'] },
]

export const VOICE_IDS = ['modulator', 'carrier', ...VOICE_PICKS.map(p => p.id)]
