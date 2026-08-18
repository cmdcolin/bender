import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { FAULT } from '../bus'
import { buildChain } from '../build'
import { BLOCK } from '../stage'
import {
  bin,
  lowEnergy,
  makeIo,
  playKeys,
  render,
  rms,
  SR,
} from '../testRender'
import { FM_VOICES } from './fmVoices'
import { romIndex } from './roms'

// The toy turned down to nothing, so what comes out is the other chip playing
// the key line the toy brings out.
const FM_ONLY: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  fmLevel: 0.8,
  chipTune: romIndex('scale'),
}

/** The key register's own bit, which is the fifth wire on the data bus. */
const KEY_LINE = 5

test('the chip has no keyboard of its own and plays the toy’s gate line', () => {
  // The toy is turned all the way down, so anything audible here is the other
  // chip playing the demo song off a wire.
  expect(rms(render({ ...FM_ONLY, fmLevel: 0 }, 2))).toBe(0)
  expect(rms(render(FM_ONLY, 2))).toBeGreaterThan(0.02)
})

test('every voice under the buttons is a patch that sounds', () => {
  for (let v = 0; v < FM_VOICES.length; v++) {
    expect(
      rms(render({ ...FM_ONLY, fmVoice: v }, 2)),
      FM_VOICES[v]!.name,
    ).toBeGreaterThan(0.02)
  }
})

// Sideband amplitudes are Bessel functions of the modulation index, so no one
// harmonic climbs with the knob — the second partial is loudest a quarter of the
// way up and gone again by halfway. What climbs is the whole top end together,
// which is why this counts everything above a kilohertz rather than a partial.
const overtones = (w: Float32Array) => {
  const all = rms(w)
  const low = lowEnergy(w, 1000)
  return Math.sqrt(Math.max(all * all - low * low, 0))
}

test('two operators, so the modulator piles harmonics onto the note', () => {
  const at = (fmBright: number) => {
    const x = playKeys(
      { ...FM_ONLY, fmVoice: 0, fmBright, fmLength: 2 },
      chip => chip.noteOn(0),
      0.6,
    )
    return x.subarray(Math.round(0.2 * SR))
  }
  const dull = at(0)
  const bright = at(1)
  expect(bin(dull, 220)).toBeGreaterThan(0.01)
  expect(overtones(bright)).toBeGreaterThan(overtones(dull) * 1.8)
})

// The bend the FM keyboards are known for. A note ends because the processor
// writes one bit of one register back down and the chip sees it change; a wire
// that cannot change is a wire the chip never sees change.
const sustained = (o: Partial<Controls>) =>
  playKeys(
    { ...FM_ONLY, fmVoice: 0, fmLength: 0.3, ...o },
    chip => chip.noteOn(0),
    2,
  )
const late = (x: Float32Array) => rms(x.subarray(Math.round(1.5 * SR)))

test('a key line that cannot go low is a note that never ends', () => {
  const clean = sustained({})
  expect(rms(clean.subarray(0, Math.round(0.2 * SR)))).toBeGreaterThan(0.05)
  expect(late(clean)).toBeLessThan(0.001)

  const stuck = sustained({
    fmDataLine: KEY_LINE,
    fmDataFault: FAULT.supply,
  })
  expect(late(stuck)).toBeGreaterThan(0.05)
})

test('a key line that cannot go high is a keyboard that never plays', () => {
  const dead = sustained({ fmDataLine: KEY_LINE, fmDataFault: FAULT.ground })
  expect(rms(dead)).toBe(0)
})

// Two param sets, swapped halfway, so the second half is the board after the
// knife has been taken off the bus. Rendered rather than described because the
// claim is about what the chip is still doing once nothing is wrong any more.
function afterTheFault(
  during: Partial<Controls>,
  after: Partial<Controls>,
  seconds: number,
) {
  const chain = buildChain(SR)
  const first = packParams({ ...DEFAULT_CONTROLS, ...FM_ONLY, ...during })
  const second = packParams({ ...DEFAULT_CONTROLS, ...FM_ONLY, ...after })
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

// What no other bend on this board does. A starved rail is a sound that lasts as
// long as your hand is on the knob; a byte that landed wrong in a register is a
// sound that lasts until something writes that register again — and the
// processor only rewrites the patch when a knob it knows about moves.
test('a byte that landed wrong stays landed after the knife comes off', () => {
  const fault = { fmDataLine: 3, fmDataFault: FAULT.supply }
  const clean = afterTheFault({}, {}, 4)
  const scarred = afterTheFault(fault, {}, 4)
  let sum = 0
  for (let i = 0; i < clean.length; i++) sum += (scarred[i]! - clean[i]!) ** 2
  expect(Math.sqrt(sum / clean.length) / rms(clean)).toBeGreaterThan(0.5)
  // and it is not simply still faulted: the notes themselves come back, because
  // frequency and key go out fresh with every note
  const stillCut = afterTheFault(fault, fault, 4)
  expect(rms(scarred)).toBeGreaterThan(rms(stillCut) * 1.5)
})

test('the chip runs off the toy’s rail, so starving the toy dives it too', () => {
  const hz = (o: Partial<Controls>) => {
    const x = playKeys(
      { ...FM_ONLY, fmVoice: 0, fmLength: 2, ...o },
      chip => chip.noteOn(0),
      0.8,
    )
    const w = x.subarray(Math.round(0.4 * SR))
    return bin(w, 220) > bin(w, 165) ? 220 : 165
  }
  expect(hz({})).toBe(220)
  expect(hz({ chipBattery: 1, chipStarve: 0.35 })).toBe(165)
})
