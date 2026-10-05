import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS } from '../controls'
import { packParams } from '../engine/params'
import { buildBender } from './build'
import { BLOCK } from './stage'

// Globals a window or a worker has and an AudioWorkletGlobalScope does not. A
// call to any of them while the board is built or rendered throws on the audio
// thread and silences the whole board, and node has every one of them, so the
// rest of the suite passes regardless.
const MISSING = [
  'structuredClone',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'fetch',
  'performance',
  'crypto',
  'atob',
  'btoa',
] as const

test('the board builds and renders with only what an audio worklet has', () => {
  const saved = MISSING.map(
    k => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  )
  for (const k of MISSING)
    Object.defineProperty(globalThis, k, {
      value: undefined,
      configurable: true,
      writable: true,
    })
  try {
    const built = buildBender(48000)
    const p = packParams({
      ...DEFAULT_CONTROLS,
      monoLevel: 1,
      fmLevel: 1,
      pcmLevel: 1,
    })
    const io = {
      l: new Float32Array(BLOCK),
      r: new Float32Array(BLOCK),
      n: BLOCK,
    }
    built.monoSynth.noteOn(0)
    for (let b = 0; b < 50; b++) built.chain.process(io, p)
    expect(io.l.every(Number.isFinite)).toBe(true)
  } finally {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d)
      else delete (globalThis as Record<string, unknown>)[k]
    }
  }
})
