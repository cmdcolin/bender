import type { ControlKey } from '../controls.ts'

const LEVEL_OF: Record<string, ControlKey> = {
  'Toy keyboard': 'chipLevel',
  'Toy drums': 'drumLevel',
  'FM chip': 'fmLevel',
  'Home keyboard': 'pcmLevel',
  'Mono synth': 'monoLevel',
}

export const levelOf = (stage: string): ControlKey | undefined =>
  LEVEL_OF[stage]
