import { bench, INSTRUMENTS, setBench } from './bench.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { added, shownOn } from './fitted.ts'

const keep = (all: boolean, closed: ReadonlySet<string>) =>
  setBench({ ...bench.get(), all, closed: [...closed] })

/** Which instrument faces the bench lays out: each one whose stage is on the
    map, or in all-instruments mode each one not closed. */
export function useBenchFaces() {
  const { all, closed: closedList } = useStoreValue(bench)
  const closed = new Set(closedList)
  useStoreValue(added)
  const onMap = useBoardValue(c =>
    INSTRUMENTS.filter(stage => shownOn(c).has(stage)).join('|'),
  ).split('|')
  return {
    all,
    closed,
    shows: (stage: string) =>
      all ? !closed.has(stage) : onMap.includes(stage),
    close: (stage: string) => keep(all, new Set(closed).add(stage)),
    reopen: (stage: string) =>
      keep(all, new Set([...closed].filter(s => s !== stage))),
    setAll: (on: boolean) => keep(on, new Set()),
  }
}
