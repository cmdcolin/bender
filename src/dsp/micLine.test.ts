import { describe, expect, test } from 'vitest'

import { MicLine, micDelaySeconds } from './micLine.ts'
import { BLOCK } from './stage.ts'

const SR = 48000

function run(
  line: MicLine,
  blocks: number,
  seconds: number,
  repeats: number,
  stepS = 0,
  input = (_at: number) => 0,
) {
  const heard: number[] = []
  const block = new Float32Array(BLOCK)
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < BLOCK; i++) block[i] = input(b * BLOCK + i)
    line.process(block, BLOCK, seconds, repeats, stepS)
    heard.push(...block)
  }
  return heard
}

const peakAt = (xs: number[], from: number, to: number) => {
  let at = from
  for (let i = from; i < to; i++)
    if (Math.abs(xs[i]!) > Math.abs(xs[at]!)) at = i
  return at
}

const loudest = (xs: number[]) =>
  xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0)

const CLAP = 10000
const clap = (at: number) => (at === CLAP ? 1 : 0)

describe('mic delay line', () => {
  test('at zero the jack hears the mic unchanged', () => {
    const heard = run(new MicLine(SR), 100, 0, 0.8, 0, clap)
    expect(heard[CLAP]).toBe(1)
    expect(heard.filter(x => x !== 0)).toHaveLength(1)
  })

  test('up, a clap reaches the jack once, the delay later', () => {
    const heard = run(new MicLine(SR), 500, 0.25, 0, 0, clap)
    expect(Math.abs(heard[CLAP]!)).toBeLessThan(0.01)
    expect(peakAt(heard, CLAP + 1, heard.length)).toBe(CLAP + 0.25 * SR)
    expect(loudest(heard.slice(CLAP + 0.25 * SR + 10))).toBeLessThan(0.01)
  })

  test('repeats bring the clap back again at the same spacing', () => {
    const heard = run(new MicLine(SR), 700, 0.25, 0.7, 0, clap)
    const first = CLAP + 0.25 * SR
    const second = peakAt(heard, first + 100, heard.length)
    expect(second).toBe(first + 0.25 * SR)
    expect(Math.abs(heard[second]!)).toBeGreaterThan(0.4)
    expect(Math.abs(heard[second]!)).toBeLessThan(Math.abs(heard[first]!))
  })

  test('sync rounds the delay to whole kit steps, at least one', () => {
    expect(micDelaySeconds(0.3, 0.125)).toBe(0.25)
    expect(micDelaySeconds(0.01, 0.125)).toBe(0.125)
    expect(micDelaySeconds(0.3, 0)).toBe(0.3)
    expect(micDelaySeconds(5, 0.125)).toBe(2)
  })

  test('full repeats stay bounded', () => {
    const noise = (at: number) => Math.sin(at * 0.37) * (at < SR ? 1 : 0)
    const heard = run(new MicLine(SR), 2000, 0.1, 1, 0, noise)
    expect(loudest(heard)).toBeLessThan(2.5)
  })
})
