import type { ControlKey } from '../controls.ts'

const LEVEL_OF: Record<string, ControlKey> = {
  Plinky: 'chipLevel',
  Clatter: 'drumLevel',
  Glint: 'fmLevel',
  Parlor: 'pcmLevel',
  Growler: 'monoLevel',
  Spool: 'sampleLevel',
  Layercake: 'fourLevel',
}

const MUTE_OF: Record<string, ControlKey> = {
  Plinky: 'chipMute',
  Clatter: 'drumMute',
  Glint: 'fmMute',
  Parlor: 'pcmMute',
  Growler: 'monoMute',
  Gnash: 'stompMute',
  Wraith: 'dlyMute',
  Ricochet: 'echoMute',
  Boing: 'revMute',
  Chorale: 'ensMute',
  Ember: 'ampMute',
}

export const levelOf = (stage: string): ControlKey | undefined =>
  LEVEL_OF[stage]

export const muteOf = (stage: string): ControlKey | undefined => MUTE_OF[stage]

const MUTES = new Set(Object.values(MUTE_OF))

export const isMute = (key: ControlKey) => MUTES.has(key)
