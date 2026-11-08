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

const scene = (name: string, says: string, query: string) => ({
  name,
  says,
  query,
  href: boardUrl(query),
})

export const sceneGroups = [
  {
    head: 'The chips',
    scenes: DEMO_SCENES.map(({ name, says, board }) =>
      scene(name, says, sceneHash({ ...DEFAULT_CONTROLS, ...board })),
    ),
  },
  {
    head: 'Old recordings on tape',
    scenes: TAPE_SCENES.map(({ preset, says }) => {
      const def = PRESETS.find(p => p.name === preset)
      if (def === undefined) throw new Error(`no preset named '${preset}'`)
      return scene(
        def.name,
        says,
        sceneHash(applyPreset(def, DEFAULT_CONTROLS), def.shelf),
      )
    }),
  },
]

export const scenes = sceneGroups.flatMap(group => group.scenes)
