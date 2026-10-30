import { engine } from '../engine/engine.ts'
import { bench, hasStoredBench, setBench } from './bench.ts'
import { openStage } from './openStage.ts'

import type { Controls } from '../controls.ts'

const STARTER_STAGE = 'Plinky'

const STARTER_PEDALS = ['Ricochet', 'Boing'] as const

const STARTER_BOARD: Partial<Controls> = {
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
  if (!hasStoredBench())
    setBench({ ...bench.get(), pedals: [...STARTER_PEDALS] })
  openStage.set(STARTER_STAGE)
}
