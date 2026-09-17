import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { buildBender, type BuiltChain } from '../build'
import { FAULT } from '../bus'
import { BLOCK } from '../stage'
import { bin, makeIo, rms, sine, SR, tail } from '../testRender'
import {
  buildPcmRom,
  noteHz,
  PCM_VOICE_NAMES,
  rateReg,
  regHz,
  SAMPLED,
} from './pcmRom'

const voice = (name: string) => PCM_VOICE_NAMES.indexOf(name)
const ORGAN = 1

// The keyboard on its own: nothing else in the mix, so what comes out of the
// board is what came out of this chip.
const ALONE: Partial<Controls> = {
  pcmLevel: 0.9,
  pcmVoice: voice('flute'),
  pcmEnv: ORGAN,
  chipLevel: 0,
  drumLevel: 0,
}

function play(
  overrides: Partial<Controls>,
  seconds: number,
  script?: (b: BuiltChain) => void,
) {
  const built = buildBender(SR)
  script?.(built)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    built.chain.process(io, p)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return { out, built }
}

const held = (overrides: Partial<Controls>, note = 12, seconds = 0.4) =>
  play({ ...ALONE, ...overrides }, seconds, b => b.pcmKeys.noteOn(note)).out

/** Where the strongest partial sits across a stretch of the spectrum. */
function peakIn(x: Float32Array, lo: number, hi: number, step = 0.5): number {
  let best = 0
  let at = lo
  for (let hz = lo; hz <= hi; hz += step) {
    const v = bin(x, hz)
    if (v > best) {
      best = v
      at = hz
    }
  }
  return at
}

const peakNear = (x: Float32Array, want: number) =>
  peakIn(x, want * 0.88, want * 1.12)

// The register is a divider rather than a frequency, which is the whole of why
// a keyboard like this is dead in tune at the bottom and sharp at the top: a
// step of one is worth a fraction of a cent down where the number is four
// thousand and a sixth of a semitone up where it is under a hundred.
test('the rate register quantises the top of the keyboard and not the bottom', () => {
  const cents = (note: number) => {
    const reg = rateReg(noteHz(note))
    return Math.abs(1200 * Math.log2(regHz(reg) / noteHz(note)))
  }
  const worst = (from: number, to: number) => {
    let most = 0
    for (let n = from; n <= to; n++) most = Math.max(most, cents(n))
    return most
  }
  expect(worst(-24, -13)).toBeLessThan(1)
  expect(worst(36, 47)).toBeGreaterThan(3)
  // And still a keyboard: nowhere on it is a note out by a quarter tone.
  expect(worst(-24, 47)).toBeLessThan(50)
})

test('a held note comes out where its rate register puts it', () => {
  const note = 12
  const want = regHz(rateReg(noteHz(note)))
  const x = tail(held({}, note, 0.6), 0.4)
  // The bin's own resolution over the window, which is coarser than anything
  // the register does at this end of the board.
  expect(Math.abs(peakNear(x, want) - want)).toBeLessThan(4)
})

// The seam is what makes a ROM voice hold rather than tick once a lap. Every
// partial runs a whole number of cycles over the loop, so the word after the
// last one in it is the first one in it — which means the step across the seam
// can be no bigger than the biggest step inside the loop.
test('every voice in the ROM loops without a step in it', () => {
  for (const wave of buildPcmRom()) {
    let inside = 0
    for (let i = wave.loopStart + 1; i < wave.loopEnd; i++) {
      inside = Math.max(inside, Math.abs(wave.data[i]! - wave.data[i - 1]!))
    }
    const seam = Math.abs(
      wave.data[wave.loopStart]! - wave.data[wave.loopEnd - 1]!,
    )
    expect(seam, wave.name).toBeLessThanOrEqual(inside)
    // And a loop worth having: a run of identical words is a voice that was
    // cut wrong rather than one that holds still.
    expect(inside, wave.name).toBeGreaterThan(0)
  }
})

test('a fifth note steals the oldest of the four', () => {
  const out = new Int16Array(8)
  const { built } = play(ALONE, 0.1, b => {
    for (const note of [0, 4, 7, 11, 14]) b.pcmKeys.noteOn(note)
  })
  const n = built.pcmKeys.soundingNotes(out)
  expect(n).toBe(4)
  expect([...out.subarray(0, n)].toSorted((a, b) => a - b)).toEqual([
    4, 7, 11, 14,
  ])
})

