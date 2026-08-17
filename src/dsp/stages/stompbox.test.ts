import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import {
  bin,
  crest,
  render,
  renderBender,
  rms,
  sine,
  tail,
} from '../testRender'

// A 400 Hz sine on the sampler, so what comes back out of the pedal is only
// what the pedal made of it.
const throughPedal = (overrides: Partial<Controls>, amp = 0.4) =>
  renderBender({ chipLevel: 0, sampleLevel: 1, ...overrides }, 1, b =>
    b.sampler.setBuffer(sine(400, 1, amp)),
  )

test('the stompbox is off the board until its mix comes up', () => {
  const base: Partial<Controls> = { chipLevel: 0.6 }
  const a = render(base, 1)
  const b = render({ ...base, stompDrive: 60, stompSag: 1, stompCircuit: 2 }, 1)
  expect(a).toEqual(b)
})

test('drive flattens the wave — and the tone knob keeps the top off', () => {
  const clean = throughPedal({})
  const dirty = throughPedal({ stompCircuit: 1, stompDrive: 34, stompMix: 1 })
  expect(crest(tail(clean))).toBeGreaterThan(1.35)
  expect(crest(tail(dirty))).toBeLessThan(1.15)
  const dark = throughPedal({
    stompCircuit: 1,
    stompDrive: 34,
    stompTone: 0,
    stompMix: 1,
  })
  expect(bin(tail(dark), 2000)).toBeLessThan(bin(tail(dirty), 2000) * 0.5)
})

test('the octave circuit puts the octave on top, the screamer does not', () => {
  const oct = tail(
    throughPedal({ stompCircuit: 4, stompDrive: 30, stompMix: 1 }),
  )
  expect(bin(oct, 800)).toBeGreaterThan(bin(oct, 400) * 2)
  // symmetric clipping makes odd harmonics, so a screamer leaves 400 on top
  const ts = tail(
    throughPedal({ stompCircuit: 0, stompDrive: 30, stompMix: 1 }),
  )
  expect(bin(ts, 400)).toBeGreaterThan(bin(ts, 800) * 2)
})

test('a flat battery sags the pedal, and the board’s own supply drags it too', () => {
  const fresh = throughPedal({ stompCircuit: 2, stompDrive: 30, stompMix: 1 })
  const flat = throughPedal({
    stompCircuit: 2,
    stompDrive: 30,
    stompSag: 1,
    stompMix: 1,
  })
  expect(rms(tail(flat))).toBeLessThan(rms(tail(fresh)) * 0.6)
  // same battery, but this time it is the master brownout pulling it down
  const browned = throughPedal({
    stompCircuit: 2,
    stompDrive: 30,
    stompSag: 1,
    stompMix: 1,
    brownAmt: 1,
    brownRate: 0,
  })
  expect(rms(tail(browned))).toBeLessThan(rms(tail(flat)))
})

test('bias shuts the gate circuit, and a flat battery sets it howling', () => {
  const box: Partial<Controls> = {
    stompCircuit: 5,
    stompDrive: 40,
    stompMix: 1,
  }
  // a note well under where the bias walks the gate to
  const through = rms(tail(throughPedal(box, 0.08)))
  const shut = rms(tail(throughPedal({ ...box, stompBias: 0.8 }, 0.08)))
  expect(through).toBeGreaterThan(0.05)
  expect(shut).toBeLessThan(through * 0.1)

  // nothing at the input at all, and it still finds something to say
  expect(
    rms(tail(render({ chipLevel: 0, drumLevel: 0, ...box }, 2))),
  ).toBeLessThan(1e-4)
  expect(
    rms(tail(render({ chipLevel: 0, drumLevel: 0, ...box, stompSag: 0.9 }, 2))),
  ).toBeGreaterThan(0.02)
})

test('a wire onto the stomp drive turns it up', () => {
  const base: Partial<Controls> = {
    stompCircuit: 1,
    stompDrive: 0,
    stompMix: 1,
    bodyX: 1,
    mod0Dest: 9,
    mod0Depth: 1,
  }
  const unwired = throughPedal(base)
  const wired = throughPedal({ ...base, mod0Src: 5 })
  expect(crest(tail(wired))).toBeLessThan(crest(tail(unwired)) * 0.85)
})
