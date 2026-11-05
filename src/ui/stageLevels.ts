import { PEDALS } from '../pedals.ts'
import { BENDS } from './controls/bends.ts'

import type { ControlKey } from '../controls.ts'

const LEVEL_OF: Record<string, ControlKey> = {
  Plinky: 'chipLevel',
  Clatter: 'drumLevel',
  Glint: 'fmLevel',
  Parlor: 'pcmLevel',
  Growler: 'monoLevel',
  Spool: 'sampleLevel',
  Layercake: 'fourLevel',
  Sheet: 'sheetLevel',
}

const BYPASS_OF: Record<string, ControlKey> = Object.fromEntries([
  ...PEDALS.map(p => [p.group, p.mute]),
  ...BENDS.map(b => [b.group, b.mute]),
])

const MUTE_OF: Record<string, ControlKey> = {
  Plinky: 'chipMute',
  Clatter: 'drumMute',
  Glint: 'fmMute',
  Parlor: 'pcmMute',
  Growler: 'monoMute',
  ...BYPASS_OF,
}

export const bypassOf = (stage: string): ControlKey | undefined =>
  BYPASS_OF[stage]

export const levelOf = (stage: string): ControlKey | undefined =>
  LEVEL_OF[stage]

export const muteOf = (stage: string): ControlKey | undefined => MUTE_OF[stage]

const MUTES = new Set(Object.values(MUTE_OF))

export const isMute = (key: ControlKey) => MUTES.has(key)
