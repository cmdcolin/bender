import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { YOURS } from '../dsp/stages/roms.ts'
import { boardFrom, boardFromUrl, sceneHash } from '../ui/share.ts'
import { DEMO_SCENES } from './demoScenes.ts'

test.each(DEMO_SCENES.map(s => [s.name, s] as const))(
  '%s survives its own link, song and all',
  (_, scene) => {
    const board = { ...DEFAULT_CONTROLS, ...scene.board }
    const read = boardFrom(
      boardFromUrl('', `#${sceneHash(board)}`) ?? {},
      DEFAULT_CONTROLS,
    )
    expect(read).toEqual(board)
  },
)

test('a demo with a toy tune plays its own, not a ROM song', () => {
  for (const scene of DEMO_SCENES)
    if (scene.board.chipTune !== undefined)
      expect(scene.board.chipTune, scene.name).toBe(YOURS)
})
