import { expect, test } from 'vitest'

import { spectrum } from '../spectrum'
import { render, renderBender, rms, SR } from '../testRender'

const ALONE = { chipLevel: 0, drumLevel: 0, monoLevel: 1 }

test('the toy’s gate line plays the synth as a bass', () => {
  const x = render(ALONE, 3)
  expect(rms(x)).toBeGreaterThan(0.05)
  expect(spectrum(x, SR).bands[0]).toBeGreaterThan(0.6)
})

test('cutting the jumper silences it with nothing else striking', () => {
  expect(rms(render({ ...ALONE, monoKeyGate: 1 }, 2))).toBe(0)
})

test('the kick’s trigger line strikes it with the jumper cut', () => {
  const x = render(
    { ...ALONE, drumLevel: 0.001, monoKeyGate: 1, monoStruck: 1 },
    3,
  )
  expect(rms(x)).toBeGreaterThan(0.03)
})

test('a longer gate holds each note down longer', () => {
  const short = rms(render({ ...ALONE, monoGate: 0.1, monoAR: 0.01 }, 3))
  const long = rms(render({ ...ALONE, monoGate: 1, monoAR: 0.01 }, 3))
  expect(long).toBeGreaterThan(short * 1.3)
})

test('a key from its own bed sounds until it comes up', () => {
  const x = renderBender(
    { ...ALONE, monoKeyGate: 1, monoAR: 0.05 },
    2,
    undefined,
    undefined,
    (built, secs) => {
      if (secs === 0) built.monoSynth.noteOn(0)
      else if (Math.abs(secs - 1) < 0.002) built.monoSynth.noteOff(0)
    },
  )
  const held = rms(x.subarray(SR / 2, SR))
  const after = rms(x.subarray(1.5 * SR))
  expect(held).toBeGreaterThan(0.05)
  expect(after).toBeLessThan(held / 100)
})

test('a leaky VCA drones with no key down', () => {
  expect(
    rms(render({ ...ALONE, monoKeyGate: 1, monoLeak: 1 }, 2)),
  ).toBeGreaterThan(0.02)
})

test('with the fader down nothing on its panel reaches the board', () => {
  const stock = render({}, 1)
  const turned = render({ monoEmph: 1.1, monoLoop: 1, monoLeak: 1 }, 1)
  expect(turned).toEqual(stock)
})
