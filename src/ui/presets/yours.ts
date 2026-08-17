import type { ControlKey, Controls } from '../../controls'
import { HOLD_KEYS } from '../controls'
import { GRID_ROWS } from '../drums'

// What a morph holds is yours during the trip; this is what is yours over the
// whole gesture. On top of the levels and contacts you have your hands on, what
// is playing is yours too — the demo song you picked and the pattern you wrote.
// Neither random nor mutate moves any of them, and a preset moves one only if
// it names it.
//
// The demo song is the one nothing may name: a preset is a statement about the
// circuit, so swapping the tune under it changes the one thing you were using to
// judge the change. Several used to, and auditioning a row of them meant losing
// the song you were listening to as well as the board. A test holds the line.
export const YOURS = new Set<ControlKey>([
  ...HOLD_KEYS,
  'sampleLevel',
  'chipTune',
  ...GRID_ROWS.map(r => r.key),
])

export const keepYours = (
  next: Controls,
  current: Controls,
  named: Partial<Controls> = {},
) => {
  for (const k of YOURS) if (!(k in named)) next[k] = current[k]
  return next
}

// The tempo is the one number a nudge must not touch. Move it and every echo,
// roll and sweep that was landing with the pattern lands somewhere else instead
// — the board comes back a different circuit *and* out of time, and you can no
// longer tell which of the two you are hearing.
export const CLOCK_KEYS = new Set<ControlKey>(['drumBpm'])
