import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { Chain } from '../dsp/chain.ts'
import { METER_EVERY, type Stage, type StereoBlock } from '../dsp/stage.ts'
import { makeIo, SR } from '../dsp/testRender.ts'
import {
  BAND_ROWS,
  packParams,
  SOURCE_TAPS,
  type SourceTap,
} from '../engine/params.ts'
import { CHANNELS } from './controls/index.ts'
import { BandTally } from './masking.ts'

const stage = (wave: (t: number) => number): Stage => {
  let t = 0
  return {
    label: 'scripted',
    process(io: StereoBlock) {
      for (let i = 0; i < io.n; i++) {
        const v = wave(t++)
        io.l[i]! += v
        io.r[i]! += v
      }
    },
    panic: () => {},
  }
}

const sine = (hz: number, amp: number) =>
  stage(t => amp * Math.sin((2 * Math.PI * hz * t) / SR))

const noise = (amp: number) => {
  let seed = 1
  return stage(() => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return amp * (seed / 2 ** 31 - 1)
  })
}

const rows = (names: string[]) =>
  CHANNELS.filter(c => names.includes(c.name)).map(c => ({
    name: c.name,
    row: c.tap,
  }))

function listenTo(board: Partial<Record<SourceTap, Stage>>) {
  const chain = new Chain(SR)
  chain.sources = SOURCE_TAPS.map(tap => board[tap] ?? stage(() => 0))
  chain.bands.on = true
  const p = packParams(DEFAULT_CONTROLS)
  const io = makeIo()
  const tally = new BandTally(BAND_ROWS)
  for (let b = 1; b <= 600; b++) {
    chain.process(io, p)
    if (b % METER_EVERY === 0) {
      chain.bands.settle()
      tally.add(chain.bands.levels)
    }
  }
  const heard = rows(['Clatter', 'Noise & crackle', 'Howler'])
  return { tally, heard, lead: rows(['Howler']) }
}

test('a quiet lead under a loud noise layer reads as masked by the noise', () => {
  const { tally, heard, lead } = listenTo({
    toyDrum: sine(50, 0.6),
    noise: noise(0.5),
    leadSynth: sine(1000, 0.02),
  })
  const { Howler } = tally.masking(lead, heard)
  expect(Howler).toMatchObject({ by: 'Noise & crackle', band: 'mid' })
  expect(Howler?.share).toBeGreaterThan(0.9)
  expect(tally.bands(heard).Howler).toMatchObject({ mid: -33 })
  expect(tally.owners(heard)).toMatchObject({
    sub: { Clatter: 1 },
    mid: { 'Noise & crackle': 0.8 },
  })
})

test('a lead clear of the kit’s band reads as unmasked', () => {
  const { tally, heard, lead } = listenTo({
    toyDrum: sine(50, 0.6),
    leadSynth: sine(1000, 0.2),
  })
  const { Howler } = tally.masking(lead, heard)
  expect(Howler?.share).toBeLessThan(0.05)
  expect(Howler).not.toHaveProperty('by')
  expect(tally.owners(heard)).toMatchObject({
    sub: { Clatter: 1 },
    mid: { Howler: 0.95 },
  })
})
