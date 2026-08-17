import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildBender } from './build'
import { DEST } from './modbus'
import { BLOCK } from './stage'
import { makeIo, pitchHz, render, rms, SR, tail } from './testRender'

// How many times the watchdog tripped over `seconds` of a board — the supply is
// the one thing a wire can reach that has a counter on it.
function reboots(overrides: Partial<Controls>, seconds: number): number {
  const built = buildBender(SR)
  built.transport.tune = true
  built.transport.drums = true
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  for (let b = 0; b < Math.ceil((seconds * SR) / BLOCK); b++) {
    built.chain.process(io, p)
  }
  return built.rail.rebootCount
}

test('a wire soldered to nothing changes nothing', () => {
  const base: Partial<Controls> = { chipLevel: 0.6, filtMix: 1, filtRes: 1.1 }
  const a = render(base, 1)
  const b = render({ ...base, mod0Depth: 1, bodyX: 0.8, modLfoHz: 6 }, 1)
  expect(a).toEqual(b)
})

test('the body pad moves the filter once a wire lands on it', () => {
  const base: Partial<Controls> = {
    chipLevel: 0.6,
    bendSlot0: 6,
    filtMix: 1,
    filtRes: 1.1,
    filtHz: 500,
    bodyX: 0.9,
    mod0Dest: 0,
    mod0Depth: 1,
  }
  const unwired = render(base, 1)
  const wired = render({ ...base, mod0Src: 5 }, 1)
  expect(wired).not.toEqual(unwired)
  expect(pitchHz(tail(wired))).toBeGreaterThan(pitchHz(tail(unwired)))
})

test('a wire off the trigger line pushes what it is soldered to', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.9,
    drumBpm: 120,
    drumKick: 0,
    drumSnare: 0,
    drumHat: 0b1000_1000_1000_1000,
    filtHz: 200,
    filtRes: 0.4,
    filtMix: 1,
    bendSlot0: 6,
    mod0Dest: DEST.filtHz,
    mod0Depth: 1,
  }
  // The hats are noise, and the filter is shut down where none of it lives —
  // until each hit throws the cutoff four octaves up and lets it fall back.
  const shut = render(look, 1)
  const opened = render({ ...look, mod0Src: 9 }, 1)
  expect(rms(opened)).toBeGreaterThan(3 * rms(shut))
})

test('a ROM step wire rides the sequencer, pushing the clock as each step runs', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.8,
    mod0Dest: DEST.chipClock,
    mod0Depth: 0.6,
  }
  const plain = render(look, 2)
  const wired = render({ ...look, mod0Src: 8 }, 2)
  expect(wired).not.toEqual(plain)
  expect(pitchHz(tail(wired, 1))).toBeGreaterThan(pitchHz(tail(plain, 1)))
})

test('a wire off the kit onto the supply browns the toy out on every hit', () => {
  const look: Partial<Controls> = {
    chipLevel: 1,
    drumLevel: 0.3,
    drumBpm: 120,
    drumKick: 0b1000_1000_1000_1000,
    mod0Dest: DEST.starve,
    mod0Depth: 1,
  }
  // Starve itself never leaves zero: the kick is what dies the rail, and the
  // watchdog is what it costs.
  expect(reboots(look, 3)).toBe(0)
  expect(reboots({ ...look, mod0Src: 9 }, 3)).toBeGreaterThan(1)
})

test('a wire on the kit’s trimmer moves every voice together', () => {
  const kit: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.9,
    drumBpm: 120,
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0,
    drumHat: 0,
    bodyX: 1,
    mod0Dest: DEST.drumTune,
    mod0Depth: 0.5,
  }
  const stock = render(kit, 2)
  const lifted = render({ ...kit, mod0Src: 5 }, 2)
  // Body X held at 1 is an octave of trimmer, so the kick counts twice as fast.
  expect(pitchHz(lifted)).toBeGreaterThan(1.6 * pitchHz(stock))
})

test('a wire on the tank stretches how long it rings', () => {
  const wet: Partial<Controls> = {
    chipLevel: 0.8,
    revDecayS: 0.3,
    revMix: 1,
    bodyX: 1,
    mod0Dest: DEST.revDecay,
    mod0Depth: 1,
  }
  const dead = render(wet, 2)
  const ringing = render({ ...wet, mod0Src: 5 }, 2)
  expect(rms(tail(ringing))).toBeGreaterThan(1.3 * rms(tail(dead)))
})

test('a held wire on the delay time is the same as turning the knob there', () => {
  const echo: Partial<Controls> = {
    chipLevel: 0.8,
    delayMs: 350,
    dlyFb: 0.6,
    dlyMix: 1,
  }
  const wired = render(
    { ...echo, bodyX: 1, mod0Src: 5, mod0Dest: DEST.delayMs, mod0Depth: 1 },
    2,
  )
  // Two octaves of time at full depth: 350 ms becomes 1.4 s, and a body pad
  // parked at 1 is a knob that isn't moving.
  const byHand = render({ ...echo, delayMs: 1400 }, 2)
  const diff = wired.map((v, i) => v - byHand[i]!)
  expect(rms(diff)).toBeLessThan(0.01 * rms(byHand))
})

test('every wire in the bay is the same wire', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.8,
    bendSlot0: 6,
    filtHz: 200,
    filtRes: 0.4,
    filtMix: 1,
    bodyX: 1,
  }
  // Four wires, one at a time, each soldered from the pad onto the cutoff. Which
  // lane the bay resolves it on is not a thing the board can hear.
  const [first, ...rest] = [0, 1, 2, 3].map(i =>
    render(
      {
        ...look,
        [`mod${i}Src`]: 5,
        [`mod${i}Dest`]: DEST.filtHz,
        [`mod${i}Depth`]: 1,
      },
      0.5,
    ),
  )
  for (const out of rest) expect(out).toEqual(first)
})
