import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams, SOURCE_TAPS } from '../../engine/params.ts'
import { buildBender, buildChain } from '../build.ts'
import { FAULT } from '../bus.ts'
import { spectrum } from '../spectrum.ts'
import { BLOCK } from '../stage.ts'
import {
  bin,
  bursts,
  deviation,
  makeIo,
  pitchHz,
  quiet,
  renderBender,
  renderStems,
  rms,
  SR,
  tail,
} from '../testRender.ts'
import {
  type Cpu,
  EFFECTS,
  FM_EFFECT_NAMES,
  FM_SFX_PICKS,
} from './fmEffects.ts'
import { romIndex } from './roms.ts'
import { SFX_WIRES } from './toySfx.ts'

// Nothing is playing here: the toy is down, the transport is stopped and no key
// has been pressed. Whatever comes out is the CPU running a script at a chip
// that has been told nothing else.
const NOTHING_PLAYING: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  fmLevel: 0.5,
}

const effect = (name: string) => FM_EFFECT_NAMES.indexOf(name)

test('every effect in the ROM sounds with nothing playing it', () => {
  for (let e = 1; e < FM_EFFECT_NAMES.length; e++) {
    expect(
      rms(renderBender({ ...NOTHING_PLAYING, fmEffect: e }, 3)),
      FM_EFFECT_NAMES[e],
    ).toBeGreaterThan(0.01)
  }
})

// Which is the whole reason the effects are worth having on a bent board: the
// dataline bend scales with traffic, and a note is four writes.
test('an effect is the busiest thing the bus ever carries', () => {
  for (const eff of EFFECTS) {
    let writes = 0
    const cpu: Cpu = {
      write: () => {
        writes++
      },
      rng: () => 0.5,
      s: new Float64Array(4),
    }
    const ticks = eff.hz * 4
    for (let t = 0; t < ticks; t++) eff.run(cpu, t, t / eff.hz)
    // the crickets are the sparse one on purpose — a call is nothing but
    // key-ons, and most of the loop is the gap between them
    const floor = eff.name === 'crickets' ? 40 : 150
    expect(writes / 4, eff.name).toBeGreaterThan(floor)
  }
})

// A cricket is nothing but key-ons, so it is where the famous bend is loudest:
// the wire carrying the key back down cannot go low, the chip is never told the
// note ended, and a call of six chirps a second becomes one tone for good.
test('a key line that cannot go low turns the crickets into one tone', () => {
  const at = (o: Partial<Controls>) =>
    renderBender({ ...NOTHING_PLAYING, fmEffect: effect('crickets'), ...o }, 4)
  expect(quiet(at({}))).toBeGreaterThan(0.3)
  expect(quiet(at({ fmDataLine: 5, fmDataFault: FAULT.supply }))).toBe(0)
})

// The property no other bend on this board has a counterpart for. The script
// runs off the CPU's own clock and nothing here reaches that, so the rail can
// drag the synthesiser it is writing to without touching the shape of what it
// writes: the calls keep coming at the rate they came, and each one is lower.
test('the rail drags the chip and leaves the CPU’s timing alone', () => {
  const at = (o: Partial<Controls>) =>
    renderBender({ ...NOTHING_PLAYING, fmEffect: effect('crickets'), ...o }, 6)
  const fresh = at({})
  const flat = at({ chipBattery: 1, chipStarve: 0.35 })
  expect(bursts(flat)).toBe(bursts(fresh))
  expect(pitchHz(flat)).toBeLessThan(pitchHz(fresh) * 0.92)
  expect(rms(flat)).toBeLessThan(rms(fresh))
})

// And the other way round: the processor's crystal drags the script.
test('the CPU’s crystal drags the calls', () => {
  const at = (o: Partial<Controls>) =>
    renderBender({ ...NOTHING_PLAYING, fmEffect: effect('crickets'), ...o }, 6)
  const fresh = at({})
  const slow = at({ fmCpuClockX: 0.5 })
  expect(bursts(slow)).toBeLessThan(bursts(fresh) * 0.7)
})

