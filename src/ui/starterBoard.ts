import { engine } from '../engine/engine.ts'
import { bench, setBench } from './bench.ts'
import { read } from './persist.ts'

import type { Controls } from '../controls.ts'

const BENCH_KEY = 'bender.bench'

export const STARTER_PEDALS = ['Ricochet', 'Boing'] as const

/** Every synth up and the delay and reverb on the bench, bypassed. */
export const STARTER_BOARD: Partial<Controls> = {
  fmLevel: 0.6,
  pcmLevel: 0.6,
  monoLevel: 0.6,
  echoLevel: 0.5,
  echoMute: 1,
  revMix: 0.5,
  revMute: 1,
}

/** Sets up a tab that arrives with no board and no bench of its own. */
export function startFresh() {
  engine.patch(STARTER_BOARD)
  if (read(BENCH_KEY) === null)
    setBench({ ...bench.get(), pedals: [...STARTER_PEDALS] })
}
