import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import styles from './DeviceVerbs.module.css'
import { rollGroup } from './presets/index.ts'
import { rollIn } from './rollBack.ts'
import { Tip } from './Tip.tsx'

// The two caps every instrument on the bench carries: roll that machine's
// stage somewhere new, and, while the bench shows every instrument, put the
// machine away.
export function DeviceVerbs({
  stage,
  seconds = 0,
  onClose,
}: {
  stage: string
  seconds?: number
  onClose?: () => void
}) {
  const group = GROUPS.find(g => g.name === stage)
  if (!group) throw new Error(`no stage named ${stage}`)
  return (
    <>
      <Tip
        text={`Rolls every control in ${stage} somewhere new and leaves the rest of the board alone. Undo is on the stage's own panel.`}
      >
        <button
          className={styles.cap}
          onClick={() =>
            rollIn(
              stage,
              rollGroup(group, engine.controls.get(), Math.random),
              seconds,
            )
          }
        >
          randomize
        </button>
      </Tip>
      {onClose && (
        <Tip text={`Puts ${stage} away. Its sound stays on the board.`}>
          <button
            className={styles.cap}
            aria-label={`close ${stage}`}
            onClick={onClose}
          >
            ×
          </button>
        </Tip>
      )}
    </>
  )
}