// Two param sets swapped halfway, so the second half is the board after the
// effect button came back up.
function afterTheEffect(
  during: Partial<Controls>,
  after: Partial<Controls>,
  seconds: number,
) {
  const chain = buildChain(SR)
  const base = { ...NOTHING_PLAYING, fmVoice: 3, chipTune: romIndex('scale') }
  const first = packParams({ ...DEFAULT_CONTROLS, ...base, ...during })
  const second = packParams({ ...DEFAULT_CONTROLS, ...base, ...after })
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const half = Math.floor(blocks / 2)
  const out = new Float32Array((blocks - half) * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, b < half ? first : second)
    if (b >= half) out.set(io.l.subarray(0, BLOCK), (b - half) * BLOCK)
  }
  return out
}

// There is one instrument in the register file and the effect wants it, so a
// script running rewrites the patch the keyboard is playing through — the demo
// song comes out in the effect's voice, not the one under the button. Letting
// the button go is the driver re-selecting its instrument, which is eight more
// bytes over the same wires.
let untouched: Float32Array | undefined
const unbent = () => (untouched ??= afterTheEffect({}, {}, 6))

test.each(FM_EFFECT_NAMES.slice(1).map((name, i) => [name, i + 1] as const))(
  '%s takes the patch registers, and gives them back',
  (_name, e) => {
    const held = afterTheEffect({ fmEffect: e }, { fmEffect: e }, 6)
    const released = afterTheEffect({ fmEffect: e }, {}, 6)
    const gone = deviation(held, unbent())
    const back = deviation(released, unbent())
    expect(gone, FM_EFFECT_NAMES[e]).toBeGreaterThan(1)
    // Letting the button go does not land back on the untouched board exactly,
    // and the residue is not the patch — those eight bytes come back
    // byte-for-byte, which the next test holds. It is the fourth channel: the
    // song spent the first half allocated across three voices instead of four,
    // so the notes still ringing when the button comes up are on different
    // channels than they would have been. What matters is the ratio.
    expect(back, FM_EFFECT_NAMES[e]).toBeLessThan(0.7)
    expect(back, FM_EFFECT_NAMES[e]).toBeLessThan(gone * 0.5)
  },
)

// The precise half of the claim above, read off the register file rather than
// out of the audio: the driver re-selects its instrument on the way out, so
// every one of the eight patch bytes is the one it would have held had no
// effect ever run. It is also the regression guard — send the voice while the
// script is still running and the effect plays in the keyboard's patch instead
// of its own, feedback included, which is where surf and wind get their noise.
test('the eight patch bytes come back byte-for-byte', () => {
  const patchRegs = (during: number, after: number) => {
    const built = buildBender(SR)
    const base = {
      ...DEFAULT_CONTROLS,
      ...NOTHING_PLAYING,
      fmVoice: 3,
      chipTune: romIndex('scale'),
    }
    const first = packParams({ ...base, fmEffect: during })
    const second = packParams({ ...base, fmEffect: after })
    const io = makeIo()
    const blocks = Math.ceil((6 * SR) / BLOCK)
    const half = Math.floor(blocks / 2)
    for (let b = 0; b < blocks; b++)
      built.chain.process(io, b < half ? first : second)
    return Array.from(built.fmChip.patchRegs())
  }
  const never = patchRegs(0, 0)
  for (let e = 1; e < FM_EFFECT_NAMES.length; e++)
    expect(patchRegs(e, 0), FM_EFFECT_NAMES[e]).toEqual(never)
})

// The scripts added after the weather, each one a gesture a chip with no
// sample memory has to spell out in writes.
const take = (name: string, seconds: number) =>
  renderBender({ ...NOTHING_PLAYING, fmEffect: effect(name) }, seconds)
const span = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.round(from * SR), Math.round(to * SR))

test('the phone rings for a second and waits two', () => {
  const x = take('phone', 3)
  expect(rms(span(x, 0, 1))).toBeGreaterThan(10 * rms(span(x, 1.6, 2.9)))
})

test('the doorbell is two chimes a major third apart', () => {
  const x = take('doorbell', 1.2)
  const ding = span(x, 0.05, 0.5)
  const dong = span(x, 0.65, 1.1)
  expect(bin(ding, 659)).toBeGreaterThan(3 * bin(ding, 523))
  expect(bin(dong, 523)).toBeGreaterThan(3 * bin(dong, 659))
})

