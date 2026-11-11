import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import {
  ALLOPHONES,
  PHRASE_KEYS,
  type Allophone,
  PHRASE_LEN,
  phraseText,
  textToPhrase,
} from '../../prattle.ts'
import { buildBender } from '../build.ts'
import { spectrum } from '../spectrum.ts'
import {
  bin,
  envelope,
  render,
  renderBender,
  rms,
  SR,
  stepMask,
} from '../testRender.ts'
import { FRAME_DIVS, SING_FROM } from './prattle.ts'
import { CHIP_HZ, N_K, ROM, stepUp } from './prattleRom.ts'

const phrase = (text: string): Partial<Controls> =>
  Object.fromEntries(
    textToPhrase(text).map((c, i): [string, number] => [
      PHRASE_KEYS[i] ?? '',
      c,
    ]),
  )

const QUIET = { chipLevel: 0, drumLevel: 0 }

const speak = (text: string, extra: Partial<Controls>, seconds: number) =>
  renderBender(
    { ...QUIET, talkLevel: 1, ...phrase(text), ...extra },
    seconds,
    built => built.prattle.say(),
  )

function envelopeAt(k: number[], hz: number) {
  let re = 0
  let im = 0
  stepUp(k).forEach((a, j) => {
    re += a * Math.cos((2 * Math.PI * hz * j) / CHIP_HZ)
    im -= a * Math.sin((2 * Math.PI * hz * j) / CHIP_HZ)
  })
  return 1 / Math.hypot(re, im)
}

function peaks(k: number[]) {
  const out: number[] = []
  for (let hz = 20; hz < 3900; hz += 10) {
    const here = envelopeAt(k, hz)
    if (here > envelopeAt(k, hz - 10) && here > envelopeAt(k, hz + 10))
      out.push(hz)
  }
  return out
}

