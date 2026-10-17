import { engine } from '../engine/engine.ts'
import { GROUPS } from './controls/index.ts'
import { useControlValue } from './ControlsContext.ts'
import styles from './DeviceVerbs.module.css'
import { rollGroup } from './presets/index.ts'
import { rollIn } from './rollBack.ts'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'

const MUTE_OF: Record<string, ControlKey> = {
  'Toy keyboard': 'chipMute',
  'Toy drums': 'drumMute',
  'FM chip': 'fmMute',
  'Home keyboard': 'pcmMute',
  'Mono synth': 'monoMute',
}

function Mute({ stage, control }: { stage: string; control: ControlKey }) {
  const muted = useControlValue(control) > 0.5
  return (
    <Tip
      text={
        muted
          ? `${stage} is muted. Unmute brings it back at the Level you left.`
          : `Silences ${stage} and leaves its Level where it is.`
      }
    >
      <button
        className={muted ? styles.capOn : styles.cap}
        aria-label={`mute ${stage}`}
        aria-pressed={muted}
        onClick={() => {
          engine.armStep()
          engine.set(control, muted ? 0 : 1)
        }}
      >
        <svg className={styles.speaker} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1 4h2.5L7 1v10L3.5 8H1Z" />
          {muted ? (
            <path d="M8.5 4.2 9.2 3.5 10.5 4.8 11.8 3.5 12.5 4.2 11.2 5.5 12.5 6.8 11.8 7.5 10.5 6.2 9.2 7.5 8.5 6.8 9.8 5.5Z" />
          ) : (
            <path
              d="M8.5 4a2.5 2.5 0 0 1 0 4M9.5 2.5a4.5 4.5 0 0 1 0 7"
              fill="none"
              stroke="currentColor"
            />
          )}
        </svg>
      </button>
    </Tip>
  )
}

// The caps every instrument on the bench carries: mute that machine, roll its
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
  const mute = MUTE_OF[stage]
  return (
    <>
      {mute && <Mute stage={stage} control={mute} />}
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
