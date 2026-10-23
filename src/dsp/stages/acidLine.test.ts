import { expect, test } from 'vitest'

import { REST } from '../../tune.ts'
import { renderBender, rms, SR } from '../testRender.ts'

import type { Controls } from '../../controls.ts'
import type { BuiltChain } from '../build.ts'

// The memory alone through Growler: four steps a second, C then G, rests
// between, so each note is its own strike unless something ties it on.
const LINE: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  monoLevel: 1,
  monoKeyGate: 1,
  monoSeqOn: 1,
  monoSeqRate: 4,
  monoSeqLen: 4,
  monoSeqStep0: 0,
  monoSeqStep1: REST,
  monoSeqStep2: 7,
  monoSeqStep3: REST,
  monoGate: 0.5,
  monoEmph: 0.3,
}

const ALL = 0xffff
const STEP_S = 0.25

interface Probe {
  cv: number
  accentCap: number
  fEnv: { stage: number; level: number }
  aEnv: { level: number }
}

const voiceOf = (b: BuiltChain) =>
  (b.monoSynth as unknown as { voice: Probe }).voice

function watch(overrides: Partial<Controls>, seconds: number) {
  const seen: Probe[] = []
  const x = renderBender(
    { ...LINE, ...overrides },
    seconds,
    b => {
      b.transport.tune = true
    },
    undefined,
    b => {
      const v = voiceOf(b)
      seen.push({
        cv: v.cv,
        accentCap: v.accentCap,
        fEnv: { stage: v.fEnv.stage, level: v.fEnv.level },
        aEnv: { level: v.aEnv.level },
      })
    },
  )
  return { x, seen, at: (s: number) => seen[Math.floor((s * SR) / 128)]! }
}

test('an accented line is louder than the same line plain', () => {
  const plain = rms(watch({}, 2).x)
  const accented = rms(watch({ monoSeqAccentLo: ALL }, 2).x)
  expect(accented).toBeGreaterThan(1.3 * plain)
})

test('Accent at zero leaves an accented line as it was', () => {
  const plain = watch({}, 2).x
  const dead = watch({ monoSeqAccentLo: ALL, monoAccent: 0 }, 2).x
  expect(rms(dead)).toBeCloseTo(rms(plain), 3)
})

test('accents close together climb, and emphasis lets them climb higher', () => {
  const peaks = (emph: number) => {
    const { seen } = watch(
      {
        monoSeqAccentLo: ALL,
        monoSeqStep1: 3,
        monoSeqStep3: 10,
        monoEmph: emph,
      },
      1,
    )
    const per = Math.round((STEP_S * SR) / 128)
    return [0, 1, 2, 3].map(k =>
      Math.max(...seen.slice(k * per, (k + 1) * per).map(s => s.accentCap)),
    )
  }
  const low = peaks(0.1)
  const high = peaks(1)
  expect(high[3]!).toBeGreaterThan(1.2 * high[0]!)
  expect(high[3]! / high[0]!).toBeGreaterThan(low[3]! / low[0]!)
})

test('a slide carries the gate into the next note and glides there', () => {
  const into = {
    monoSeqStep1: 7,
    monoSeqStep2: REST,
    monoSeqSlideLo: 0x8000,
  }
  const slid = watch(into, 1)
  const struck = watch({ ...into, monoSeqSlideLo: 0 }, 1)
  const before = STEP_S - 0.01
  expect(slid.at(before).aEnv.level).toBeGreaterThan(0.5)
  expect(struck.at(before).aEnv.level).toBeLessThan(0.1)
  const just = STEP_S + 0.02
  expect(struck.at(just).fEnv.level).toBeGreaterThan(
    slid.at(just).fEnv.level + 0.2,
  )
  const cv = slid.at(just).cv
  expect(cv).toBeGreaterThan(slid.at(0.1).cv + 0.5)
  expect(cv).toBeLessThan(slid.at(STEP_S + 0.2).cv - 0.5)
})

test('a slide into the same note ties it with no new attack', () => {
  const { at } = watch(
    { monoSeqStep1: 0, monoSeqStep2: REST, monoSeqSlideLo: 0x8000 },
    1,
  )
  expect(at(STEP_S + 0.05).fEnv.stage).toBe(2)
  expect(at(STEP_S + 0.05).aEnv.level).toBeGreaterThan(0.5)
})