test('voiced frames, once quantised, show formant peaks near their targets', () => {
  const vowels: Allophone[] = ['IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'UW', 'ER']
  for (const name of vowels) {
    const a = ALLOPHONES.indexOf(name)
    const f = ROM.start[a]! + 1
    const k = Array.from(
      { length: N_K },
      (_, s) => ROM.kTable[s]![ROM.frameK[f * N_K + s]!]!,
    )
    const found = peaks(k)
    for (const [target] of ROM.targets[f]!.poles.slice(0, 3)) {
      const near = Math.min(...found.map(hz => Math.abs(hz - target)))
      expect(near, `${name} ${target} Hz in ${found.join(', ')}`).toBeLessThan(
        Math.max(target * 0.08, 40),
      )
    }
  }
})

// Held on its first voiced frame, the chip sings that vowel for as long as it
// is left, so its spectrum can be read off the output.
const vowelBands = (word: string) => {
  const x = speak(word, { talkFrameDiv: 9 }, 1).subarray(SR * 0.3)
  const band = (lo: number, hi: number) => {
    let e = 0
    for (let hz = lo; hz < hi; hz += 25) e += bin(x, hz) ** 2
    return e
  }
  return band(2000, 2500) / band(900, 1300)
}

test('the lattice puts a front vowel’s second formant high and a back vowel’s low', () => {
  expect(vowelBands('see')).toBeGreaterThan(vowelBands('on') * 10)
})

test('a coefficient pushed past one howls, bounded and finite', () => {
  for (const fault of [
    { talkDataLine: 11, talkDataFault: 2 },
    { talkDataLine: 12, talkDataFault: 1 },
    { talkAddrLine: 9, talkAddrFault: 2 },
    { talkDataLine: 11, talkDataFault: 0, talkBusCut: 0.97 },
  ]) {
    const x = speak('kill the bass', { talkRepeat: 1, ...fault }, 2)
    let peak = 0
    for (const v of x) {
      expect(Number.isFinite(v)).toBe(true)
      peak = Math.max(peak, Math.abs(v))
    }
    expect(peak).toBeLessThanOrEqual(1)
    expect(rms(x)).toBeGreaterThan(rms(speak('kill the bass', {}, 2)))
  }
})

const bounded = (x: Float32Array) =>
  x.every(v => Number.isFinite(v) && Math.abs(v) <= 1)

test('a slipping coefficient stack moves the formants and leaves the level alone', () => {
  const stock = speak('kill the bass', { talkRepeat: 1 }, 4)
  const slipped = speak('kill the bass', { talkRepeat: 1, talkStackSlip: 1 }, 4)
  expect(bounded(slipped)).toBe(true)
  expect(spectrum(slipped, SR).centroid).toBeLessThan(
    0.85 * spectrum(stock, SR).centroid,
  )
  expect(rms(slipped) / rms(stock)).toBeGreaterThan(0.7)
  expect(rms(slipped) / rms(stock)).toBeLessThan(1.6)
})

test('an interpolator that overshoots swings every frame louder and lower', () => {
  const stock = speak('kill the bass', { talkRepeat: 1 }, 4)
  const settles = speak(
    'kill the bass',
    { talkRepeat: 1, talkOvershoot: 0.25 },
    4,
  )
  const grows = speak('kill the bass', { talkRepeat: 1, talkOvershoot: 1 }, 4)
  expect(bounded(grows)).toBe(true)
  expect(rms(settles)).toBeLessThan(1.5 * rms(stock))
  expect(rms(grows)).toBeGreaterThan(2 * rms(stock))
  expect(spectrum(grows, SR).centroid).toBeLessThan(
    0.7 * spectrum(stock, SR).centroid,
  )
})

test('with Plinky on the pitch counter’s reset, the buzz takes the pitch of the key held on Plinky', () => {
  const drone = {
    ...QUIET,
    ...phrase('kill the bass'),
    talkLevel: 1,
    talkFrameDiv: FRAME_DIVS.indexOf(0),
    chipLevel: 1,
    chipMute: 1,
  }
  const sing = { ...drone, talkSingFrom: SING_FROM.indexOf('Plinky') }
  const take = (board: Partial<Controls>, key: number | null) =>
    renderBender(board, 2, built => {
      built.prattle.say()
      if (key !== null) built.toyChip.noteOn(key)
    }).subarray(SR)
  for (const [key, hz] of [
    [0, 220],
    [7, 329.63],
  ] as const)
    expect(bin(take(sing, key), hz), `${hz} Hz`).toBeGreaterThan(
      10 * bin(take(drone, key), hz),
    )
  expect(take(sing, null)).toEqual(take(drone, null))
})

test('a cut carry loops the frame counter, so a syllable repeats', () => {
  const loop = { talkLoopBit: 2, talkLoopSlip: 0 }
  const x = speak('machine', loop, 2.5)
  const plain = speak('machine', {}, 2.5)
  expect(rms(plain.subarray(SR * 1.5))).toBe(0)
  const env = envelope(x.subarray(SR * 1))
  const lag = Math.round(0.1 / 0.02)
  let same = 0
  for (let i = 0; i + lag < env.length; i++)
    same += Math.abs(env[i]! - env[i + lag]!)
  expect(rms(x.subarray(SR * 1.5))).toBeGreaterThan(0.01)
  expect(same / (env.length - lag)).toBeLessThan(0.05 * Math.max(...env))
})

test('struck by a kit voice, each hit speaks the next word', () => {
  const starts: number[] = []
  let was = -1
  renderBender(
    {
      ...QUIET,
      drumLevel: 0.5,
      drumBpm: 120,
      drumKick: stepMask(0, 4, 8, 12),
      talkLevel: 1,
      talkStruck: 1,
      ...phrase('one two three'),
    },
    2.2,
    built => {
      built.transport.drums = true
    },
    undefined,
    built => {
      const at = built.prattle.at
      if (at >= 0 && was < 0) starts.push(at)
      was = at
    },
  )
  expect(starts.slice(0, 4)).toEqual([0, 4, 7, 0])
})

test('at level 0 the chip is off the chain, whatever its other knobs say', () => {
  const built = buildBender(SR)
  const bent: Partial<Controls> = {
    talkClock: 3,
    talkDataLine: 11,
    talkDataFault: 2,
    talkRepeat: 1,
    talkStruck: 9,
    talkLeak: 1,
    ...phrase('kill'),
  }
  expect(built.prattle.when(packParams({ ...DEFAULT_CONTROLS, ...bent }))).toBe(
    false,
  )
  expect(render(bent, 1)).toEqual(render({}, 1))
})

test('text becomes whole words of allophones, and reads back', () => {
  const codes = textToPhrase('kill the bass')
  expect(codes).toHaveLength(PHRASE_LEN)
  expect(phraseText(codes)).toBe('kill the bass')
  expect(phraseText(textToPhrase('zorbo'))).toMatch(/^\[Z /)
  expect(textToPhrase('4')).toEqual(textToPhrase('four'))
  const long = textToPhrase('machine '.repeat(20))
  expect(long.filter(c => c === 63).length).toBeLessThan(20)
})
