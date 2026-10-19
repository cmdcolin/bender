import { useContext } from 'react'

import { engine } from '../engine/engine.ts'
import { BoxStage, BoxTitle } from './BoxContext.ts'
import styles from './BoxRoll.module.css'
import { rollKeys } from './presets/index.ts'
import { rollIn, undoRoll, useCanUndoRoll } from './rollBack.ts'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'

export function BoxRoll({ keys }: { keys: readonly ControlKey[] }) {
  const stage = useContext(BoxStage)
  const title = useContext(BoxTitle)
  const scope = `${stage?.stage} › ${title}`
  const canUndo = useCanUndoRoll(scope)
  if (!stage || !title || keys.length === 0) return null
  return (
    <div className={styles.verbs}>
      <Tip
        text={`Roll the ${keys.length} controls under ${title} somewhere new and leave the rest of ${stage.stage} where it stands.`}
      >
        <button
          className={styles.roll}
          aria-label={`roll ${title}`}
          onClick={() =>
            rollIn(
              scope,
              rollKeys(engine.controls.get(), keys, Math.random, true),
              stage.seconds,
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
          onClick={() => undoRoll(scope, stage.seconds)}
        >
          undo
        </button>
      </Tip>
    </div>
  )
}
