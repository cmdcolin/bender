import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { SOURCE_TAPS, STEM_FILES, packParams } from '../engine/params'
import { buildBender } from './build'
import { Chain } from './chain'
import { BLOCK, type Stage, type StereoBlock } from './stage'
import { makeIo, quiet, renderStems, rms, SR } from './testRender'

const TOY = SOURCE_TAPS.indexOf('toyChip')
const KIT = SOURCE_TAPS.indexOf('toyDrum')

const silent = (x: Float32Array) => x.every(v => v === 0)

// A stage that puts a known pair on the bus, for the two questions the real
// sources cannot be asked directly: what a stem is made of, and whose.
const writer = (label: string, l: number, r: number): Stage => ({
  label,
  process(io: StereoBlock) {
    for (let i = 0; i < io.n; i++) {
      io.l[i]! += l
      io.r[i]! += r
    }
  },
  panic() {},
})

// The whole point of the switch. Two machines running into one bus, and the
// toy's track has to be the toy — not the toy plus whatever the kit was doing
// underneath it, which is what the file would be if the tape sat anywhere
// downstream of the summing amp.
test('a stem carries its own source and nothing of its neighbour', () => {
  const both = renderStems({ chipLevel: 0.9, drumLevel: 0.9 }, 2)
  expect(rms(both.stems[TOY]!)).toBeGreaterThan(0)
  expect(rms(both.stems[KIT]!)).toBeGreaterThan(0)

  // The kit turned off: its track goes to nothing and the toy's does not.
  const toyOnly = renderStems({ chipLevel: 0.9, drumLevel: 0 }, 2)
  expect(rms(toyOnly.stems[TOY]!)).toBeGreaterThan(0)
  expect(silent(toyOnly.stems[KIT]!)).toBe(true)

  // And the other way round, which is the half that would catch a tape wired a
  // slot along: the toy's stage still runs with the kit up — it owns the rail
  // tick and the gate line the FM chip hangs off — so a stem that were merely
  // "whatever ran this block" would have the toy's track full of the kit here.
  const kitOnly = renderStems({ chipLevel: 0, drumLevel: 0.9 }, 2)
  expect(silent(kitOnly.stems[TOY]!)).toBe(true)
  expect(rms(kitOnly.stems[KIT]!)).toBeGreaterThan(0)

  // And they are the two machines rather than two copies of the bus: the kit
  // strikes and stops, the tune runs on.
  expect(quiet(both.stems[KIT]!)).toBeGreaterThan(2 * quiet(both.stems[TOY]!))
})

// What dry means, held to. Everything from the summing amp down is applied to
// the sum, so a bend has to move the master and leave every stem exactly where
// it was — otherwise the file is a stem in name and a submix in fact.
test('a stem is the dry source, whatever the board does to the sum', () => {
  const board = { chipLevel: 0.9, drumLevel: 0.9 }
  const flat = renderStems(board, 1)
  // Slot 2 is the bit crusher, wound onto everything.
  const bent = renderStems(
    { ...board, bendSlot0: 2, bits: 3, srHz: 4000, crushMix: 1 },
    1,
  )
  expect(bent.master).not.toEqual(flat.master)
  expect(bent.stems[TOY]).toEqual(flat.stems[TOY])
  expect(bent.stems[KIT]).toEqual(flat.stems[KIT])

  // And for the desk's own knob, which is upstream of the bends and still
  // downstream of where the tape sits.
  const driven = renderStems({ ...board, mixDrive: 24 }, 1)
  expect(driven.master).not.toEqual(flat.master)
  expect(driven.stems[TOY]).toEqual(flat.stems[TOY])
})

// One track per source rather than two: five of the six put the same sample on
// both channels, so the stem is the mid of the pair — which for those five is
// the source exactly, and for the noise is the middle of its two streams.
test('a stem is the mid of the pair its source put on the bus', () => {
  const chain = new Chain(SR)
  chain.sources = [writer('wide', 0.5, 0.1), writer('mono', 0.2, 0.2)]
  chain.capturing = true
  chain.process(makeIo(), packParams(DEFAULT_CONTROLS))
  const at = (k: number, i: number) => chain.stems[k * BLOCK + i]!
  for (let i = 0; i < BLOCK; i++) {
    expect(at(0, i)).toBeCloseTo(0.3, 6)
    // The second one's own contribution, not the bus it found on arrival.
    expect(at(1, i)).toBeCloseTo(0.2, 6)
  }
})

// The tape only runs when it is asked to, and it must not be audible when it
// does: a switch about which files land in a folder that changed the sound
// would make every stem take a different take.
test('the stem tape changes nothing about what comes out', () => {
  const p = packParams({
    ...DEFAULT_CONTROLS,
    chipLevel: 0.8,
    drumLevel: 0.8,
    noiseLevel: 0.3,
  })
  const run = (capturing: boolean) => {
    const built = buildBender(SR)
    built.transport.tune = true
    built.transport.drums = true
    built.chain.capturing = capturing
    const io = makeIo()
    const out = new Float32Array(200 * BLOCK)
    for (let b = 0; b < 200; b++) {
      built.chain.process(io, p)
      out.set(io.l, b * BLOCK)
    }
    return out
  }
  expect(run(true)).toEqual(run(false))
})

// A panic is the board going quiet, and a tape still holding the last block of
// a howl is one more thing left saying the howl is there.
test('a panic empties the stem tape', () => {
  const built = buildBender(SR)
  built.transport.tune = true
  built.chain.capturing = true
  const p = packParams({ ...DEFAULT_CONTROLS, chipLevel: 0.9 })
  const io = makeIo()
  for (let b = 0; b < 200; b++) built.chain.process(io, p)
  expect(built.chain.stems.some(v => v !== 0)).toBe(true)
  built.chain.panic()
  expect(silent(built.chain.stems)).toBe(true)
})

// One file name per source, off the same list the chain sums in — a stem called
// drums that carries the sampler is worse than no stem at all.
test('every source has a file name of its own', () => {
  expect(STEM_FILES).toHaveLength(SOURCE_TAPS.length)
  expect(new Set(STEM_FILES).size).toBe(STEM_FILES.length)
})
