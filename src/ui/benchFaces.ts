import { bench, INSTRUMENTS, setBench } from './bench.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { added, shownOn } from './fitted.ts'

const without = (list: readonly string[], stage: string) =>
  list.filter(s => s !== stage)

/** Which instrument faces the bench lays out: each one whose stage is on the
    map, except those put away. */
export function useBenchFaces() {
  const { closed } = useStoreValue(bench)
  useStoreValue(added)
  const onMap = useBoardValue(c =>
    INSTRUMENTS.filter(stage => shownOn(c).has(stage)).join('|'),
  ).split('|')
  return {
    shows: (stage: string) => !closed.includes(stage) && onMap.includes(stage),
    close: (stage: string) => {
      const b = bench.get()
      setBench({
        ...b,
        instruments: without(b.instruments, stage),
        closed: [...without(b.closed, stage), stage],
      })
    },
    bring: (stage: string) => {
      const b = bench.get()
      setBench({
        ...b,
        instruments: [...without(b.instruments, stage), stage],
        closed: without(b.closed, stage),
      })
    },
  }
}
