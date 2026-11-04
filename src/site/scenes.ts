import { DEFAULT_CONTROLS } from '../controls.ts'
import { applyPreset } from '../ui/presets/apply.ts'
import { PRESETS } from '../ui/presets/table.ts'
import { boardHash, sceneHash } from '../ui/share.ts'
import { boardUrl } from './paths.ts'

const SCENES = [
  {
    preset: 'ballroom at the end of time',
    says: 'A piano 78 off archive.org loops one phrase, and the tape wears it down a little more every lap',
  },
  {
    preset: 'numbers station on the sea floor',
    says: 'A shortwave numbers station reads its digits through a codec dropping frames, each word sliding down in pitch',
  },
  {
    preset: 'mission control after everyone left',
    says: 'NASA comms loop and skip around the tape, each echo a fourth lower than the last',
  },
  {
    preset: 'radio play in a flooded basement',
    says: 'An old radio show through a failing cassette, a spring tank and a ground hum',
  },
  {
    preset: 'the choir is one record',
    says: 'One 78 piles up on four tape loops, each copy shifted a little higher, until it is a choir',
  },
]

export const scenes = SCENES.flatMap(({ preset, says }) =>
  PRESETS.filter(p => p.name === preset).map(def => {
    const board = applyPreset(def, DEFAULT_CONTROLS)
    return {
      name: def.name,
      says,
      href: boardUrl(
        def.shelf ? sceneHash(board, def.shelf) : boardHash('', board),
      ),
    }
  }),
)
