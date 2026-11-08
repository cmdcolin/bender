import { DEFAULT_CONTROLS } from '../controls.ts'
import { applyPreset } from '../ui/presets/apply.ts'
import { PRESETS } from '../ui/presets/table.ts'
import { sceneHash } from '../ui/share.ts'
import { DEMO_SCENES } from './demoScenes.ts'
import { boardUrl } from './paths.ts'

const TAPE_SCENES = [
  {
    preset: 'ballroom at the end of time',
    says: 'A piano 78 off archive.org loops one phrase, and the tape wears it down a little more every lap',
  },
]

const scene = (name: string, says: string, query: string) => ({
  name,
  says,
  query,
  href: boardUrl(query),
})

export const scenes = [
  ...DEMO_SCENES.map(({ name, says, board }) =>
    scene(name, says, sceneHash({ ...DEFAULT_CONTROLS, ...board })),
  ),
  ...TAPE_SCENES.map(({ preset, says }) => {
    const def = PRESETS.find(p => p.name === preset)
    if (def === undefined) throw new Error(`no preset named '${preset}'`)
    return scene(
      def.name,
      says,
      sceneHash(applyPreset(def, DEFAULT_CONTROLS), def.shelf),
    )
  }),
]
