import { MACHINES } from '../machines.ts'
import { PEDALS } from '../pedals.ts'
import { BENDS } from './controls/bends.ts'

import type { ControlKey } from '../controls.ts'

const LEVEL_OF: Record<string, ControlKey> = Object.fromEntries(
  MACHINES.map(m => [m.name, m.levels[0]] as const),
)

const BYPASS_OF: Record<string, ControlKey> = Object.fromEntries([
  ...PEDALS.map((p): [string, ControlKey] => [p.group, p.mute]),
  ...BENDS.map((b): [string, ControlKey] => [b.group, b.mute]),
])

const MUTE_OF: Record<string, ControlKey> = {
  ...Object.fromEntries(
    MACHINES.flatMap(m => ('mute' in m ? [[m.name, m.mute] as const] : [])),
  ),
  ...BYPASS_OF,
}

export const bypassOf = (stage: string): ControlKey | undefined =>
  BYPASS_OF[stage]

export const levelOf = (stage: string): ControlKey | undefined =>
  LEVEL_OF[stage]

export const muteOf = (stage: string): ControlKey | undefined => MUTE_OF[stage]

const MUTES = new Set(Object.values(MUTE_OF))

export const isMute = (key: ControlKey) => MUTES.has(key)
