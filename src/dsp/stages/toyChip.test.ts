import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { buildBender, buildChain, type BuiltChain } from '../build'
import { BLOCK } from '../stage'
import {
  bin,
  deviation,
  makeIo,
  pitchHz,
  playKeys,
  render,
  rms,
  SR,
  tail,
} from '../testRender'
import { ToyChip } from './toyChip'
import { YOURS } from './roms'
import { HOLD, REST, TUNE_STEP_KEYS } from '../../tune'

// A memory written out as the controls that carry it. Anything not named is a
// step with nothing on it.
const memory = (steps: Record<number, number>): Partial<Controls> =>
  Object.fromEntries(TUNE_STEP_KEYS.map((key, i) => [key, steps[i] ?? REST]))

// The board boots with the drum machine running too; these takes measure the
// chip's own tune, so they mute it.
const CHIP_ONLY: Partial<Controls> = { drumLevel: 0 }

test('default board makes sound (the toy chip demo tune)', () => {
  expect(rms(render({}, 1))).toBeGreaterThan(0.005)
})

test('starve reboots restart the tune', () => {
  const chain = buildChain(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...CHIP_ONLY,
    chipLevel: 1,
    chipStarve: 1,
  })
  const io = makeIo()
  let sawSilentBoot = false
  let sawSound = false
  for (let b = 0; b < Math.ceil((3 * SR) / BLOCK); b++) {
    chain.process(io, p)
    // the safety tail's dc blocker leaves a decaying residue, so "silent"
    // means below anything audible rather than exactly zero
    const peak = Math.max(...io.l.subarray(0, BLOCK).map(Math.abs))
    if (peak < 1e-9) sawSilentBoot = true
    else sawSound = true
  }
  expect(sawSound).toBe(true)
  expect(sawSilentBoot).toBe(true)
})

test('the auto bass-chord puts a bass under the tune', () => {
  // four poles at 160 Hz, steep enough to leave the melody's 220 Hz behind and
  // pass the accompaniment's bass an octave under it
  const lowEnd = (x: Float32Array) => {
    const a = Math.exp((-2 * Math.PI * 160) / SR)
    const z = [0, 0, 0, 0]
    const lp = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      let v = x[i]!
      for (let k = 0; k < z.length; k++) v = z[k] = z[k]! * a + v * (1 - a)
      lp[i] = v
    }
    return rms(lp)
  }
  const dry = render({ ...CHIP_ONLY, chipLevel: 0.6 }, 3)
  const backed = render({ ...CHIP_ONLY, chipLevel: 0.6, chipAccomp: 0.8 }, 3)
  expect(rms(backed)).toBeGreaterThan(rms(dry))
  expect(lowEnd(backed)).toBeGreaterThan(lowEnd(dry) * 2)
})

test('the accompaniment browns out with the chip it runs on', () => {
  // it is the same divider on the same rail, so a starved chip takes it down too
  const quietFraction = (x: Float32Array) =>
    x.reduce((a, v) => a + (Math.abs(v) < 0.01 ? 1 : 0), 0) / x.length
  const running = render({ ...CHIP_ONLY, chipLevel: 1, chipAccomp: 1 }, 3)
  const starved = render(
    { ...CHIP_ONLY, chipLevel: 1, chipAccomp: 1, chipStarve: 1 },
    3,
  )
  expect(quietFraction(starved)).toBeGreaterThan(quietFraction(running) * 2)
  expect(
    starved.reduce((a, v) => Math.max(a, Math.abs(v)), 0),
  ).toBeLessThanOrEqual(0.891 + 1e-6)
})

test('a chord sounds fuller than one note but nothing like four times louder', () => {
  const one = rms(playKeys({}, chip => chip.noteOn(0)))
  const four = rms(
    playKeys({}, chip => {
      for (const n of [0, 4, 7, 12]) chip.noteOn(n)
    }),
  )
  expect(four).toBeGreaterThan(one * 1.3)
  expect(four).toBeLessThan(one * 2.5)
})

