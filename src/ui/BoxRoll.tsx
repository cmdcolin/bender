import { engine } from '../engine/engine.ts'
import styles from './BoxRoll.module.css'
import { useStoreValue } from './ControlsContext.ts'
import { morphSetting } from './morph.ts'
import { rollKeys } from './presets/index.ts'
import { rollIn, undoRoll, useCanUndoRoll } from './rollBack.ts'
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
  const scope = `box › ${keys.join()}`
  const canUndo = useCanUndoRoll(scope)
  if (keys.length === 0) return null
  return (
    <div className={styles.verbs}>
      <Tip
        text={`Roll the ${keys.length} controls under ${title} somewhere new and leave the rest of the stage where it stands.`}
      >
        <button
          className={styles.roll}
          aria-label={`roll ${title}`}
          onClick={() =>
            rollIn(
              scope,
              rollKeys(engine.controls.get(), keys, Math.random, true),
              seconds,
            )
          }
        >
          roll
        </button>
      </Tip>
      <Tip
        text={
          canUndo
            ? `put ${title} back where it stood before its last roll`
            : `no roll of ${title} to take back`
        }
      >
        <button
          className={canUndo ? styles.roll : styles.off}
          aria-label={`undo roll of ${title}`}
          disabled={!canUndo}
          onClick={() => undoRoll(scope, seconds)}
        >
          undo
        </button>
      </Tip>
    </div>
  )
}
