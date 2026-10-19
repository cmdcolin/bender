import { bench } from './bench.ts'
import { StageBar } from './ChainMap.tsx'
import { GROUPS } from './controls/index.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { add, added, shownOn } from './fitted.ts'
import { OpenGroup } from './Section.tsx'

const noop = () => {}

// Every stage on the board, one under the other with its sliders open: the
// panel without the drawing. A stage joins the list the way it joins the map,
// from add a stage or by coming up on the board.
export function StageList({ seconds }: { seconds: number }) {
  const benchNow = useStoreValue(bench)
  useStoreValue(added)
  const names = useBoardValue(c => [...shownOn(c, benchNow)].join('|'))
  const on = new Set(names.split('|'))
  const onIt = GROUPS.filter(g => on.has(g.name))
  const offIt = GROUPS.filter(g => !on.has(g.name))
  return (
    <div role="group" aria-label="stages">
      <StageBar
        on={onIt}
        off={offIt}
        open={null}
        onOpen={name => add([name])}
        seconds={seconds}
      />
      {onIt.map(group => (
        <OpenGroup
          key={group.name}
          group={group}
          onClose={noop}
          seconds={seconds}
          stacked
        />
      ))}
    </div>
  )
}
