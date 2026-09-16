import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildBender } from './build'
import { DEST, hop } from './modbus'
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

// Dry level at zero solos the springs, so the chip playing underneath stays out
// of the tail this measures.
test('a wire on the tank stretches how long it rings', () => {
  const wet: Partial<Controls> = {
    chipLevel: 0.8,
    revDecayS: 0.3,
    revMix: 1,
    revDry: 0,
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

test('and the delay pedal answers a wire of its own', () => {
  const pedal: Partial<Controls> = {
    chipLevel: 0.8,
    echoMs: 350,
    echoFb: 0.6,
    echoLevel: 1,
  }
  const wired = render(
    { ...pedal, bodyX: 1, mod0Src: 5, mod0Dest: DEST.echoMs, mod0Depth: 1 },
    2,
  )
  const byHand = render({ ...pedal, echoMs: 1400 }, 2)
  const diff = wired.map((v, i) => v - byHand[i]!)
  expect(rms(diff)).toBeLessThan(0.01 * rms(byHand))
})

// The four depth lanes used to be the last ids on the bus, and that was how the
// bay knew one when it saw one. They have a stage sitting past them now, so this
// is the half of that which the board can hear: a wire landing on a depth lane
// has to stay inside the bay rather than being handed to a stage.
test('a wire onto another wire’s depth still lands in the bay', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.8,
    bendSlot0: 6,
    filtHz: 200,
    filtRes: 0.4,
    filtMix: 1,
    bodyX: 1,
    bodyY: 1,
  }
  const byHand = render(
    { ...look, mod0Src: 5, mod0Dest: DEST.filtHz, mod0Depth: 1 },
    0.5,
  )
  // The same push, except that the depth it pushes at is the other wire's doing.
  const byWire = render(
    {
      ...look,
      mod0Src: 5,
      mod0Dest: DEST.filtHz,
      mod0Depth: 0,
      mod1Src: 6,
      mod1Dest: DEST.wDepth0,
      mod1Depth: 1,
    },
    0.5,
  )
  expect(byWire).toEqual(byHand)
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

test('a wire on a fader shuts that channel and leaves the rest of the bus alone', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.6,
    noiseLevel: 0.5,
    bodyX: 1,
    mod0Dest: DEST.noiseLevel,
    mod0Depth: -1,
  }
  expect(render({ ...look, mod0Src: 5 }, 1)).toEqual(
    render({ ...look, noiseLevel: 0 }, 1),
  )
})

test('and pushed the other way it lifts the channel over its fader', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    noiseLevel: 0.3,
    bodyX: 1,
    mod0Dest: DEST.noiseLevel,
    mod0Depth: 1,
  }
  expect(rms(render({ ...look, mod0Src: 5 }, 1))).toBeGreaterThan(
    1.6 * rms(render(look, 1)),
  )
})

test('a wire on the resonance takes the filter into self-oscillation', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    crackleAmp: 0.2,
    bendSlot0: 6,
    filtMix: 1,
    filtHz: 800,
    filtRes: 0.2,
    bodyX: 1,
    mod0Dest: DEST.filtRes,
    mod0Depth: 1,
  }
  const tame = render(look, 1)
  const screaming = render({ ...look, mod0Src: 5 }, 1)
  const byHand = render({ ...look, filtRes: 1.3 }, 1)
  expect(rms(tail(screaming))).toBeGreaterThan(3 * rms(tail(tame)))
  expect(pitchHz(tail(screaming))).toBeCloseTo(pitchHz(tail(byHand)), -1)
})

test('a held wire on the loop time is the same squeal as turning the knob there', () => {
  const desk: Partial<Controls> = {
    chipLevel: 0,
    crackleAmp: 0.2,
    fbAmt: 1.4,
    fbDelayMs: 5,
    fbTone: 0.3,
    bodyX: 1,
    mod0Dest: DEST.fbMs,
    mod0Depth: 0.5,
  }
  // Half depth is an octave of time: 5 ms becomes 10.
  const wired = pitchHz(tail(render({ ...desk, mod0Src: 5 }, 2)))
  const byHand = pitchHz(tail(render({ ...desk, fbDelayMs: 10 }, 2)))
  const stock = pitchHz(tail(render(desk, 2)))
  expect(wired).toBeCloseTo(byHand, -1)
  expect(Math.abs(wired - stock)).toBeGreaterThan(0.1 * stock)
})

test('a selector lane wraps round the list either way', () => {
  const lane = (v: number) => Float32Array.of(v)
  expect(hop(2, 5, null)).toBe(2)
  expect(hop(2, 5, lane(0.2))).toBe(3)
  expect(hop(2, 5, lane(1))).toBe(2)
  expect(hop(4, 5, lane(0.4))).toBe(1)
  expect(hop(0, 5, lane(-0.2))).toBe(4)
})

// Nine choices on the FM chip's data line, so a third of a push is three steps:
// from off to D2.
test.each([
  {
    chip: 'FM data line',
    board: { chipLevel: 0, drumLevel: 0, fmLevel: 0.8, fmDataFault: 1 },
    dest: DEST.fmDataLine,
    depth: 0.34,
    byHand: { fmDataLine: 3 },
  },
  {
    chip: 'toy data fault',
    board: { chipLevel: 0.8, chipDataLine: 2 },
    dest: DEST.chipDataFault,
    depth: 0.5,
    byHand: { chipDataFault: 2 },
  },
  {
    chip: 'kit addr line',
    board: {
      chipLevel: 0,
      drumLevel: 0.9,
      drumBpm: 120,
      drumKick: 0b1000_1000_1000_1000,
      drumAddrFault: 2,
    },
    dest: DEST.drumAddrLine,
    depth: 0.2,
    byHand: { drumAddrLine: 1 },
  },
] satisfies {
  chip: string
  board: Partial<Controls>
  dest: number
  depth: number
  byHand: Partial<Controls>
}[])(
  'a held wire on the $chip is the knife moved there by hand',
  ({ board, dest, depth, byHand }) => {
    const wired = render(
      { ...board, bodyX: 1, mod0Src: 5, mod0Dest: dest, mod0Depth: depth },
      1,
    )
    const clean = render(board, 1)
    expect(wired).not.toEqual(clean)
    expect(wired).toEqual(render({ ...board, ...byHand }, 1))
  },
)

test('an S&H on a line cuts a different wire as it goes', () => {
  const fm: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0,
    fmLevel: 0.8,
    fmDataFault: 1,
  }
  const hopping = render(
    {
      ...fm,
      modLfoHz: 8,
      modLfoShape: 3,
      mod0Src: 1,
      mod0Dest: DEST.fmDataLine,
      mod0Depth: 1,
    },
    2,
  )
  for (let line = 0; line <= 8; line++) {
    expect(hopping).not.toEqual(render({ ...fm, fmDataLine: line }, 2))
  }
})
