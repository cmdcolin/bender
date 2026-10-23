import { describe, expect, it } from 'vitest'

import {
  ROM_ADDR_LINES,
  ROM_DATA_LINES,
  ROMS,
} from '../../src/dsp/stages/roms.ts'
import { BANK_LINES } from '../../src/dsp/stages/toyChip.ts'
import { buildBoard, netsOf } from './board.ts'
import { generate } from './generate.ts'

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const lines = (pattern: RegExp) =>
  [...netsOf(buildBoard()).keys()].filter(n => pattern.test(n)).length

describe('app constants', () => {
  it('gives the tune ROM the same address lines as the app', () => {
    expect(lines(/^STEP\d$/)).toBe(ROM_ADDR_LINES)
  })

  it('gives the tune ROM the same data lines as the app', () => {
    expect(lines(/^TD\d$/)).toBe(ROM_DATA_LINES)
  })

  it('gives the tune ROM the same bank lines as the app', () => {
    expect(lines(/^BANK\d$/)).toBe(BANK_LINES)
  })

  it('fits every app tune in the banks and steps the board has', () => {
    expect(ROMS.length).toBeLessThanOrEqual(2 ** BANK_LINES)
    for (const rom of ROMS)
      expect(rom.steps.length).toBeLessThanOrEqual(2 ** ROM_ADDR_LINES)
  })
})

describe('generated files', () => {
  const files = generate()
  it.each(Object.keys(files))(
    '%s matches a fresh build (run pnpm toy)',
    name => {
      const path = join(root, name)
      expect(existsSync(path), `${name} is missing`).toBe(true)
      const want = files[name]!
      const have = readFileSync(path)
      expect(have.equals(Buffer.from(want))).toBe(true)
    },
  )
})
