import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { FAULT } from '../bus.ts'
import { MIC } from '../micJacks.ts'
import { ModBus } from '../modbus.ts'
import { spectrum } from '../spectrum.ts'
import { BLOCK, type Ctx } from '../stage.ts'
import { render, renderBender, rms, SR } from '../testRender.ts'
import { TriggerBus } from '../trigbus.ts'
import {
  ADPCM_BLOCK,
  CRUSH_ADC,
  CRUSH_CLOCK,
  CRUSH_LOGIC,
  CRUSH_REF,
  CRUSH_WITH,
  Crusher,
} from './crusher.ts'

const WET: Partial<Controls> = { crushMix: 1 }
const adc = (name: string) => CRUSH_ADC.indexOf(name)

const blank = (): Ctx => ({
  sr: SR,
  mic: new Float32Array(BLOCK),
  fb: new Float32Array(BLOCK),
  railV: new Float32Array(BLOCK).fill(1),
  sag: new Float32Array(BLOCK),
  droop: new Float32Array(BLOCK),
  env: new Float32Array(BLOCK),
  out: new Float32Array(BLOCK),
  step: new Float32Array(BLOCK),
  carrier: new Float32Array(BLOCK),
  logic: new Float32Array(BLOCK),
  toy: new Float32Array(BLOCK),
  fm: new Float32Array(BLOCK),
  send: new Float32Array(BLOCK),
  bright: new Float32Array(BLOCK),
  gnd: new Float32Array(BLOCK),
  heat: 0,
  fbDest: 0,
  mod: new ModBus(SR, 1),
  trig: new TriggerBus(),
})

const sineAt = (hz: number, amp: number) => (t: number) =>
  amp * Math.sin((2 * Math.PI * hz * t) / SR)

// The stage on its own: `input` feeds both channels, `wire` sets the buses a
// sample at a time, and the left channel comes back.
function stage(
  board: Partial<Controls>,
  input: (t: number) => number,
  seconds = 0.5,
  wire: (ctx: Ctx, i: number, t: number) => void = () => {},
): Float32Array {
  const crusher = new Crusher(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, ...WET, ...board })
  const ctx = blank()
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++) {
      const t = b * BLOCK + i
      io.l[i] = io.r[i] = input(t)
      wire(ctx, i, t)
    }
    crusher.process(io, p, ctx)
    out.set(io.l, b * BLOCK)
  }
  return out
}

const apart = (a: Float32Array, b: Float32Array) =>
  rms(a.map((v, i) => v - b[i]!)) / rms(a)

const changes = (x: Float32Array) => {
  let n = 0
  for (let i = 1; i < x.length; i++) if (x[i] !== x[i - 1]) n++
  return n
}

test('a SAR on a full rail is the stock converter', () => {
  const tone = sineAt(440, 0.5)
  expect(apart(stage({}, tone), stage({ crushAdc: adc('SAR') }, tone))).toBe(0)
})

test('a SAR on a sagging supply runs out of time for its low bits', () => {
  const tone = sineAt(440, 0.5)
  const sag = (ctx: Ctx, i: number) => {
    ctx.droop[i] = 0.5
  }
  const sar = stage({ crushAdc: adc('SAR') }, tone, 0.5, sag)
  const stock = stage({}, tone, 0.5, sag)
  const input = stage({ crushMix: 0 }, tone)
  expect(apart(input, sar)).toBeGreaterThan(20 * apart(input, stock))
})

test('a bad ADPCM word drifts the decoder until the next block header', () => {
  const tone = sineAt(330, 0.05)
  const board = { crushAdc: adc('ADPCM') }
  const clean = stage(board, tone, 1)
  const knifed = stage(
    { ...board, crushDataLine: 13, crushDataFault: FAULT.supply },
    tone,
    1,
  )
  let early = 0
  let late = 0
  for (let s = 0; s < clean.length; s++) {
    const at = s % ADPCM_BLOCK
    const e = Math.abs(knifed[s]! - clean[s]!)
    if (at < 60) early += e
    else if (at >= ADPCM_BLOCK - 60) late += e
  }
  expect(late).toBeGreaterThan(3 * early)
})

test('delta modulation overloads on a steep slope and follows a gentle one', () => {
  const board = { crushAdc: adc('delta') }
  const steep = sineAt(2000, 0.5)
  const gentle = sineAt(100, 0.5)
  expect(rms(stage(board, steep))).toBeLessThan(0.5 * rms(stage({}, steep)))
  expect(rms(stage(board, gentle))).toBeGreaterThan(
    0.8 * rms(stage({}, gentle)),
  )
})

test('μ-law keeps a whisper that four linear bits round away', () => {
  const whisper = sineAt(440, 0.01)
  expect(rms(stage({ bits: 4 }, whisper))).toBe(0)
  const mu = stage({ bits: 4, crushAdc: adc('μ-law') }, whisper)
  expect(rms(mu)).toBeGreaterThan(0.5 * rms(stage({ crushMix: 0 }, whisper)))
})

