import { expect, test } from 'vitest'

import { MIC } from './micJacks.ts'
import { bin, deviation, pitchHz, renderBender, rms, SR } from './testRender.ts'

import type { Controls } from '../controls.ts'

const TOY: Partial<Controls> = { drumLevel: 0, micLevel: 1 }
// A jack on a stage switched off, so the mic reaches nothing.
const UNPLUGGED = MIC.glitchTrig

const tone =
  (hz: number, amp = 0.5, until = Infinity) =>
  (mic: Float32Array, offset: number) => {
    for (let i = 0; i < mic.length; i++) {
      const t = (offset + i) / SR
      mic[i] = t < until ? amp * Math.sin(2 * Math.PI * hz * t) : 0
    }
  }

const silence = () => (mic: Float32Array) => mic.fill(0)

// A voice that swells and drops twice a second, so a word read off its
// loudness keeps changing.
const shout = (mic: Float32Array, offset: number) => {
  for (let i = 0; i < mic.length; i++) {
    const t = (offset + i) / SR
    mic[i] =
      Math.abs(Math.sin(2 * Math.PI * t)) * Math.sin(2 * Math.PI * 180 * t)
  }
}

const hear = (
  board: Partial<Controls>,
  mic: (m: Float32Array, o: number) => void,
  seconds = 2,
) =>
  renderBender(
    board,
    seconds,
    b => {
      b.transport.tune = true
    },
    mic,
  )

test('on the toy clock the pitch of the voice sets the toy’s pitch', () => {
  const board = { ...TOY, micPatch: MIC.toyClock }
  const low = pitchHz(hear(board, tone(110)))
  const high = pitchHz(hear(board, tone(440)))
  expect(high).toBeGreaterThan(2.5 * low)
})

test('on the toy clock silence all but stops the toy', () => {
  const board = { ...TOY, micPatch: MIC.toyClock }
  const sung = hear(board, tone(220))
  const quiet = hear(board, silence())
  expect(pitchHz(quiet)).toBeLessThan(0.1 * pitchHz(sung))
})

for (const jack of ['toyAddr', 'toyData'] as const) {
  test(`a shout on the ${jack} jack changes the notes the toy plays`, () => {
    const board = { ...TOY, micPatch: MIC[jack] }
    const still = hear(board, silence())
    const yelled = hear(board, shout)
    expect(rms(still)).toBeGreaterThan(0.01)
    expect(deviation(yelled, still)).toBeGreaterThan(0.5)
  })

  test(`silence on the ${jack} jack leaves the toy as it was`, () => {
    const free = hear({ ...TOY, micPatch: MIC.mix }, silence())
    const wired = hear({ ...TOY, micPatch: MIC[jack] }, silence())
    expect(deviation(wired, free)).toBe(0)
  })
}

test('on osc sync the oscillator repeats at the voice’s pitch', () => {
  const board = {
    ...TOY,
    chipLevel: 0,
    oscLevel: 1,
    oscAHz: 1300,
    oscXmod: 0,
  }
  const free = hear({ ...board, micPatch: UNPLUGGED }, tone(150), 1)
  const synced = hear({ ...board, micPatch: MIC.oscSync }, tone(150), 1)
  expect(bin(synced, 150)).toBeGreaterThan(10 * bin(free, 150))
})

const twoSeconds = () => {
  const buf = new Float32Array(2 * SR)
  for (let i = 0; i < buf.length; i++)
    buf[i] = 0.5 * Math.sin((2 * Math.PI * 330 * i) / SR)
  return buf
}

// How far the output moves sample to sample: zero for a tape parked under the
// head, whatever it is parked on.
const motion = (x: Float32Array) => {
  let sum = 0
  for (let i = 1; i < x.length; i++) sum += (x[i]! - x[i - 1]!) ** 2
  return Math.sqrt(sum / x.length)
}

test('on the tape motor the tape stops in silence and runs while you shout', () => {
  const board = {
    ...TOY,
    chipLevel: 0,
    sampleLevel: 1,
    micPatch: MIC.tapeMotor,
  }
  const run = (mic: (m: Float32Array, o: number) => void) =>
    renderBender(board, 1, b => b.sampler.setBuffer(twoSeconds()), mic)
  const running = motion(run(tone(200)).subarray(SR / 2))
  expect(running).toBeGreaterThan(0.01)
  expect(motion(run(silence()).subarray(SR / 2))).toBeLessThan(0.01 * running)
})

test('on Growler’s input a held key opens the filter on the voice', () => {
  const board: Partial<Controls> = {
    ...TOY,
    chipLevel: 0,
    monoLevel: 1,
    monoKeyGate: 1,
    monoMix1: 0,
    monoMix2: 0,
    monoMix3: 0,
    monoNoise: 0,
  }
  const play = (micPatch: number, key: boolean) =>
    renderBender(
      { ...board, micPatch },
      1,
      undefined,
      tone(300),
      (built, secs) => {
        if (key && secs === 0) built.monoSynth.noteOn(0)
      },
    )
  const voiced = bin(play(MIC.growlerIn, true), 300)
  expect(voiced).toBeGreaterThan(0.02)
  expect(bin(play(MIC.growlerIn, false), 300)).toBeLessThan(0.05 * voiced)
  expect(bin(play(UNPLUGGED, true), 300)).toBeLessThan(0.05 * voiced)
})

test('on Glint’s bus the voice rewrites the registers and the damage stays', () => {
  const board = { ...TOY, chipLevel: 0, fmLevel: 0.8 }
  const clean = hear({ ...board, micPatch: MIC.mix }, silence(), 3)
  const hit = hear({ ...board, micPatch: MIC.glintBus }, shout, 3)
  const after = hear({ ...board, micPatch: MIC.glintBus }, tone(180, 0.9, 1), 3)
  const lastSecond = (x: Float32Array) => x.subarray(2 * SR)
  expect(deviation(hit, clean)).toBeGreaterThan(0.3)
  expect(deviation(lastSecond(after), lastSecond(clean))).toBeGreaterThan(0.1)
})
