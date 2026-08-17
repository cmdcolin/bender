import { expect, test } from 'vitest'
import type { Controls } from '../controls'
import type { BuiltChain } from './build'
import {
  bin,
  lowEnergy,
  playKeys,
  renderBender,
  rms,
  sine,
  stepMask,
  tail,
} from './testRender'

// The two boxes' trigger lines, bridged. The kit's hit arrives at the chip a
// block late, so these run long enough for that to be beside the point.
const bridge = (overrides: Partial<Controls>, seconds = 1.5) =>
  renderBender(
    {
      chipLevel: 0.8,
      drumLevel: 0.9,
      drumBpm: 120,
      drumKick: 0b1000_1000_1000_1000,
      drumSnare: 0,
      drumHat: 0,
      ...overrides,
    },
    seconds,
    // The kit runs, the demo song does not: every note we hear came off a hit.
    built => {
      built.transport.drums = true
    },
  )

test('the mic soldered onto the drum trigger fires the kit', () => {
  const clicks = (mic: Float32Array, offset: number) => {
    for (let i = 0; i < mic.length; i++)
      mic[i] = (offset + i) % 12000 < 40 ? 0.9 : 0
  }
  const look: Partial<Controls> = { chipLevel: 0, drumLevel: 1, micLevel: 1 }
  // the sequencer is stopped, so anything we hear came off the trigger line
  const trig = renderBender({ ...look, micPatch: 5 }, 1, undefined, clicks)
  const inert = renderBender({ ...look, micPatch: 4 }, 1, undefined, clicks)
  expect(rms(inert)).toBe(0)
  expect(rms(trig)).toBeGreaterThan(0.01)
})

test('the kit fires the keyboard, with the demo song stopped', () => {
  const inert = bridge({})
  const wired = bridge({ trigToKeys: 1 })
  expect(rms(inert)).toBeGreaterThan(0.01)
  // The tonic, struck on a key voice — the chip's own melody line is stopped.
  expect(bin(wired, 220)).toBeGreaterThan(8 * bin(inert, 220))
})

test('a hit off any voice fires it, a hit off the wrong one does not', () => {
  const onKick = bridge({ trigToKeys: 1 })
  const onSnare = bridge({ trigToKeys: 2 })
  const onAny = bridge({ trigToKeys: 7 })
  expect(bin(onSnare, 220)).toBeLessThan(0.1 * bin(onKick, 220))
  expect(bin(onAny, 220)).toBeGreaterThan(0.5 * bin(onKick, 220))
})

test('the next step hands the tune to the pattern', () => {
  // the scale ROM, so walking it is audible as walking up
  const scale = { chipTune: 3, trigToKeys: 1 }
  const oneNote = bridge({ ...scale, trigKeysNote: 0 })
  const walked = bridge({ ...scale, trigKeysNote: 1 })
  const third = 220 * Math.pow(2, 4 / 12)
  // one hit, one step: the same note over and over becomes the scale's own notes
  expect(bin(walked, third)).toBeGreaterThan(4 * bin(oneNote, third))
  expect(bin(oneNote, 220)).toBeGreaterThan(4 * bin(walked, 220))
})

test('the whole band walks with a drum-clocked step', () => {
  // The bass sits an octave under the tonic, and it can only be the kick putting
  // it there: the chip's own sequencer is stopped.
  // The kit is turned right down, so what is left is what it triggered.
  const walked = {
    chipTune: 3,
    chipLevel: 1,
    drumLevel: 0.02,
    trigToKeys: 1,
    trigKeysNote: 1,
  }
  const bare = bridge({ ...walked, chipAccomp: 0 })
  const band = bridge({ ...walked, chipAccomp: 1 })
  expect(bin(band, 110)).toBeGreaterThan(4 * bin(bare, 110))
})

test('the keys fire the kit, with the pattern stopped', () => {
  // Only the kit is audible, and only the trigger line can be firing it: the
  // sequencer is stopped and the chip is turned all the way down.
  const kit = (overrides: Partial<Controls>) =>
    playKeys({ chipLevel: 0, drumLevel: 1, ...overrides }, chip => {
      chip.noteOn(0)
      chip.noteOn(7)
    })
  expect(rms(kit({}))).toBe(0)
  expect(rms(kit({ trigToDrum: 1 }))).toBeGreaterThan(0.01)
})

// The octave switch reaches under the chip's own bottom key, so the line has to
// carry a note below zero as a note rather than as an empty sample.
test('a key under the chip’s bottom note still fires the kit', () => {
  const out = playKeys({ chipLevel: 0, drumLevel: 1, trigToDrum: 1 }, chip =>
    chip.noteOn(-1),
  )
  expect(rms(out)).toBeGreaterThan(0.01)
})

test('a key on the step plays whatever column the sequencer is on', () => {
  const key = (masks: Partial<Controls>) =>
    playKeys(
      { chipLevel: 0, drumLevel: 1, trigToDrum: 8, ...masks },
      chip => chip.noteOn(0),
      0.3,
    )
  // The cowbell is on the column the stopped kit is sitting on, so that is what
  // the key plays. An empty column falls back to the kick, as the retrigger
  // bend and the mic trigger both do — a key that fires nothing reads as broken.
  const empty = key({})
  const bell = key({ drumBell: stepMask(0) })
  expect(bin(bell, 540)).toBeGreaterThan(8 * bin(empty, 540))
  expect(lowEnergy(empty)).toBeGreaterThan(0.01)
})

test('both wires soldered leaves the two boxes playing each other', () => {
  // One hit is enough: the kit strikes a note, the note strikes the kit, and the
  // lap closes once a block rather than once a sample, which is what keeps it a
  // rattle instead of a blowup.
  const out = playKeys(
    { chipLevel: 0.6, drumLevel: 0.9, trigToKeys: 7, trigToDrum: 7 },
    chip => chip.noteOn(0),
    1,
  )
  expect(rms(out)).toBeGreaterThan(0.02)
  expect(out.every(Number.isFinite)).toBe(true)
  // A second on from the one key, the pair are still going: the lap is 2.7 ms,
  // so what it comes out as is a rattle at the block rate rather than a hit.
  expect(rms(tail(out, 0.25))).toBeGreaterThan(0.02)
})

test('a struck sample is a seventh voice on the kit', () => {
  const kit: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.05,
    drumBpm: 120,
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0,
    drumHat: 0,
    sampleLevel: 1,
    sampleMode: 1,
  }
  const load = (b: BuiltChain) => {
    b.sampler.setBuffer(sine(500, 0.1))
    b.transport.drums = true
  }
  // A one-shot with nothing wired to it plays once and stops; wired to the kick
  // it is back at the top of the file on every hit.
  const once = renderBender(kit, 2, load)
  const struck = renderBender({ ...kit, sampleTrig: 1 }, 2, load)
  expect(bin(tail(once, 0.5), 500)).toBeLessThan(0.005)
  expect(bin(tail(struck, 0.5), 500)).toBeGreaterThan(0.02)
})