test('a short top rung runs the output backwards across zero', () => {
  const ramp = (t: number) => -0.01 + (0.02 * t) / SR
  const backwards = (x: Float32Array) =>
    x.reduce((n, v, i) => (i > 0 && v < x[i - 1]! - 1e-3 ? n + 1 : n), 0)
  expect(backwards(stage({}, ramp, 1))).toBe(0)
  expect(backwards(stage({ crushLadder: 1 }, ramp, 1))).toBeGreaterThan(0)
})

test('the toy’s RC clock slows with its rail and stops when the toy dies', () => {
  const ramp = (t: number) => t / SR - 0.25
  const rc = { crushClock: CRUSH_CLOCK.indexOf('toy RC'), srHz: 12000 }
  const at = (v: number) => (ctx: Ctx, i: number) => {
    ctx.railV[i] = v
  }
  const crystal = changes(stage({ srHz: 12000 }, ramp, 0.5, at(0.6)))
  const sagged = changes(stage(rc, ramp, 0.5, at(0.6)))
  expect(sagged).toBeLessThan(0.6 * crystal)
  expect(changes(stage(rc, ramp, 0.5, at(1)))).toBe(crystal)
  expect(changes(stage(rc, ramp, 0.5, at(0.15)))).toBe(0)
})

test('on the mic jack each cycle of the voice takes one sample', () => {
  const ramp = (t: number) => t / SR - 0.25
  const board = { micPatch: MIC.crushClock }
  const sung = stage(board, ramp, 1, (ctx, i, t) => {
    ctx.mic[i] = Math.sin((2 * Math.PI * 300 * t) / SR)
  })
  expect(Math.abs(changes(sung) - 300)).toBeLessThan(3)
  expect(changes(stage(board, ramp, 1))).toBe(0)
})

test('a multiplying DAC on a silent pin is silent', () => {
  const tone = sineAt(440, 0.5)
  const toy = { crushRef: CRUSH_REF.indexOf('the toy chip') }
  expect(rms(stage(toy, tone))).toBe(0)
  const ringing = stage(toy, tone, 0.5, (ctx, i, t) => {
    ctx.toy[i] = 0.2 * Math.sin((2 * Math.PI * 1000 * t) / SR)
  })
  expect(apart(stage({}, tone), ringing)).toBeGreaterThan(0.5)
})

test('the gate leaves a word alone against silence, except AND, which kills it', () => {
  const tone = sineAt(440, 0.5)
  const stock = stage({}, tone)
  const gate = (name: string) => ({
    crushLogic: CRUSH_LOGIC.indexOf(name),
  })
  expect(apart(stock, stage(gate('XOR'), tone))).toBeLessThan(1e-3)
  expect(apart(stock, stage(gate('OR'), tone))).toBeLessThan(1e-3)
  expect(rms(stage(gate('AND'), tone))).toBeLessThan(1e-3)
  const other = stage(gate('XOR'), tone, 0.5, (ctx, i, t) => {
    ctx.logic[i] = 0.3 * Math.sin((2 * Math.PI * 97 * t) / SR)
  })
  expect(apart(stock, other)).toBeGreaterThan(0.3)
})

test('a parted top wire moves more than one tied to a rail', () => {
  const stock = render(WET, 2)
  const line = { ...WET, crushDataLine: 16 }
  const cut = render({ ...line, crushDataFault: FAULT.cut }, 2)
  const ground = render({ ...line, crushDataFault: FAULT.ground }, 2)
  expect(apart(stock, cut)).toBeGreaterThan(1.3 * apart(stock, ground))
})

test('the chain hands the gate the machine it names', () => {
  const xor = { ...WET, crushLogic: CRUSH_LOGIC.indexOf('XOR') }
  const stock = render(WET, 1)
  const kit = render({ ...xor, crushWith: CRUSH_WITH.indexOf('the kit') }, 1)
  expect(apart(stock, kit)).toBeGreaterThan(0.4)
  const glint = render({ ...xor, crushWith: CRUSH_WITH.indexOf('glint') }, 1)
  expect(apart(stock, glint)).toBeLessThan(0.01)
})

test('a SAR on a starved toy comes out coarser than the stock crusher', () => {
  const starved = { ...WET, chipStarve: 0.35 }
  const stock = render(starved, 2)
  const sar = render({ ...starved, crushAdc: adc('SAR') }, 2)
  expect(spectrum(sar, SR).flatness).toBeGreaterThan(
    1.3 * spectrum(stock, SR).flatness,
  )
})

test('the mic clocks the crusher on the board', () => {
  const board = { ...WET, micLevel: 1, micPatch: MIC.crushClock }
  const play = (b: { transport: { tune: boolean; drums: boolean } }) => {
    b.transport.tune = true
    b.transport.drums = true
  }
  const sung = renderBender(board, 1, play, (mic, offset) => {
    for (let i = 0; i < mic.length; i++)
      mic[i] = 0.5 * Math.sin((2 * Math.PI * 3000 * (offset + i)) / SR)
  })
  const silent = renderBender(board, 1, play, mic => mic.fill(0))
  expect(rms(silent)).toBeLessThan(0.1 * rms(sung))
})
