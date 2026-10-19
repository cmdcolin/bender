import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { bench } from './bench.ts'
import { StageBar } from './ChainMap.tsx'
import { GROUPS, groupKeys } from './controls/index.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { add, added, shownOn } from './fitted.ts'
import { resetKeys, rollGroup } from './presets/index.ts'
import { rollIn } from './rollBack.ts'
import { OpenGroup, ScopeVerbs } from './Section.tsx'
import styles from './StageList.module.css'

import type { Group } from './controls/index.ts'

const noop = () => {}

const WHOLE_LIST = 'every stage on the board'

// Roll, undo and reset for every stage in the list at once.
function ListVerbs({ groups, seconds }: { groups: Group[]; seconds: number }) {
  const keys = [...new Set(groups.flatMap(g => groupKeys(g)))]
  const moved = useBoardValue(
    c => keys.filter(k => c[k] !== DEFAULT_CONTROLS[k]).length,
  )
  return (
    <div className={styles.verbs}>
      <span className={styles.label}>all settings</span>
      <ScopeVerbs
        scope={WHOLE_LIST}
        what={WHOLE_LIST}
        seconds={seconds}
        moved={moved}
        rollTip="Roll every control of every stage in the list somewhere new. Stages off the board stay where they are."
        resetTip={
          moved > 0
            ? `put all ${moved} moved controls in the list back where they booted — ctrl+z brings them again`
            : 'every stage in the list is already where it booted'
        }
        onRoll={() =>
          rollIn(
            WHOLE_LIST,
            groups.reduce(
              (board, g) => rollGroup(g, board, Math.random),
              engine.controls.get(),
            ),
            seconds,
          )
        }
        onReset={() =>
          engine.morphTo(
            resetKeys(engine.controls.get(), keys),
            seconds,
            new Set(keys),
          )
        }
      />
    </div>
  )
}

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
      <ListVerbs groups={onIt} seconds={seconds} />
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
