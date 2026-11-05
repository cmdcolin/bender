import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { GRID_ROWS, ROCK } from '../drums.ts'
import { IDX, N_PARAMS, packParams, paramMask } from '../engine/params.ts'
import { Cue } from './cue.ts'
import { BLOCK } from './stage.ts'
import { renderBender, stepMask } from './testRender.ts'

const SILENT_KIT: Partial<Controls> = Object.fromEntries(
  GRID_ROWS.flatMap(row => [
    [row.key, 0],
    ...(row.maybe ? [[row.maybe, 0]] : []),
  ]),
)

const KICKS = { drumKick: stepMask(0, 4, 8, 12) }

function kit(cue?: Cue) {
  let landedIn = -1
  let block = 0
  const out = renderBender(
    SILENT_KIT,
    3,
    built => {
      built.transport.drums = true
      built.toyDrum.cue = cue ?? null
    },
    undefined,
    built => {
      if (landedIn < 0 && built.toyDrum.tick >= 16) landedIn = block
      block++
    },
  )
  return { out, landedIn }
}

const armed = (at: number) => {
  const cue = new Cue(new Float32Array(N_PARAMS))
  cue.arm(
    1,
    at,
    packParams({ ...DEFAULT_CONTROLS, ...ROCK, ...SILENT_KIT, ...KICKS }),
    paramMask(KICKS),
  )
  return cue
}

test('a cue lands in the block the counter steps onto its tick, and not before', () => {
  const dry = kit()
  const cued = kit(armed(16))
  const first = cued.out.findIndex((v, i) => v !== dry.out[i])
  expect(first).toBeGreaterThan(0)
  expect(Math.floor(first / BLOCK)).toBe(dry.landedIn - 1)
})

test('a cue whose tick has passed lands on the next reach', () => {
  const p = new Float32Array(N_PARAMS)
  const cue = armed(16)
  cue.reach(15, p)
  expect(cue.landed).toBe(0)
  cue.reach(40, p)
  expect(cue.landed).toBe(1)
  expect(p[IDX.drumKick]).toBe(KICKS.drumKick)
})

test('a landed cue holds over each new board until the next cue or a drop', () => {
  const board = new Float32Array(N_PARAMS)
  const cue = new Cue(board)
  cue.arm(
    1,
    16,
    packParams({ ...DEFAULT_CONTROLS, ...KICKS }),
    paramMask(KICKS),
  )
  cue.reach(16, new Float32Array(N_PARAMS))
  board.fill(0)
  cue.hold()
  expect(board[IDX.drumKick]).toBe(KICKS.drumKick)
  expect(board[IDX.dlyFb]).toBe(0)
  cue.drop()
  board.fill(0)
  cue.hold()
  expect(board[IDX.drumKick]).toBe(0)
})
