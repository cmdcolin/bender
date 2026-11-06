import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams, SOURCE_TAPS } from '../../engine/params.ts'
import { REST } from '../../tune.ts'
import { buildBender } from '../build.ts'
import { highEnergy, renderStems, rms, SR } from '../testRender.ts'
import { SEQ_TO_LEAD } from '../trigbus.ts'

const GROWLER = SOURCE_TAPS.indexOf('monoSynth')
const HOWLER = SOURCE_TAPS.indexOf('leadSynth')

// Both memories on the kit's sixteenths at 150, Growler on a low C and Howler
// an octave and a fifth above it, each jumper cut.
const BOTH: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  drumBpm: 150,
  monoLevel: 1,
  monoKeyGate: 1,
  monoSeqOn: 1,
  monoSeqSync: 1,
  monoSeqLen: 4,
  monoSeqStep0: 0,
  monoSeqStep1: REST,
  monoSeqStep2: 0,
  monoSeqStep3: REST,
  leadLevel: 1,
  leadKeyGate: 1,
  leadSeqOn: 1,
  leadSeqLen: 4,
  leadSeqStep0: REST,
  leadSeqStep1: 19,
  leadSeqStep2: REST,
  leadSeqStep3: 19,
}

test('Howler sits out of the chain at its stock level', () => {
  const built = buildBender(SR)
  const p = packParams(DEFAULT_CONTROLS)
  expect(built.leadSynth.when(p)).toBe(false)
  expect(built.leadSynth.label).toBe('leadSynth')
})

test('each memory plays its own card', () => {
  const both = renderStems(BOTH, 1).stems
  expect(rms(both[GROWLER]!)).toBeGreaterThan(0.05)
  expect(rms(both[HOWLER]!)).toBeGreaterThan(0.05)

  const leadOff = renderStems({ ...BOTH, leadSeqOn: 0 }, 1).stems
  expect(rms(leadOff[HOWLER]!)).toBeLessThan(1e-4)
  expect(rms(leadOff[GROWLER]!)).toBeCloseTo(rms(both[GROWLER]!), 6)

  const bassOff = renderStems({ ...BOTH, monoSeqOn: 0 }, 1).stems
  expect(rms(bassOff[GROWLER]!)).toBeLessThan(1e-4)
  expect(rms(bassOff[HOWLER]!)).toBeCloseTo(rms(both[HOWLER]!), 6)
})

test('Howler’s stock voice is brighter than Growler’s on the same notes', () => {
  const same: Partial<Controls> = {
    ...BOTH,
    monoSeqStep0: REST,
    monoSeqStep1: 19,
    monoSeqStep2: REST,
    monoSeqStep3: 19,
  }
  const { stems } = renderStems(same, 1)
  const share = (x: Float32Array) => highEnergy(x, 2000) / rms(x)
  expect(share(stems[HOWLER]!)).toBeGreaterThan(2 * share(stems[GROWLER]!))
})

test('Growler’s memory aimed at Howler plays there, beside Howler’s own', () => {
  const aimed = { ...BOTH, monoSeqTo: SEQ_TO_LEAD }
  const lent = renderStems({ ...aimed, leadSeqOn: 0 }, 1).stems
  expect(rms(lent[GROWLER]!)).toBeLessThan(1e-4)
  expect(rms(lent[HOWLER]!)).toBeGreaterThan(0.05)

  const both = renderStems(aimed, 1).stems
  const own = renderStems({ ...aimed, monoSeqOn: 0 }, 1).stems
  expect(rms(both[HOWLER]!)).toBeGreaterThan(1.2 * rms(own[HOWLER]!))
})
