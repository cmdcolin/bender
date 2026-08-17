import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { buildChain, type BuiltChain } from '../build'
import { BLOCK } from '../stage'
import {
  bin,
  makeIo,
  pitchHz,
  playKeys,
  render,
  rms,
  SR,
  tail,
} from '../testRender'

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

// An octave under the toy's own bottom key. Silence is a voice with its envelope
// down, so a semitone below zero is a note rather than the empty voice it used to
// read as.
test('the keys play under the chip’s own bottom note', () => {
  const note = (semitone: number) =>
    playKeys({ chipLevel: 0.9 }, chip => chip.noteOn(semitone), 0.3)
  expect(bin(note(0), 220)).toBeGreaterThan(0.01)
  expect(bin(note(-12), 110)).toBeGreaterThan(0.01)
  expect(bin(note(-12), 220)).toBeLessThan(0.5 * bin(note(-12), 110))
})

test('flat batteries run the tune low, and it keeps running', () => {
  const fresh = render({ ...CHIP_ONLY, chipLevel: 1 }, 3)
  const flat = render({ ...CHIP_ONLY, chipLevel: 1, chipBattery: 0.5 }, 3)
  expect(pitchHz(flat)).toBeLessThan(pitchHz(fresh) * 0.9)
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