test('the steam chuffs come closer together as it pulls away', () => {
  const x = take('steam', 7.5)
  const early = bursts(span(x, 0, 4)) / 4
  const late = bursts(span(x, 4, 7.5)) / 3.5
  expect(late).toBeGreaterThan(1.3 * early)
})

test('applause is the broadband one', () => {
  const x = take('applause', 4)
  expect(rms(x)).toBeGreaterThan(0.01)
  expect(spectrum(x, SR).flatness).toBeGreaterThan(0.5)
})

test('a laser shot falls in pitch', () => {
  const x = take('laser', 0.2)
  const centroid = (from: number, to: number) =>
    spectrum(span(x, from, to), SR, 2048).centroid
  expect(centroid(0, 0.045)).toBeGreaterThan(3 * centroid(0.12, 0.165))
})

test('a held effect button plays its script and letting go stops it', () => {
  const surf = EFFECTS.findIndex(e => e.name === 'surf')
  const held = renderBender(
    NOTHING_PLAYING,
    3,
    b => b.fmChip.sfxOn(surf),
    undefined,
    (b, secs) => {
      if (secs >= 1.5) b.fmChip.sfxOff(surf)
    },
  )
  const switched = renderBender(
    { ...NOTHING_PLAYING, fmEffect: effect('surf') },
    1.5,
  )
  const pressed = held.subarray(SR / 2, (3 * SR) / 2)
  expect(deviation(pressed, switched.subarray(SR / 2))).toBeLessThan(1e-6)
  expect(rms(tail(held, 0.5))).toBeLessThan(rms(pressed) / 20)
})

const wire = (name: string) => SFX_WIRES.indexOf(name)
// The jumper off the toy's gate cut, so nothing reaches the chip but the wire.
const WIRED_ONLY: Partial<Controls> = { ...NOTHING_PLAYING, fmKeyGate: 1 }
const seg = (x: Float32Array, from: number, to: number) =>
  x.subarray(Math.floor(from * SR), Math.floor(to * SR))

test('a kick wired onto the effect buttons runs a script on every hit', () => {
  const fm = (over: Partial<Controls>) =>
    renderStems({ ...WIRED_ONLY, drumLevel: 0.5, ...over }, 2).stems[
      SOURCE_TAPS.indexOf('fmChip')
    ]!
  const bird = FM_SFX_PICKS.indexOf('bird')
  expect(rms(fm({ fmSfxWire: wire('kick'), fmSfxPick: bird }))).toBeGreaterThan(
    0.01,
  )
  expect(rms(fm({ fmSfxPick: bird }))).toBeLessThan(1e-4)
})

test('a press off the wire lasts as long as Press length', () => {
  const siren = FM_SFX_PICKS.indexOf('siren')
  const out = renderBender(
    {
      ...WIRED_ONLY,
      fmSfxWire: wire('toy notes'),
      fmSfxPick: siren,
      fmSfxHold: 0.5,
    },
    2,
    b => b.toyChip.noteOn(0),
  )
  const pressed = rms(seg(out, 0.1, 0.45))
  expect(pressed).toBeGreaterThan(0.01)
  expect(rms(seg(out, 1.5, 2))).toBeLessThan(pressed / 20)
})

test('a stuck effect button keeps its script running', () => {
  const stuck = renderBender(
    { ...WIRED_ONLY, fmSfxWire: wire('stuck'), fmSfxHold: 0.2 },
    2,
  )
  expect(rms(seg(stuck, 1.5, 2))).toBeGreaterThan(0.01)
})

test('on reboot, a starved rail fires an effect each time the chip resets', () => {
  const starved = (fmSfxWire: number) =>
    renderStems({ ...WIRED_ONLY, chipLevel: 1, chipStarve: 1, fmSfxWire }, 3)
      .stems[SOURCE_TAPS.indexOf('fmChip')]!
  expect(rms(starved(wire('reboot')))).toBeGreaterThan(0.01)
  expect(rms(starved(0))).toBeLessThan(1e-4)
})
