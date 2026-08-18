import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { FAULT } from '../bus'
import { buildChain } from '../build'
import { BLOCK } from '../stage'
import { makeIo, pitchHz, renderBender, rms, SR } from '../testRender'
import { type Cpu, EFFECTS, FM_EFFECT_NAMES } from './fmEffects'
import { romIndex } from './roms'

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

// 20 ms windows, which is finer than any gesture in the ROM and coarser than
// anything the chip does inside a note.
const envelope = (x: Float32Array) => {
  const n = Math.round(0.02 * SR)
  const out = new Float32Array(Math.floor(x.length / n))
  for (let i = 0; i < out.length; i++)
    out[i] = rms(x.subarray(i * n, i * n + n))
  return out
}

/** How much of the run the chip spent quiet, as a fraction of those windows. */
const quiet = (x: Float32Array) => {
  const env = envelope(x)
  const peak = env.reduce((a, v) => Math.max(a, v), 0)
  return env.reduce((a, v) => a + (v < peak * 0.1 ? 1 : 0), 0) / env.length
}

/** Onsets, counted with hysteresis so one call is one burst. */
const bursts = (x: Float32Array) => {
  const env = envelope(x)
  const peak = env.reduce((a, v) => Math.max(a, v), 0)
  let count = 0
  let on = false
  for (const v of env) {
    if (!on && v > peak * 0.35) {
      count++
      on = true
    } else if (on && v < peak * 0.15) on = false
  }
  return count
}

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

const deviation = (x: Float32Array, from: Float32Array) => {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += (x[i]! - from[i]!) ** 2
  return Math.sqrt(sum / x.length) / rms(from)
}

// There is one instrument in the register file and the effect wants it, so a
// script running rewrites the patch the keyboard is playing through — the demo
// song comes out in the effect's voice, not the one under the button. Letting
// the button go is the driver re-selecting its instrument, which is eight more
// bytes over the same wires.
test('an effect takes the patch registers, and gives them back', () => {
  const never = afterTheEffect({}, {}, 6)
  for (let e = 1; e < FM_EFFECT_NAMES.length; e++) {
    const held = afterTheEffect({ fmEffect: e }, { fmEffect: e }, 6)
    const released = afterTheEffect({ fmEffect: e }, {}, 6)
    expect(deviation(held, never), FM_EFFECT_NAMES[e]).toBeGreaterThan(0.5)
    expect(deviation(released, never), FM_EFFECT_NAMES[e]).toBeLessThan(0.35)
  }
})