test('a fifth note steals the oldest voice', () => {
  // Both takes end with the player holding only note 0. In the second, note 0's
  // voice went to the fifth note, so every voice is released and rings out.
  const script = (extra: number[]) => (chip: BuiltChain['toyChip']) => {
    for (const n of [0, 4, 7, 12, ...extra]) chip.noteOn(n)
    for (const n of [4, 7, 12, ...extra]) chip.noteOff(n)
  }
  const held = rms(tail(playKeys({}, script([]), 2), 0.1))
  const stolen = rms(tail(playKeys({}, script([16]), 2), 0.1))
  expect(held).toBeGreaterThan(0.05)
  expect(stolen).toBeLessThan(held * 0.1)
})

// Two octaves under the toy's own bottom key, which is as far down as the octave
// switch goes. Silence is a voice with its envelope down, so a semitone below
// zero is a note rather than the empty voice it used to read as.
test('the keys play under the chip’s own bottom note', () => {
  const note = (semitone: number) =>
    playKeys({ chipLevel: 0.9 }, chip => chip.noteOn(semitone), 0.3)
  expect(bin(note(0), 220)).toBeGreaterThan(0.01)
  expect(bin(note(-12), 110)).toBeGreaterThan(0.01)
  expect(bin(note(-12), 220)).toBeLessThan(0.5 * bin(note(-12), 110))
  expect(bin(note(-24), 55)).toBeGreaterThan(0.01)
  expect(bin(note(-24), 110)).toBeLessThan(0.5 * bin(note(-24), 55))
})

test('flat batteries run the tune low and late, and it keeps running', () => {
  // Pitch off a held key rather than off the tune. One oscillator does both
  // jobs, so flat cells slow the sequencer as well as dropping the note — and a
  // pitch read across a fixed window of a tune that is no longer keeping the
  // same time is reading two different bars, not two different pitches.
  const held = (o: Partial<Controls>) =>
    pitchHz(playKeys({ ...CHIP_ONLY, chipLevel: 1, ...o }, c => c.noteOn(0), 1))
  expect(held({ chipBattery: 0.5 })).toBeLessThan(held({}) * 0.9)

  const fresh = render({ ...CHIP_ONLY, chipLevel: 1 }, 3)
  const flat = render({ ...CHIP_ONLY, chipLevel: 1, chipBattery: 0.5 }, 3)
  // Half-dead cells drop the pitch; they don't stop the toy playing.
  expect(rms(flat)).toBeGreaterThan(rms(fresh) * 0.5)
})

test('narrow tone taps thin out and survive the divider running out of counts', () => {
  const square = rms(playKeys({ chipTone: 0 }, chip => chip.noteOn(0)))
  const buzz = rms(playKeys({ chipTone: 3 }, chip => chip.noteOn(0)))
  expect(buzz).toBeGreaterThan(0.01)
  expect(buzz).toBeLessThan(square * 0.8)

  // Clocked up past where a 1/16 tap fits between samples, it still sounds.
  const fast = rms(
    playKeys({ chipTone: 3, chipClockX: 16 }, chip => chip.noteOn(12)),
  )
  expect(fast).toBeGreaterThan(0.01)
})

// What the panel's keyboard lights up: the chip has to say which notes it is
// making a sound with, or a tune playing itself leaves the drawn board dark.
test('the chip reports the notes it is sounding', () => {
  const built = buildBender(SR)
  built.transport.tune = true
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...CHIP_ONLY,
    chipLevel: 1,
    chipAccomp: 1,
  })
  const io = makeIo()
  const out = new Int16Array(ToyChip.MAX_SOUNDING)
  const seen = new Set<number>()
  for (let b = 0; b < Math.ceil((2 * SR) / BLOCK); b++) {
    built.chain.process(io, p)
    for (const note of out.subarray(0, built.toyChip.soundingNotes(out)))
      seen.add(note)
  }
  // Two seconds of the demo tune is several steps of melody with the oom-pah
  // walking under it, so the board is never lit by one note alone.
  expect(seen.size).toBeGreaterThan(3)
})

