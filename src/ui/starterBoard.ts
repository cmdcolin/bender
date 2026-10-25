import { engine } from '../engine/engine.ts'
import { bench, setBench } from './bench.ts'
import { openStage } from './openStage.ts'
import { read } from './persist.ts'

import type { Controls } from '../controls.ts'

const BENCH_KEY = 'bender.bench'

export const STARTER_STAGE = 'Plinky'

export const STARTER_PEDALS = ['Ricochet', 'Boing'] as const

export const STARTER_BOARD: Partial<Controls> = {
  fmLevel: 0.6,
  pcmLevel: 0.6,
  monoLevel: 0.6,
  echoLevel: 0.5,
  echoMute: 1,
  revMix: 0.5,
  revMute: 1,
}

export function startFresh() {
  engine.patch(STARTER_BOARD)
  if (read(BENCH_KEY) === null)
    setBench({ ...bench.get(), pedals: [...STARTER_PEDALS] })
  openStage.set(STARTER_STAGE)
}
