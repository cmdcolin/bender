import { bench } from './bench.ts'
import { positionOf } from './bendChain.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'

import type { Controls } from '../controls.ts'

const chainKey = (c: Controls, stage: string) =>
  positionOf(c, stage) || Infinity

/** The bends on the bench in chain order, the ones in no position last. */
export function useBendStages() {
  const { bends } = useStoreValue(bench)
  return useBoardValue(c =>
    bends.toSorted((a, b) => chainKey(c, a) - chainKey(c, b)).join('|'),
  )
    .split('|')
    .filter(Boolean)
}