test('the chord button fills the part from one key', () => {
  const out = new Int16Array(8)
  const { built } = play({ ...ALONE, pcmChord: 1 }, 0.1, b =>
    b.pcmKeys.noteOn(0),
  )
  // maj7 is four notes and the chip has four voices, so one key is the whole
  // instrument.
  expect(built.pcmKeys.soundingNotes(out)).toBe(4)
  expect([...out.subarray(0, 4)].toSorted((a, b) => a - b)).toEqual([
    0, 4, 7, 11,
  ])
})

// The counter clocks off the divider everything else on this board does, so a
// supply the toy is pulling down takes the keyboard with it.
test('a starving rail drags the keyboard down with the toy', () => {
  const note = 12
  const want = regHz(rateReg(noteHz(note)))
  const fed = tail(held({ chipLevel: 0.6 }, note, 0.6), 0.3)
  const starved = tail(
    held({ chipLevel: 0.6, chipStarve: 0.5 }, note, 0.6),
    0.3,
  )
  expect(peakIn(fed, want * 0.5, want * 1.1, 1)).toBeCloseTo(want, -1)
  // A fifth of the way down, not a cent: the counter is the pitch on this part.
  expect(peakIn(starved, want * 0.5, want * 1.1, 1)).toBeLessThan(want * 0.8)
})

test('a data line on the rail changes every word, and a trace that still conducts changes none', () => {
  const plain = held({}, 12, 0.3)
  const knifed = held({ pcmDataLine: 7, pcmDataFault: FAULT.supply }, 12, 0.3)
  expect(rms(plain.map((v, i) => v - knifed[i]!))).toBeGreaterThan(
    0.05 * rms(plain),
  )
  // Cut all the way through is a pin nobody drives; cut none of the way is a
  // trace, and a trace reads what it always read.
  const whole = held(
    { pcmDataLine: 7, pcmDataFault: FAULT.cut, pcmBusCut: 0 },
    12,
    0.3,
  )
  expect(whole).toEqual(plain)
})

test('an address fault folds the voice without moving the note', () => {
  const plain = held({ pcmVoice: voice('strings') }, 12, 0.3)
  const folded = held(
    {
      pcmVoice: voice('strings'),
      pcmAddrLine: 12,
      pcmAddrFault: FAULT.ground,
    },
    12,
    0.3,
  )
  expect(rms(plain.map((v, i) => v - folded[i]!))).toBeGreaterThan(
    0.05 * rms(plain),
  )
})

test('the sampled voice plays the reel, and nothing at all without one', () => {
  const bare = held({ pcmVoice: SAMPLED }, 0, 0.3)
  expect(rms(bare)).toBeLessThan(1e-6)
  const loaded = play({ ...ALONE, pcmVoice: SAMPLED }, 0.3, b => {
    b.sampler.setBuffer(sine(300, 2))
    b.pcmKeys.noteOn(0)
  }).out
  expect(rms(loaded)).toBeGreaterThan(0.01)
})

// The jumper, which is why the keyboard makes a sound on a board nobody has
// touched: the toy's gate line is soldered onto its key input the same way it
// is onto the FM chip's.
test('the toy gate plays the keyboard, and cutting it stops', () => {
  const song: Partial<Controls> = {
    ...ALONE,
    chipLevel: 0,
    pcmEnv: 0,
    chipClockX: 4,
  }
  const run = (over: Partial<Controls>) =>
    play({ ...song, ...over }, 0.5, b => {
      b.transport.tune = true
    }).out
  const soldered = run({})
  const cut = run({ pcmKeyGate: 1 })
  expect(rms(soldered)).toBeGreaterThan(0.01)
  expect(rms(cut)).toBeLessThan(1e-6)
})

test('nothing on the keyboard can be made to put out something that is not a number', () => {
  const knobs: (keyof Controls)[] = [
    'pcmLevel',
    'pcmVoice',
    'pcmEnv',
    'pcmRelease',
    'pcmTone',
    'pcmVibrato',
    'pcmChord',
    'pcmClockX',
    'pcmStruck',
    'pcmKeyGate',
    'pcmAddrLine',
    'pcmAddrFault',
    'pcmDataLine',
    'pcmDataFault',
    'pcmBusCut',
  ]
  for (const key of knobs) {
    for (const at of [0, 0.5, 1]) {
      const def = DEFAULT_CONTROLS[key]
      const over: Partial<Controls> = {
        ...ALONE,
        pcmClockX: 16,
        [key]: at === 0.5 ? def : at === 0 ? 0 : 16,
      }
      const x = held(over, 24, 0.12)
      expect(x.every(Number.isFinite), `${key} at ${at}`).toBe(true)
    }
  }
})
