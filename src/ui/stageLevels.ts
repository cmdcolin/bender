import type { ControlKey } from '../controls.ts'

const LEVEL_OF: Record<string, ControlKey> = {
  'Toy keyboard': 'chipLevel',
  'Toy drums': 'drumLevel',
  'FM chip': 'fmLevel',
  'Home keyboard': 'pcmLevel',
  'Mono synth': 'monoLevel',
  'Tape loop': 'sampleLevel',
  'Four-track': 'fourLevel',
}

const MUTE_OF: Record<string, ControlKey> = {
  'Toy keyboard': 'chipMute',
  'Toy drums': 'drumMute',
  'FM chip': 'fmMute',
  'Home keyboard': 'pcmMute',
  'Mono synth': 'monoMute',
  Stompbox: 'stompMute',
  'Tape delay': 'dlyMute',
  'Delay pedal': 'echoMute',
  'Spring verb': 'revMute',
  Ensemble: 'ensMute',
  'Tube amp': 'ampMute',
}

export const levelOf = (stage: string): ControlKey | undefined =>
  LEVEL_OF[stage]

export const muteOf = (stage: string): ControlKey | undefined => MUTE_OF[stage]
