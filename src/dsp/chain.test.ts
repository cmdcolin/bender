import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildChain } from './build'
import { makeIo, render, renderBender, rms, SR } from './testRender'

test('all-mixes-zero equals no bends: same output with slots emptied', () => {
  const base: Partial<Controls> = { chipLevel: 0.5 }
  const a = render(base)
  const b = render({
    ...base,
    bendSlot0: 0,
    bendSlot1: 0,
    bendSlot2: 0,
    bendSlot3: 0,
    bendSlot4: 0,
  })
  expect(a).toEqual(b)
})

test('deterministic: same params render bit-identically twice', () => {
  const look: Partial<Controls> = {
    chipStarve: 0.8,
    drumLevel: 0.7,
    drumRetrigHz: 90,
    crushMix: 0.7,
    bits: 4,
    glitchMix: 0.6,
    dlyMix: 0.4,
    fbAmt: 1.1,
  }
  expect(render(look, 1)).toEqual(render(look, 1))
})

test('runaway delay feedback stays bounded and audible', () => {
  const out = render(
    { chipLevel: 0.6, dlyMix: 0.6, dlyFb: 1.5, delayMs: 80 },
    3,
  )
  const tail = out.subarray(out.length - 4800)
  expect(rms(tail)).toBeGreaterThan(0.01)
  expect(Math.max(...tail.map(Math.abs))).toBeLessThanOrEqual(0.891 + 1e-6)
})

test('feedback patched into the delay still loops', () => {
  const out = render(
    {
      chipLevel: 0.5,
      fbAmt: 1.3,
      fbDest: 3,
      dlyMix: 0.8,
      delayMs: 150,
      dlyFb: 0.7,
    },
    2,
  )
  expect(rms(out.subarray(out.length - 4800))).toBeGreaterThan(0.01)
})

test('no-input feedback bus self-oscillates from nothing', () => {
  const out = render(
    { chipLevel: 0, fbAmt: 1.4, fbDelayMs: 2, crackleAmp: 0.2 },
    2,
  )
  expect(rms(out.subarray(out.length - 4800))).toBeGreaterThan(0.01)
})

// Two machines on one desk. The kit used to hang off the demo song's run line,
// so writing a pattern and hearing it meant putting the toy's ROM tune on
// underneath — and stopping the tune stopped the kit.
test('each machine runs on its own run line', () => {
  const both: Partial<Controls> = { chipLevel: 0.8, drumLevel: 0.9 }
  const runLines = (tune: boolean, drums: boolean) =>
    renderBender(both, 1, built => {
      built.transport.tune = tune
      built.transport.drums = drums
    })

  const silent = rms(runLines(false, false))
  const kitOnly = rms(runLines(false, true))
  const tuneOnly = rms(runLines(true, false))
  expect(silent).toBeLessThan(0.001)
  expect(kitOnly).toBeGreaterThan(0.02)
  expect(tuneOnly).toBeGreaterThan(0.02)
  // Neither is the other: the kit on its own has no sustained tone in it, and
  // the tune on its own has no step of the pattern.
  expect(runLines(false, true)).not.toEqual(runLines(true, false))
})

// The two Solder controls rewrite the path from inside the audio thread and
// touch no control on their way, so the walk they leave behind is the only
// account of what actually ran.
test('the chain reports the walk it took, not the one it was set', () => {
  const chain = buildChain(SR)
  const io = makeIo()
  const p = packParams({ ...DEFAULT_CONTROLS, chipLevel: 0.5 })
  chain.process(io, p)
  expect([...chain.walk]).toEqual([0, 1, 2, 3, 4, 5])
  expect(chain.dropped).toBe(0)

  const relay = buildChain(SR)
  const hot = packParams({ ...DEFAULT_CONTROLS, chipLevel: 0.5, relayRate: 1 })
  let swapped = false
  for (let b = 0; b < 400 && !swapped; b++) {
    relay.process(io, hot)
    swapped = [...relay.walk].join('') !== '012345'
  }
  expect(swapped).toBe(true)
  // A swap, not a loss: every position is still somewhere in the walk.
  expect([...relay.walk].sort()).toEqual([0, 1, 2, 3, 4, 5])
})

test('a cold joint reports the step it opened', () => {
  const chain = buildChain(SR)
  const io = makeIo()
  const p = packParams({
    ...DEFAULT_CONTROLS,
    chipLevel: 0.5,
    jointChatter: 0.9,
  })
  let open = 0
  for (let b = 0; b < 400 && open === 0; b++) {
    chain.process(io, p)
    open = chain.dropped
  }
  expect(open).toBeGreaterThan(0)
  // Only steps with a bend soldered into them: the sixth slot boots empty and
  // an empty socket has no joint to break.
  expect(open & (1 << 5)).toBe(0)
})
