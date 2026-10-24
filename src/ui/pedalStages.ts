import { PEDALS, pedalOrderAt } from '../pedals.ts'
import { bench } from './bench.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'

/** The pedals in the order the signal meets them, which is the order both the
    menu and the shelf list them in. */
export function useRunOrder() {
  const at = useBoardValue(c => Math.round(c.pedalOrder))
  return pedalOrderAt(at).map(i => PEDALS[i]!.group)
}

export function usePedalStages() {
  const { pedals: shown } = useStoreValue(bench)
  return useRunOrder().filter(pedal => shown.includes(pedal))
}
