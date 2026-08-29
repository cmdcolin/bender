import { expect, test } from 'vitest'
import {
  doubleTime,
  DRUM_MOVES,
  euclid,
  fillBar,
  halfTime,
  masksOf,
  randomPattern,
  shiftPattern,
  varyPattern,
} from './drum-moves'
import {
  DRUM_ROMS,
  GRID_ROWS,
  PATTERN_KEYS,
  hasStep,
  STEPS,
  stepBit,
  type DrumLens,
  type DrumMasks,
} from './drums'
import { mulberry32 } from './dsp/util/rng'

const romNamed = (name: string) => DRUM_ROMS.find(r => r.name === name)!.masks

const EVEN_LENS = Object.fromEntries(
  GRID_ROWS.map(r => [r.len, STEPS]),
) as DrumLens

const steps = (mask: number) =>
  Array.from({ length: STEPS }, (_, s) => s).filter(s => hasStep(mask, s))

const gaps = (mask: number) => {
  const on = steps(mask)
  return on.map((s, i) => (i === 0 ? s + STEPS - on.at(-1)! : s - on[i - 1]!))
}

test('a euclidean rhythm spreads its hits as evenly as whole steps allow', () => {
  expect(steps(euclid(4))).toEqual([0, 4, 8, 12])
  for (const hits of [3, 5, 7, 9, 11]) {
    const spread = euclid(hits)
    expect(steps(spread).length, `${hits}`).toBe(hits)
    // Evenly spread means no two gaps differ by more than a step.
    const wide = Math.max(...gaps(spread))
    const tight = Math.min(...gaps(spread))
    expect(wide - tight, `${hits}`).toBeLessThanOrEqual(1)
  }
})

test('a rolled pattern is sixteen steps, and the downbeat is in every one', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const masks = randomPattern(mulberry32(seed))
    expect(hasStep(masks.drumKick, 0), `${seed}`).toBe(true)
    for (const row of GRID_ROWS) {
      expect(Number.isInteger(masks[row.key]), `${seed}/${row.key}`).toBe(true)
      expect(masks[row.key], `${seed}/${row.key}`).toBeGreaterThanOrEqual(0)
      expect(masks[row.key], `${seed}/${row.key}`).toBeLessThan(1 << STEPS)
    }
  }
})

test('a rolled pattern keeps time — something on the beat, and not everything', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const masks = randomPattern(mulberry32(seed))
    const voices = [masks.drumSnare, masks.drumHat, masks.drumClap]
    expect(
      voices.some(m => m !== 0),
      `${seed}`,
    ).toBe(true)
    // Every step of every voice closed is a wall, not a pattern.
    const closed = GRID_ROWS.reduce((n, r) => n + steps(masks[r.key]).length, 0)
    expect(closed, `${seed}`).toBeLessThan(GRID_ROWS.length * STEPS)
  }
})

test('rolling twice hands you two different patterns', () => {
  const seen = new Set<string>()
  for (let seed = 1; seed <= 40; seed++) {
    seen.add(JSON.stringify(randomPattern(mulberry32(seed))))
  }
  expect(seen.size).toBeGreaterThan(20)
})

test('a fill writes the end of the bar and leaves the start of it alone', () => {
  const before = romNamed('rock')
  for (let seed = 1; seed <= 120; seed++) {
    const after = fillBar(before, mulberry32(seed))
    for (const row of GRID_ROWS) {
      // The bell and the accent are allowed the downbeat the fill runs at.
      if (row.key === 'drumBell' || row.key === 'drumAccent') continue
      for (let s = 0; s < STEPS / 2; s++) {
        expect(hasStep(after[row.key], s), `${seed}/${row.key}/${s}`).toBe(
          hasStep(before[row.key], s),
        )
      }
    }
    const last = GRID_ROWS.some(row =>
      steps(after[row.key]).some(s => s >= STEPS - 4),
    )
    expect(last, `${seed}`).toBe(true)
  }
})

test('a varied pattern is a changed one, and still mostly the one you had', () => {
  const before = romNamed('breaks')
  for (let seed = 1; seed <= 120; seed++) {
    const after = varyPattern(before, mulberry32(seed))
    const moved = GRID_ROWS.filter(r => after[r.key] !== before[r.key])
    expect(moved.length, `${seed}`).toBeGreaterThan(0)
    // Two to four small edits: never a rewrite of every row at once.
    expect(moved.length, `${seed}`).toBeLessThan(GRID_ROWS.length)
  }
})

test('vary leaves the downbeat kick alone', () => {
  const before = romNamed('rock')
  for (let seed = 1; seed <= 200; seed++) {
    expect(hasStep(varyPattern(before, mulberry32(seed)).drumKick, 0)).toBe(
      true,
    )
  }
})

test('shifting turns a row within its own length, and turns it back', () => {
  const before = romNamed('electro')
  const there = shiftPattern(before, EVEN_LENS, 1)
  expect(steps(there.drumKick)).toEqual(
    steps(before.drumKick)
      .map(s => (s + 1) % STEPS)
      .sort((a, b) => a - b),
  )
  expect(shiftPattern(there, EVEN_LENS, -1)).toEqual(before)
})

test('a short row turns inside its own bar', () => {
  const masks: DrumMasks = { ...romNamed('clear'), drumHat: stepBit(4) }
  const lens: DrumLens = { ...EVEN_LENS, drumHatLen: 5 }
  expect(steps(shiftPattern(masks, lens, 1).drumHat)).toEqual([0])
  // A step the row never reaches is left where it is rather than turned into
  // one it does.
  const past: DrumMasks = { ...masks, drumHat: stepBit(4) | stepBit(9) }
  expect(steps(shiftPattern(past, lens, 1).drumHat)).toEqual([0, 9])
})

test('half time gives every step two, and double time says the bar twice', () => {
  const masks: DrumMasks = {
    ...romNamed('clear'),
    drumKick: stepBit(0) | stepBit(2) | stepBit(9),
  }
  expect(steps(halfTime(masks).drumKick)).toEqual([0, 4])
  expect(steps(doubleTime(masks).drumKick)).toEqual([0, 1, 4, 8, 9, 12])
})

test('every move hands back sixteen honest steps a row', () => {
  const before = romNamed('rock')
  for (const move of DRUM_MOVES) {
    for (let seed = 1; seed <= 40; seed++) {
      const after = move.play({
        masks: before,
        lens: EVEN_LENS,
        rand: mulberry32(seed),
        back: seed % 2 === 0,
      })
      for (const row of GRID_ROWS) {
        const mask = after[row.key]
        expect(Number.isInteger(mask), `${move.name}/${row.key}`).toBe(true)
        expect(mask, `${move.name}/${row.key}`).toBeGreaterThanOrEqual(0)
        expect(mask, `${move.name}/${row.key}`).toBeLessThan(1 << STEPS)
      }
    }
  }
})

// The moves sit a centimetre under the ROM buttons, and a machine with two
// buttons saying the same word is lying about which of them wipes the bar.
test('no move is named after a factory pattern', () => {
  const roms = new Set(DRUM_ROMS.map(r => r.name))
  for (const move of DRUM_MOVES)
    expect(roms.has(move.name), move.name).toBe(false)
})

test('a board hands over every mask in the pattern and none of its other numbers', () => {
  const board = { ...romNamed('disco'), drumBpm: 118, revMix: 0.4 }
  expect(Object.keys(masksOf(board)).sort()).toEqual([...PATTERN_KEYS].sort())
})