test('a struck key is sounding until it decays, and a silent chip reports none', () => {
  const built = buildBender(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, ...CHIP_ONLY, chipLevel: 1 })
  const io = makeIo()
  const out = new Int16Array(ToyChip.MAX_SOUNDING)
  const sounding = () =>
    [...out.subarray(0, built.toyChip.soundingNotes(out))] as number[]

  // The transport is stopped, so nothing but the key is playing.
  built.chain.process(io, p)
  expect(sounding()).toEqual([])

  built.toyChip.noteOn(7)
  built.chain.process(io, p)
  expect(sounding()).toEqual([7])

  // Let go, the voice decays on the tune's own clock rather than stopping, so
  // the key stays lit for as long as it is still making a sound.
  built.toyChip.noteOff(7)
  built.chain.process(io, p)
  expect(sounding()).toEqual([7])

  for (let b = 0; b < Math.ceil((4 * SR) / BLOCK); b++)
    built.chain.process(io, p)
  expect(sounding()).toEqual([])
})

// The memory is a tune like any other once it is in there: the chip plays it off
// the same counter, at the rate its own knob says rather than a ROM's.
test('the chip plays the melody you played into it', () => {
  const held = (note: number) =>
    pitchHz(
      render(
        {
          ...CHIP_ONLY,
          chipLevel: 1,
          chipTune: YOURS,
          tuneRate: 0.5,
          ...memory({ 0: note, 1: HOLD, 2: HOLD, 3: HOLD }),
        },
        1,
      ),
    )
  // An octave apart in the memory is an octave apart out of the speaker.
  expect(held(12)).toBeGreaterThan(held(0) * 1.8)
  expect(held(12)).toBeLessThan(held(0) * 2.2)
})

// An empty memory is a memory, not a fault: the counter clocks through sixteen
// rests and the chip sits there, the way it does under a ROM's rests.
test('an empty memory plays nothing and breaks nothing', () => {
  const out = render(
    { ...CHIP_ONLY, chipLevel: 1, chipTune: YOURS, ...memory({}) },
    0.5,
  )
  expect(rms(out)).toBeLessThan(1e-6)
  expect(out.every(Number.isFinite)).toBe(true)
})

// The memory reaches under the chip's own bottom A, where a ROM never went —
// the drawn keyboard starts nine semitones below it. A note down there has to
// come out as a low note rather than as one of the two codes that are not notes.
test('the memory holds notes under the chip’s bottom A', () => {
  const low = pitchHz(
    render(
      {
        ...CHIP_ONLY,
        chipLevel: 1,
        chipTune: YOURS,
        tuneRate: 0.5,
        ...memory({ 0: -12, 1: HOLD, 2: HOLD, 3: HOLD }),
      },
      1,
    ),
  )
  expect(low).toBeGreaterThan(80)
  expect(low).toBeLessThan(140)
})

// Same six wires, same knife. What separates a bus fault from every other bend
// on the board is that it leaves the chip working perfectly and changes what it
// is told — so your tune comes out wrong in time, rather than not at all.
test('the knife on the ROM bus reaches your tune too', () => {
  // Long enough at this rate for the whole sixteen to come round twice.
  const song = { ...CHIP_ONLY, chipLevel: 1, chipTune: YOURS, tuneRate: 16 }
  const notes = memory({ 0: 0, 4: 7, 8: 12, 12: 7 })
  const clean = render({ ...song, ...notes }, 2)
  const cut = render(
    { ...song, ...notes, chipDataLine: 3, chipDataFault: 2 },
    2,
  )
  expect(rms(cut)).toBeGreaterThan(0)
  expect(deviation(cut, clean)).toBeGreaterThan(0.05)
})
