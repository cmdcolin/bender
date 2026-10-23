import { describe, expect, it } from 'vitest'

import { ROMS } from '../../src/dsp/stages/roms.ts'
import { buildBoard } from './board.ts'
import { erc } from './erc.ts'
import {
  codeOf,
  divisor,
  semitoneImage,
  stepOf,
  STEPS,
  tuneImage,
} from './roms.ts'
import { Sim } from './sim.ts'

const board = buildBoard()
const roms = { U5: tuneImage(), U16: semitoneImage() }
const fresh = () => new Sim(board, { roms, force: { MCLK: 0 } })

const setBits = (sim: Sim, prefix: string, n: number, value: number) => {
  for (let i = 0; i < n; i++) sim.force(`${prefix}${i}`, (value >> i) & 1)
}

const press = (sim: Sim, key: number | null) => {
  for (let i = 0; i < 12; i++) sim.force(`KEY${i}`, i === key ? 0 : 1)
  sim.settle()
}

const periods = (sim: Sim, net: string, count: number) => {
  const edges: number[] = []
  let last = sim.get(net)
  for (let c = 0; edges.length < count + 2; c++) {
    sim.cycle()
    const v = sim.get(net)
    if (last === 0 && v === 1) edges.push(c)
    last = v
    if (c > 400000) throw new Error(`no edges on ${net}`)
  }
  const tail = edges.slice(1)
  return tail.slice(1).map((e, i) => e - tail[i]!)
}

describe('netlist', () => {
  it('passes the rule check', () => {
    expect(erc(board)).toEqual([])
  })
})

describe('tune ROM image', () => {
  it('round-trips every step of every tune', () => {
    for (const rom of ROMS)
      for (const step of rom.steps) expect(stepOf(codeOf(step))).toBe(step)
  })
})

describe('pitch chain', () => {
  const cases: [number, number][] = [
    ...Array.from({ length: 12 }, (_, s) => [3, s] as [number, number]),
    ...Array.from({ length: 12 }, (_, s) => [2, s] as [number, number]),
    [1, 0],
    [1, 11],
    [0, 0],
  ]
  it.each(cases)(
    'octave %i semitone %i divides the master clock exactly',
    (oct, semi) => {
      const sim = fresh()
      setBits(sim, 'OCT', 2, oct)
      sim.force('TONE0', 1)
      sim.force('TONE1', 1)
      press(sim, semi)
      const expected = divisor(semi) * 2 ** (3 - oct) * 16
      expect(periods(sim, 'PULSE', 2)).toEqual([expected, expected])
      expect(sim.unknownReads.size).toBe(0)
    },
  )

  it('narrows the pulse with the tone switch', () => {
    const widths = [8, 4, 2, 1].map(w => w / 16)
    widths.forEach((width, tone) => {
      const sim = fresh()
      setBits(sim, 'OCT', 2, 3)
      setBits(sim, 'TONE', 2, tone)
      press(sim, 0)
      const period = 256 * 16
      let high = 0
      for (let c = 0; c < period * 2; c++) sim.cycle()
      for (let c = 0; c < period * 4; c++) {
        sim.cycle()
        high += sim.get('PULSE')
      }
      expect(high / (period * 4)).toBeCloseTo(width, 2)
    })
  })
})

describe('tempo chain', () => {
  it('divides the master clock by 2^18 at the first tap and 2^19 at the next', () => {
    const sim = fresh()
    const edges: Record<string, number[]> = { T18: [], T19: [] }
    const last = { T18: sim.get('T18'), T19: sim.get('T19') }
    for (let c = 0; c < 2 ** 17 + 2 ** 18 + 8; c++) {
      sim.cycle()
      for (const net of ['T18', 'T19'] as const) {
        const v = sim.get(net)
        if (last[net] === 0 && v === 1) edges[net]!.push(c)
        last[net] = v
      }
    }
    expect(edges.T18![1]! - edges.T18![0]!).toBe(2 ** 18)
    expect(edges.T19![0]! - edges.T18![0]!).toBe(2 ** 17)
  })
})

describe('tune playback', () => {
  ROMS.forEach((rom, bank) => {
    it(`plays ${rom.name} from bank ${bank}`, () => {
      const sim = fresh()
      sim.force('STEP', 0)
      setBits(sim, 'BANK', 5, bank)
      press(sim, null)
      let held = sim.word('LC', 6)
      for (let i = 0; i < STEPS; i++) {
        const step = rom.steps[i % rom.steps.length]!
        sim.set('STEP', 1)
        const gate = sim.get('G')
        const kill = sim.get('KILL')
        if (step >= 0) {
          expect(gate).toBe(1)
          held = codeOf(step)
        } else {
          expect(gate).toBe(0)
          expect(kill).toBe(step === -1 ? 1 : 0)
        }
        expect(sim.word('LC', 6)).toBe(held)
        sim.set('STEP', 0)
      }
      expect(sim.unknownReads.size).toBe(0)
    })
  })

  it('wraps the step counter after 32 steps', () => {
    const sim = fresh()
    sim.force('STEP', 0)
    press(sim, null)
    for (let i = 0; i < STEPS; i++) {
      sim.set('STEP', 1)
      sim.set('STEP', 0)
    }
    expect(sim.word('STEP', 5)).toBe(0)
  })

  it('holds the counter at zero while the loop line is high', () => {
    const sim = fresh()
    sim.force('STEP', 0)
    sim.force('LOOP_RST', 1)
    press(sim, null)
    for (let i = 0; i < 5; i++) {
      sim.set('STEP', 1)
      sim.set('STEP', 0)
    }
    expect(sim.word('STEP', 5)).toBe(0)
  })
})

describe('keys', () => {
  it('the key overrides the tune and latches', () => {
    const sim = fresh()
    sim.force('STEP', 0)
    setBits(sim, 'OCT', 2, 2)
    press(sim, 7)
    expect(sim.get('G')).toBe(1)
    expect(sim.word('LC', 6)).toBe((2 << 4) | 7)
    press(sim, null)
    expect(sim.get('G')).toBe(0)
    expect(sim.word('LC', 6)).toBe((2 << 4) | 7)
  })

  it('plays the higher key when two are down', () => {
    const sim = fresh()
    sim.force('STEP', 0)
    setBits(sim, 'OCT', 2, 0)
    for (let i = 0; i < 12; i++)
      sim.force(`KEY${i}`, i === 3 || i === 9 ? 0 : 1)
    sim.settle()
    expect(sim.word('LC', 6) & 15).toBe(9)
  })
})
