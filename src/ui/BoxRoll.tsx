import { engine } from '../engine/engine.ts'
import styles from './BoxRoll.module.css'
import { groupFor } from './controls/index.ts'
import { useStoreValue } from './ControlsContext.ts'
import { SHUFFLE } from './DeviceVerbs.tsx'
import { morphSetting } from './morph.ts'
import { rollKeys } from './presets/index.ts'
import {
  resetIn,
  rollIn,
  undoRoll,
  useCanUndoRoll,
  useMovedCount,
} from './rollBack.ts'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'

export function BoxRoll({
  title,
  keys,
}: {
  title: string
  keys: readonly ControlKey[]
}) {
  const seconds = useStoreValue(morphSetting)
  const scope = `box › ${keys[0] ? groupFor(keys[0]) : ''} › ${title}`
  const canUndo = useCanUndoRoll(scope)
  const moved = useMovedCount(keys)
  if (keys.length === 0) return null
  return (
    <div className={styles.verbs}>
      <Tip
        text={`Randomize the ${keys.length} controls under ${title} and leave the rest of the stage where it stands.`}
      >
        <button
          className={styles.roll}
          aria-label={`randomize ${title}`}
          onClick={() =>
            rollIn(
              scope,
              rollKeys(engine.controls.get(), keys, Math.random, true),
              seconds,
            )
          }
        >
          {SHUFFLE}
        </button>
      </Tip>
      {canUndo && (
        <Tip
          text={`put ${title} back where it stood before its last randomize`}
        >
          <button
            className={styles.roll}
            aria-label={`undo randomize of ${title}`}
            onClick={() => undoRoll(scope, seconds)}
          >
            undo
          </button>
        </Tip>
      )}
      {moved > 0 && (
        <Tip
          text={`put ${title}'s ${moved} moved controls back where they booted — ctrl+z brings them again`}
        >
          <button
            className={styles.reset}
            aria-label={`reset ${title}`}
            onClick={() => resetIn(keys, seconds)}
          >
            {`reset ${moved}`}
          </button>
        </Tip>
      )}
    </div>
  )
}
