import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { ROCK } from '../drums.ts'
import { packParams } from '../engine/params.ts'
import { buildBender } from './build.ts'
import { BLOCK } from './stage.ts'
import { rms } from './testRender.ts'

function level(sr: number, board: Partial<Controls>) {
  const built = buildBender(sr)
  built.transport.tune = true
  built.transport.drums = true
  const p = packParams({ ...DEFAULT_CONTROLS, ...ROCK, ...board })
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((3 * sr) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    built.chain.process(io, p)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return rms(out.subarray(Math.round(out.length / 2)))
}

const BOARDS: [string, Partial<Controls>][] = [
  ['the kick rung into the tom', { chipLevel: 0, drumTankCouple: 1 }],
  ['a blocking clipper', { distMix: 1, distBlock: 1, drumLevel: 0 }],
]

test.each(BOARDS)('%s sounds the same at 44.1 and 96 kHz', (_, board) => {
  const ratio = level(96000, board) / level(44100, board)
  expect(Math.abs(ratio - 1)).toBeLessThan(0.03)
})
