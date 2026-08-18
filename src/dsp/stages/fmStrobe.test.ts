import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { Strobe } from '../bus'
import { buildBender } from '../build'
import {
  deviation,
  makeIo,
  quiet,
  render,
  renderBender,
  rms,
  SR,
} from '../testRender'
import { FM_EFFECT_NAMES } from './fmEffects'
import { romIndex } from './roms'

const NOTHING_PLAYING: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  fmLevel: 0.5,
}

const effect = (name: string) => FM_EFFECT_NAMES.indexOf(name)

// The latch on its own, with no chip around it.
test('a missed pulse leaves the last register it caught standing', () => {
  const s = new Strobe(1)
  expect(Array.from({ length: 6 }, (_, i) => s.latch(i, 0))).toEqual([
    0, 1, 2, 3, 4, 5,
  ])
  // A strobe that never lands never moves off what it was holding, however
  // many different registers the processor names.
  const dead = new Strobe(1)
  expect(dead.latch(9, 1)).toBe(0)
  expect(Array.from({ length: 5 }, (_, i) => dead.latch(i + 20, 1))).toEqual([
    0, 0, 0, 0, 0,
  ])
  // And one that lands once holds *that* one for as long as it keeps missing.
  const stuck = new Strobe(1)
  stuck.latch(7, 0)
  expect(Array.from({ length: 4 }, (_, i) => stuck.latch(i + 30, 1))).toEqual([
    7, 7, 7, 7,
  ])
})

/** Every byte the register file is holding, and every byte the CPU sent. */
function heldVsSent(fmStrobe: number, fmEffect: number) {
  const built = buildBender(SR)
  const chip = built.fmChip as unknown as {
    write(a: number, d: number): void
    regs: Uint8Array
  }
  const sent = new Set<number>([0])
  const real = chip.write.bind(chip)
  chip.write = (a, d) => {
    sent.add(d & 0xff)
    real(a, d)
  }
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...NOTHING_PLAYING,
    fmEffect,
    fmStrobe,
  })
  const io = makeIo()
  for (let b = 0; b < 400; b++) built.chain.process(io, p)
  const regs = Array.from(chip.regs)
  return {
    invented: regs.filter(v => !sent.has(v)).length,
    reached: regs.filter(v => v !== 0).length,
  }
}

// The property that makes this a different bend rather than another flavour of
// the bus faults: a knife on a data line changes what the byte says, and a
// knife on an address line changes where it goes by mangling the number. A
// slipping strobe does neither. Both bytes arrive intact and land, in a real
// register, exactly as the processor spelled them — just paired with the wrong
// partner. Nothing is corrupted; something is misfiled.
test('a slipping strobe misfiles bytes and never invents one', () => {
  for (const slip of [0, 0.25, 0.5, 0.9])
    expect(heldVsSent(slip, effect('crickets')).invented, `slip ${slip}`).toBe(
      0,
    )
})

// A latch that misses holds, so the harder the strobe slips the fewer distinct
// registers the run ever reaches — the writes pile up behind the last pulse
// that landed. All the way over and the whole run is one register.
test('the register file collapses as the strobe slips', () => {
  const reached = (slip: number) => heldVsSent(slip, effect('crickets')).reached
  const clean = reached(0)
  expect(clean).toBeGreaterThan(8)
  expect(reached(0.5)).toBeLessThan(clean)
  expect(reached(0.9)).toBeLessThan(reached(0.5))
  expect(reached(1)).toBe(1)
})

// Which is also the end of it: a strobe that never clocks never names the
// register carrying the key, so no note on any channel ever starts.
test('a strobe that never lands is a chip that never sounds', () => {
  for (let e = 1; e < FM_EFFECT_NAMES.length; e++)
    expect(
      rms(renderBender({ ...NOTHING_PLAYING, fmEffect: e, fmStrobe: 1 }, 2)),
      FM_EFFECT_NAMES[e],
    ).toBe(0)
})

// The slip is per write, so what it costs you is however many writes you make.
// A note is four; the weather is hundreds a second, and it is deranged that
// much harder for the same marginal pulse. The toy's sequencer only runs under
// buildChain, so the notes go through `render` and the effects, which need
// nothing playing them, through `renderBender`.
test('the same slip costs an effect more than it costs notes', () => {
  const NOTES = { ...NOTHING_PLAYING, chipTune: romIndex('scale') }
  const notes = deviation(
    render({ ...NOTES, fmStrobe: 0.15 }, 4),
    render(NOTES, 4),
  )
  for (const name of ['bird', 'surf', 'wind', 'siren']) {
    const base = { ...NOTHING_PLAYING, fmEffect: effect(name) }
    const moved = deviation(
      renderBender({ ...base, fmStrobe: 0.15 }, 4),
      renderBender(base, 4),
    )
    expect(moved, name).toBeGreaterThan(notes * 1.4)
  }
})

// The crickets again, arriving at the same place as the famous bend by a route
// that has nothing in common with it. A cut key line is a bit that cannot go
// low; this is every wire working perfectly and the key-up landing in the
// register next door. Same drone, no stuck bit anywhere.
test('a slipping strobe drones the crickets without a stuck bit', () => {
  const at = (fmStrobe: number) =>
    renderBender(
      { ...NOTHING_PLAYING, fmEffect: effect('crickets'), fmStrobe },
      4,
    )
  expect(quiet(at(0))).toBeGreaterThan(0.3)
  expect(quiet(at(0.4))).toBeLessThan(0.05)
})
