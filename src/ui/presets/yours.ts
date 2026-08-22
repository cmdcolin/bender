import type { ControlKey, Controls } from '../../controls'
import { HOLD_KEYS } from '../controls'
import { GRID_ROWS } from '../../drums'
import { TUNE_STEP_KEYS } from '../../tune'

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
//
// The melody memory goes with it, steps and all, and so does the rate it plays
// back at: a tune you sat down and played in is the last thing on the board a
// roll of the dice gets to rewrite.
export const YOURS = new Set<ControlKey>([
  ...HOLD_KEYS,
  'sampleLevel',
  'chipTune',
  ...GRID_ROWS.flatMap(r => [r.key, r.len]),
  ...TUNE_STEP_KEYS,
  'tuneLen',
  'tuneRate',
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

// The Parts rack, which the dice leave alone.
//
// Every other control on the board is a thing you are doing to a toy. These are
// what the toy is, and a roll that re-parts it is not rolling a different board
// so much as rolling a different model of how a board works — the watchdog three
// hundred millivolts up is a toy that reboots before any sag can start, and the
// mixer at the bottom of its travel is one you cannot hear. The dice would reach
// those as often as anything else and there would be no way to tell a dud roll
// from a dud board.
//
// So the blind dice skip the rack: the skip happens before the roll draws
// anything, so a board rolled with the rack wound anywhere comes back the same
// board it would have. Pointing at the rack and asking for a roll still rolls
// it — that is a hand, and a hand can tell a dud roll from a dud board.
export const PART_KEYS = new Set<ControlKey>([
  'chipLeadR',
  'chipDecouple',
  'chipWatchdog',
  'chipLatchHold',
  'chipClipBite',
  'chipClipHold',
  'chipClipCharge',
  'chipClipRelease',
  'chipDragOct',
  'chipSpread',
  'chipMixDrive',
  'drumLadderTol',
])
