import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { packParams } from '../engine/params.ts'
import {
  encodeTune,
  HOLD,
  isNote,
  MONO_SEQ_STEP_KEYS,
  parseSeqFlags,
  REST,
} from '../tune.ts'
import { buildBender, type BuiltChain } from './build.ts'
import { FAULT } from './bus.ts'
import { MEMORY_CARRY_NAMES, MEMORY_ROT_NAMES } from './melodyMemory.ts'
import { makeIo, SR } from './testRender.ts'

const LINE = [0, 3, 7, 10, 12, 5, 2, 8]

// Growler alone on the kit's sixteenths, eight steps a lap, no rests.
const board = (more: Partial<Controls> = {}): Controls => {
  const c: Controls = {
    ...DEFAULT_CONTROLS,
    chipLevel: 0,
    drumLevel: 0,
    drumBpm: 240,
    monoLevel: 1,
    monoKeyGate: 1,
    monoSeqOn: 1,
    monoSeqSync: 1,
    monoSeqLen: LINE.length,
  }
  LINE.forEach((note, s) => {
    c[MONO_SEQ_STEP_KEYS[s]!] = note
  })
  return { ...c, ...more }
}

interface Run {
  built: BuiltChain
  p: Float32Array
  /** The note Growler struck at each count of the counter, lap by lap. */
  laps: number[][]
}

function run(c: Controls, laps: number, built = buildBender(SR)): Run {
  built.transport.drums = true
  const p = packParams(c)
  const io = makeIo()
  const heard: number[][] = []
  const key = new Int16Array(1)
  let at = -1
  let count = 0
  while (heard.length <= laps + 1 && count < 100_000) {
    built.chain.process(io, p)
    count++
    const now = built.melody.at
    if (now !== at) {
      if (now === 0) heard.push([])
      at = now
      const lap = heard.at(-1)
      if (lap) lap.push(built.monoSynth.soundingNotes(key) ? key[0]! : REST)
    }
  }
  return { built, p, laps: heard.slice(1, laps + 1) }
}

const ram = (r: Run) =>
  Array.from(r.built.melody.notes.subarray(0, LINE.length))

const bits = (r: Run) =>
  ram(r).reduce(
    (n, note, s) =>
      n + popcount(encodeTune(note)) + popcount(r.built.melody.flags[s]!),
    0,
  )

function popcount(word: number) {
  let n = 0
  for (let w = word; w; w &= w - 1) n++
  return n
}

const changes = (notes: number[]) =>
  notes.filter((n, s) => n !== notes[(s + notes.length - 1) % notes.length])
    .length

test('at stock the memory plays the panel’s line and holds it untouched', () => {
  const r = run(board(), 2)
  expect(r.laps[0]).toEqual(r.laps[1])
  expect(new Set(r.laps[0]).size).toBe(LINE.length)
  expect(ram(r)).toEqual(LINE)
  expect(r.built.melody.damage).toBe(0)
})

test('a data line held high plays the same wrong notes every lap, by its weight', () => {
  const clean = run(board(), 1).laps[0]!
  const r = run(
    board({ monoSeqDataLine: 1, monoSeqDataFault: FAULT.supply }),
    3,
  )
  expect(r.laps[1]).toEqual(r.laps[0])
  expect(r.laps[2]).toEqual(r.laps[0])
  const moved = r.laps[0]!.map((n, s) => n - clean[s]!)
  expect(moved.every(d => d === 0 || d === 1)).toBe(true)
  expect(moved.filter(d => d === 1).length).toBeGreaterThan(0)
  expect(ram(r)).toEqual(LINE)
})

test('a grounded data line drops its weight off the notes that carry it', () => {
  const clean = run(board(), 1).laps[0]!
  const r = run(
    board({ monoSeqDataLine: 4, monoSeqDataFault: FAULT.ground }),
    2,
  )
  expect(r.laps[1]).toEqual(r.laps[0])
  const moved = r.laps[0]!.map((n, s) => n - clean[s]!)
  expect(moved.every(d => d === 0 || d === -8)).toBe(true)
  expect(moved).toContain(-8)
})

test('a grounded address line folds the line onto its first half', () => {
  const r = run(
    board({ monoSeqAddrLine: 3, monoSeqAddrFault: FAULT.ground }),
    2,
  )
  const lap = r.laps[0]!
  expect(lap.slice(4)).toEqual(lap.slice(0, 4))
  expect(r.laps[1]).toEqual(lap)
})

