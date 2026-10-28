import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { DEST } from '../dsp/modbus.ts'
import {
  CV_DEST,
  LFO,
  modCables,
  MODULES,
  moveCv,
  patchCv,
  plateName,
  pullCv,
  spareWire,
} from './modCables.ts'

const off = {
  ...DEFAULT_CONTROLS,
  mod0Src: 0,
  mod1Src: 0,
  mod2Src: 0,
  mod3Src: 0,
}

test('a wire onto a machine is a cable into its CV jack', () => {
  const c = { ...off, mod1Src: LFO, mod1Dest: DEST.fmLevel, mod1Depth: 0.4 }
  expect(modCables(c)).toEqual([
    { wire: 1, src: LFO, dest: DEST.fmLevel, depth: 0.4, machine: 'Glint' },
  ])
})

test('a wire onto a pedal draws no bench cable', () => {
  expect(modCables({ ...off, mod0Src: LFO, mod0Dest: DEST.delayMs })).toEqual(
    [],
  )
})

test('patching a CV jack takes the first spare wire at a depth that moves', () => {
  const c = patchCv(
    { ...off, mod0Src: LFO, mod1Depth: 0 },
    MODULES[1]!,
    'Growler',
  )
  expect(c.mod1Src).toBe(MODULES[1])
  expect(c.mod1Dest).toBe(CV_DEST.Growler)
  expect(c.mod1Depth).not.toBe(0)
})

test('with all four wires in use a CV jack takes nothing', () => {
  const full = { ...off, mod0Src: 1, mod1Src: 1, mod2Src: 1, mod3Src: 1 }
  expect(spareWire(full)).toBe(-1)
  expect(patchCv(full, LFO, 'Plinky')).toBe(full)
})

test('moving a cable keeps its source and depth, and pulling it frees the wire', () => {
  const c = { ...off, mod2Src: LFO, mod2Dest: CV_DEST.Glint, mod2Depth: -0.3 }
  const moved = moveCv(c, 2, 'Clatter')
  expect(modCables(moved)[0]).toMatchObject({
    src: LFO,
    depth: -0.3,
    machine: 'Clatter',
  })
  expect(modCables(pullCv(moved, 2))).toEqual([])
})

test('every plate name fits under a jack', () => {
  for (let src = 1; src <= 15; src++)
    expect(plateName(src).length, plateName(src)).toBeLessThanOrEqual(6)
})
