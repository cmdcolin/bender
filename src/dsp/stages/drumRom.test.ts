import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { buildBender } from '../build'
import { BLOCK } from '../stage'
import {
  envelope,
  makeIo,
  pitchHz,
  render,
  renderBender,
  rms,
  SR,
  stepMask,
} from '../testRender'
import { kitRom, ROM_BITS, ROM_RATE, ROM_SECS } from './toyDrum'

// One voice alone on an empty grid, off whichever kit the switch is on.
const solo = (overrides: Partial<Controls>, seconds = 0.5) =>
  render(
    {
      chipLevel: 0,
      drumLevel: 1,
      drumBpm: 240,
      drumKick: 0,
      drumSnare: 0,
      drumHat: 0,
      ...overrides,
    },
    seconds,
  )

// One hit by hand with the sequencer stopped, so what follows is the slab and
// nothing else — which is what the length and the pitch of one have to be read
// off, since a pattern's second hit is what an envelope measure finds otherwise.
const struck = (voice: number, overrides: Partial<Controls>, seconds: number) =>
  renderBender(
    { chipLevel: 0, drumLevel: 1, drumRom: 1, ...overrides },
    seconds,
    b => b.toyDrum.strike(1 << voice, 1),
  )

const KICK = 0
const SNARE = 1

const SAMPLED: Partial<Controls> = { drumRom: 1 }

// The front of a take, where both a slab and a slab read at half speed are
// still playing. Pitch has to be read here rather than over the whole thing:
// halving the clock halves the pitch and doubles the length, so the number of
// cycles in a fixed window is the one thing that does not move.
const early = (x: Float32Array) => x.subarray(0, Math.round(0.4 * SR))

// Where the take stops carrying anything, as a fraction of how long it is.
const ends = (x: Float32Array) => {
  const peak = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0)
  let last = 0
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > peak * 0.02) last = i
  return last / x.length
}

test('the kit files one slab a voice, at the length each was given', () => {
  const rom = kitRom()
  expect(rom).toHaveLength(ROM_SECS.length)
  expect(rom.map(s => s.length)).toEqual(
    ROM_SECS.map(s => Math.round(s * ROM_RATE)),
  )
})

// Twelve bits is what the slab is, not what the converter behind it makes of
// it: the kit's own ladder is downstream and narrower, and a slab that arrived
// already on its grid would have nothing left for it to do.
test('every sample in the ROM sits on the twelve-bit grid', () => {
  const q = 1 << (ROM_BITS - 1)
  for (const [v, slab] of kitRom().entries()) {
    const off = slab.filter(x => Math.abs(x * q - Math.round(x * q)) > 1e-9)
    expect(off.length, `voice ${v}`).toBe(0)
  }
})

test('a slab carries the voice it was cut from, not silence', () => {
  for (const [v, slab] of kitRom().entries()) {
    expect(rms(slab), `voice ${v}`).toBeGreaterThan(0.005)
  }
})

// The point of cutting the ROM through the circuits rather than drawing it: at
// the settings the kit ships with, the two kits are the same kick.
test('the sampled kick is the kick it was cut from', () => {
  const hit: Partial<Controls> = { drumKick: stepMask(2), drumBpm: 60 }
  const analog = solo(hit, 1)
  const sampled = solo({ ...hit, ...SAMPLED }, 1)
  expect(pitchHz(sampled)).toBeCloseTo(pitchHz(analog), -0.5)
  expect(rms(sampled)).toBeGreaterThan(rms(analog) * 0.5)
  expect(rms(sampled)).toBeLessThan(rms(analog) * 2)
  const a = envelope(analog)
  const b = envelope(sampled)
  const peak = a.reduce((m, v) => Math.max(m, v), 0)
  for (const [i, v] of a.entries()) {
    expect(Math.abs(b[i]! - v), `window ${i}`).toBeLessThan(peak * 0.5)
  }
})

