import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { YOURS } from '../dsp/stages/roms.ts'
import { deviation, renderStems, rms } from '../dsp/testRender.ts'
import { boardFrom, boardFromUrl, sceneHash } from '../ui/share.ts'
import { DEMO_SCENES } from './demoScenes.ts'

import type { Controls } from '../controls.ts'

const scenes = DEMO_SCENES.map(s => [s.name, s] as const)

test.each(scenes)('%s survives its own link, song and all', (_, scene) => {
  const board = { ...DEFAULT_CONTROLS, ...scene.board }
  const read = boardFrom(
    boardFromUrl('', `#${sceneHash(board)}`) ?? {},
    DEFAULT_CONTROLS,
  )
  expect(read).toEqual(board)
})

test('a demo with a toy tune plays its own, not a ROM song', () => {
  for (const scene of DEMO_SCENES)
    if (scene.board.chipTune !== undefined)
      expect(scene.board.chipTune, scene.name).toBe(YOURS)
})

const twoBars = (c: Controls) => renderStems(c, (2 * 240) / c.drumBpm).master

const db = (x: Float32Array) => 20 * Math.log10(rms(x))

test.each(scenes)(
  '%s plays as loud as the others, and its wires are what bend it',
  (_, scene) => {
    const board = { ...DEFAULT_CONTROLS, ...scene.board }
    const cut = {
      ...board,
      mod0Depth: 0,
      mod1Depth: 0,
      mod2Depth: 0,
      mod3Depth: 0,
    }
    const out = twoBars(board)
    expect(db(out)).toBeGreaterThan(-19)
    expect(db(out)).toBeLessThan(-9)
    expect(deviation(out, twoBars(cut))).toBeGreaterThan(0.2)
  },
)
