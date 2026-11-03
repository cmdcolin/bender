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
