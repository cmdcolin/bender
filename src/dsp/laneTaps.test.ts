import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { packParams } from '../engine/params.ts'
import { REST, TUNE_LANE_KEYS } from '../tune.ts'
import { buildBender } from './build.ts'
import { BLOCK } from './stage.ts'
import { YOURS } from './stages/roms.ts'
import { makeIo, SR } from './testRender.ts'
import { GATE_ALL, GATE_CUT, GATE_LANE_1 } from './trigbus.ts'

const LANES = [
  [0, 2, 4, 5],
  [12, 14, 16, 17],
  [-12, -10, -8, -7],
]

const BOARD: Controls = {
  ...DEFAULT_CONTROLS,
  drumLevel: 0,
  chipLevel: 1,
  chipTune: YOURS,
  tuneRate: 4,
  tuneLen: 4,
  tunePoly: 1,
  fmLevel: 1,
  pcmLevel: 1,
  monoLevel: 1,
  fmKeyGate: GATE_CUT,
  pcmKeyGate: GATE_CUT,
  monoKeyGate: GATE_CUT,
  ...Object.fromEntries(
    TUNE_LANE_KEYS.flatMap((keys, lane) =>
      keys.map((key, i) => [key, LANES[lane]![i] ?? REST]),
    ),
  ),
}

const sorted = (notes: Iterable<number>) => [...notes].toSorted((a, b) => a - b)

function heard(over: Partial<Controls>, seconds = 2.5) {
  const built = buildBender(SR)
  built.transport.tune = true
  const p = packParams({ ...BOARD, ...over })
  const io = makeIo()
  const out = new Int16Array(16)
  const seen = {
    toyChip: new Set<number>(),
    fmChip: new Set<number>(),
    pcmKeys: new Set<number>(),
    monoSynth: new Set<number>(),
  }
  const notes = (stage: { soundingNotes(out: Int16Array): number }) =>
    out.subarray(0, stage.soundingNotes(out))
  for (let b = 0; b < Math.ceil((seconds * SR) / BLOCK); b++) {
    built.chain.process(io, p)
    for (const n of notes(built.toyChip)) seen.toyChip.add(n)
    for (const n of notes(built.fmChip)) seen.fmChip.add(n)
    for (const n of notes(built.pcmKeys)) seen.pcmKeys.add(n)
    for (const n of notes(built.monoSynth)) seen.monoSynth.add(n)
  }
  return {
    toyChip: sorted(seen.toyChip),
    fmChip: sorted(seen.fmChip),
    pcmKeys: sorted(seen.pcmKeys),
    monoSynth: sorted(seen.monoSynth),
  }
}

test.each([
  ['fmChip', 'fmKeyGate'],
  ['pcmKeys', 'pcmKeyGate'],
  ['monoSynth', 'monoKeyGate'],
] as const)('%s on a lane follows only that lane', (machine, gate) => {
  for (const [lane, notes] of LANES.entries())
    expect(
      heard({ [gate]: GATE_LANE_1 + lane })[machine],
      `lane ${lane + 1}`,
    ).toEqual(sorted(notes))
})

test('yes, soldered still hears the lanes merged on the one line', () => {
  const all = heard({ pcmKeyGate: GATE_ALL }).pcmKeys
  expect(
    LANES.filter(notes => notes.some(n => all.includes(n))).length,
  ).toBeGreaterThan(1)
  expect(all.every(n => LANES.flat().includes(n))).toBe(true)
})

test('three machines take three lanes at once', () => {
  const at = heard({
    monoKeyGate: GATE_LANE_1,
    pcmKeyGate: GATE_LANE_1 + 1,
    fmKeyGate: GATE_LANE_1 + 2,
  })
  expect(at.monoSynth).toEqual(sorted(LANES[0]!))
  expect(at.pcmKeys).toEqual(sorted(LANES[1]!))
  expect(at.fmChip).toEqual(sorted(LANES[2]!))
})

test('a lifted lane leaves Plinky and still drives its jumper', () => {
  const at = heard({ tuneLift: 0b110, pcmKeyGate: GATE_LANE_1 + 1 })
  expect(at.toyChip).toEqual(sorted(LANES[0]!))
  expect(at.pcmKeys).toEqual(sorted(LANES[1]!))
})

test('lifting every lane silences Plinky and keeps the lead on the line', () => {
  const at = heard({ tuneLift: 0b111, fmKeyGate: GATE_LANE_1 })
  expect(at.toyChip).toEqual([])
  expect(at.fmChip).toEqual(sorted(LANES[0]!))
})

test('a lift does nothing while Plinky plays a ROM song', () => {
  const rom = { chipTune: 0, tuneLift: 0b111 }
  expect(heard(rom).toyChip).toEqual(heard({ chipTune: 0 }).toyChip)
})

function played(over: Partial<Controls>) {
  const built = buildBender(SR)
  built.transport.tune = true
  const p = packParams({
    ...BOARD,
    fmLevel: 0,
    pcmLevel: 0,
    monoLevel: 0,
    ...over,
  })
  const io = makeIo()
  const out = new Float32Array(Math.ceil(SR / BLOCK) * BLOCK)
  for (let b = 0; b < out.length / BLOCK; b++) {
    built.chain.process(io, p)
    out.set(io.l, b * BLOCK)
  }
  return out
}

test.each([
  ['scanned', { chipScan: 1 }],
  ['shorted', { chipShort: 1 }],
  ['ring', { chipXor: 1 }],
] as const)(
  'a lifted lead leaves the %s output pin to the stacks',
  (_, pin) => {
    const blank = Object.fromEntries(TUNE_LANE_KEYS[0].map(key => [key, REST]))
    const lifted = played({ ...pin, tuneLift: 0b001 })
    const empty = played({ ...pin, ...blank })
    let apart = 0
    let size = 0
    for (let i = 0; i < empty.length; i++) {
      apart = Math.max(apart, Math.abs(lifted[i]! - empty[i]!))
      size = Math.max(size, Math.abs(empty[i]!))
    }
    expect(size).toBeGreaterThan(0.01)
    expect(apart).toBe(0)
  },
)

test('a reboot with the song stopped strikes nothing on the stacks', () => {
  const built = buildBender(SR)
  const p = packParams({ ...BOARD, fmLevel: 0, pcmLevel: 0, monoLevel: 0 })
  const io = makeIo()
  const out = new Int16Array(16)
  for (let b = 0; b < 20; b++) built.chain.process(io, p)
  built.rail.trip()
  let sounded = 0
  for (let b = 0; b < SR / BLOCK; b++) {
    built.chain.process(io, p)
    sounded += built.toyChip.soundingNotes(out)
  }
  expect(sounded).toBe(0)
})