test('a cut carry wraps the counter into a short loop', () => {
  const r = run(
    board({ monoSeqCarry: MEMORY_CARRY_NAMES.indexOf('wraps at 4') }),
    3,
  )
  for (const lap of r.laps) expect(lap.length).toBe(4)
  expect(r.laps[1]).toEqual(r.laps[0])
})

test('crossed address lines play the steps out of order, the same every lap', () => {
  const clean = run(board(), 1).laps[0]!
  const r = run(board({ monoSeqAddrCross: 1 }), 2)
  expect(r.laps[0]).toEqual([0, 2, 1, 3, 4, 6, 5, 7].map(s => clean[s]))
  expect(r.laps[1]).toEqual(r.laps[0])
})

test('a leaking write enable smears the line into repeats, and the damage stays', () => {
  const r = run(board({ monoSeqLeak: 0.5 }), 24)
  expect(changes(ram(r))).toBeLessThan(changes(LINE) / 2)
  expect(r.built.melody.damage).not.toBe(0)
  expect(changes(r.laps.at(-1)!)).toBeLessThan(changes(r.laps[0]!))

  const left = run(board(), 2, r.built)
  expect(changes(ram(left))).toBeLessThan(changes(LINE) / 2)
  expect(left.laps[1]).toEqual(left.laps[0])
})

test('a stuck write enable turns the line into one note, drifting', () => {
  const r = run(board({ monoSeqLeak: 1 }), 6)
  for (const lap of r.laps) expect(changes(lap)).toBeLessThanOrEqual(2)
  expect(new Set(r.laps.flat()).size).toBeGreaterThan(1)
})

test('restore writes the panel’s line back over the damage', () => {
  const r = run(board({ monoSeqLeak: 1 }), 2)
  expect(r.built.melody.damage).not.toBe(0)
  r.built.melody.restore()
  const back = run(board(), 1, r.built)
  expect(back.built.melody.damage).toBe(0)
  expect(ram(back)).toEqual(LINE)
})

test('writing a step over the damage puts that one step back', () => {
  const r = run(board({ monoSeqLeak: 1 }), 2)
  const damage = r.built.melody.damage
  const back = run(board({ monoSeqStep3: 4 }), 1, r.built)
  expect(back.built.melody.notes[3]).toBe(4)
  expect(back.built.melody.damage & (1 << 3)).toBe(0)
  expect(back.built.melody.damage).not.toBe(0)
  expect(damage).not.toBe(0)
})

test('starved refresh leaks a bit a bar on the kit’s clock, and the notes sink', () => {
  const [accentLo] = parseSeqFlags('x.x.x.x.')
  const c = board({
    monoSeqRot: MEMORY_ROT_NAMES.indexOf('every bar'),
    monoSeqAccentLo: accentLo,
  })
  const r = run(c, 4)
  const before = LINE.reduce((n, note) => n + popcount(encodeTune(note)), 4)
  const bars = Math.floor(r.built.toyDrum.tick / 16)
  expect(bars).toBeGreaterThan(0)
  expect(Math.abs(before - bits(r) - bars)).toBeLessThanOrEqual(1)
  const was = bits(r)
  const after = run(c, 32, r.built)
  const notes = ram(after)
  expect(bits(after)).toBeLessThan(was - 8)
  notes.forEach((note, s) => {
    if (isNote(note)) expect(note).toBeLessThanOrEqual(LINE[s]!)
    else expect(note).toBe(HOLD)
  })
  expect(after.built.melody.flags.filter(f => f & 1).length).toBeLessThan(4)
})

test('rot keeps leaking while the memory is switched off', () => {
  const c = board({ monoSeqRot: MEMORY_ROT_NAMES.indexOf('every step') })
  const r = run(c, 1)
  const was = bits(r)
  const io = makeIo()
  const p = packParams({ ...c, monoSeqOn: 0 })
  for (let b = 0; b < 200; b++) r.built.chain.process(io, p)
  expect(bits(r)).toBeLessThan(was)
})

test('Howler’s memory bends apart from Growler’s', () => {
  const c = board({
    leadSeqOn: 1,
    leadSeqSync: 1,
    leadSeqLen: 4,
    leadSeqStep0: 0,
    leadSeqStep1: 5,
    leadSeqStep2: 9,
    leadSeqStep3: 12,
    monoSeqLeak: 1,
  })
  const r = run(c, 2)
  expect(r.built.melody.damage).not.toBe(0)
  expect(r.built.leadMelody.damage).toBe(0)
  expect(Array.from(r.built.leadMelody.notes.subarray(0, 4))).toEqual([
    0, 5, 9, 12,
  ])
})