// The switch is on the output stage and nowhere else, so the sequencer, the
// one-shots and the trigger bus do what they always did — block for block.
test('the two kits keep the same time and fire the same voices', () => {
  const run = (over: Partial<Controls>) => {
    const built = buildBender(SR, 3)
    built.transport.drums = true
    const p = packParams({ ...DEFAULT_CONTROLS, chipLevel: 0, ...over })
    const io = makeIo()
    const log: string[] = []
    for (let b = 0; b < (3 * SR) / BLOCK; b++) {
      built.chain.process(io, p)
      log.push(`${built.toyDrum.tick}:${built.toyDrum.takeFired()}`)
    }
    return log
  }
  expect(run(SAMPLED)).toEqual(run({}))
})

// One knob for the pitch and the length, because on a recording they are one
// fact. Halving the clock is an octave down and twice as long.
test('halving the ROM clock drops the kick an octave and doubles its length', () => {
  const stock = struck(KICK, {}, 1.6)
  const half = struck(KICK, { drumRomHz: ROM_RATE / 2 }, 1.6)
  expect(pitchHz(early(half))).toBeLessThan(pitchHz(early(stock)) * 0.6)
  expect(pitchHz(early(half))).toBeGreaterThan(pitchHz(early(stock)) * 0.4)
  expect(ends(half)).toBeGreaterThan(ends(stock) * 1.7)
})

// Decay is the other knob those boxes had. There is no envelope to stretch on a
// recording, so under 1x it truncates instead.
test('Decay truncates the sampled snare rather than choking it', () => {
  const whole = struck(SNARE, {}, 0.6)
  const cut = struck(SNARE, { drumDecay: 0.25 }, 0.6)
  expect(ends(cut)).toBeLessThan(ends(whole) * 0.6)
  expect(rms(cut)).toBeLessThan(rms(whole))
  expect(rms(cut)).toBeGreaterThan(0.001)
})

// A slab has no envelope to drain, so the pedal had to be given something to
// drain instead — and it is still a pedal rather than a mute.
test('a hat step still cuts a ringing sampled open hat short', () => {
  const open: Partial<Controls> = {
    ...SAMPLED,
    drumOpen: stepMask(2),
    drumBpm: 120,
  }
  const ringing = solo(open, 1.2)
  const choked = solo({ ...open, drumHat: stepMask(4) }, 1.2)
  const tail = (x: Float32Array) => rms(x.subarray(Math.round(0.7 * SR)))
  expect(tail(choked)).toBeLessThan(tail(ringing) * 0.5)
})

// The slab rides the same supply as everything else the chip counts: flat cells
// drag the playback clock down with the tempo.
test('a sagging rail reads the slab slower', () => {
  const slow: Partial<Controls> = { drumRomHz: 14000 }
  const fresh = struck(KICK, slow, 1.6)
  const flat = struck(KICK, { ...slow, chipBattery: 0.8 }, 1.6)
  expect(pitchHz(early(flat))).toBeLessThan(pitchHz(early(fresh)) * 0.95)
  expect(ends(flat)).toBeGreaterThan(ends(fresh) * 1.05)
})

// The two keys go through the same sweep the rest of the drums group does.
test('nothing the two new knobs can be set to leaves anything non-finite', () => {
  for (const rom of [0, 1]) {
    for (const hz of [8000, 12000, ROM_RATE, 44100]) {
      for (const decay of [0.25, 1, 16]) {
        const x = solo(
          {
            drumRom: rom,
            drumRomHz: hz,
            drumDecay: decay,
            drumTune: 8,
            drumKick: stepMask(2),
            drumOpen: stepMask(2),
            drumCym: stepMask(2),
            drumAccent: stepMask(2),
            drumChoke: 5,
            drumCross: 5,
            drumBpm: 600,
          },
          0.4,
        )
        expect(x.every(Number.isFinite), `${rom}/${hz}/${decay}`).toBe(true)
      }
    }
  }
})
