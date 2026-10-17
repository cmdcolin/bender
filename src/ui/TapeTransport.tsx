import { engine } from '../engine/engine.ts'
import { useBoardValue } from './ControlsContext.ts'
import styles from './TapeTransport.module.css'
import { Tip } from './Tip.tsx'
import { ToggleButtonGroup } from './ToggleButtonGroup.tsx'

const SPEED_LABELS = ['½×', '1×', '2×'] as const
type Speed = (typeof SPEED_LABELS)[number]
const SPEEDS: Record<Speed, number> = { '½×': 0.5, '1×': 1, '2×': 2 }

const NOTHING =
  'Nothing on the tape yet. Load one, drop a file or open the mic.'

function play() {
  const c = engine.controls.get()
  if (c.sampleLevel > 0) {
    engine.set('sampleLevel', 0)
    return
  }
  engine.set('sampleLevel', 0.7)
  if (c.sampleMode === 1) engine.seekSample(Math.min(c.loopIn, c.loopOut))
}

// What you do to a tape loop with your hand on it: start it, stop it, turn it
// round, run it at half or double. The Speed knob in the panel does all of it
// and more; these are the four presses that come up every time.
export function TapeTransport({ loaded }: { loaded: boolean }) {
  const running = useBoardValue(c => c.sampleLevel > 0)
  const speed = useBoardValue(c => c.sampleSpeed)
  const reversed = speed < 0
  const current =
    SPEED_LABELS.find(l => Math.abs(Math.abs(speed) - SPEEDS[l]) < 0.005) ??
    null

  return (
    <div className={styles.row}>
      <Tip
        text={
          loaded
            ? 'Starts or stops the tape. A one-shot starts again from the front.'
            : NOTHING
        }
      >
        <button
          className={running ? styles.verbOn : styles.verb}
          aria-pressed={running}
          disabled={!loaded}
          onClick={play}
        >
          {running ? '■ stop' : '▶ play'}
        </button>
      </Tip>
      <Tip
        text={
          loaded
            ? 'Runs the tape backwards from where the head stands. Press again to go forwards.'
            : NOTHING
        }
      >
        <button
          className={reversed ? styles.verbOn : styles.verb}
          aria-pressed={reversed}
          disabled={!loaded}
          onClick={() => engine.set('sampleSpeed', speed === 0 ? -1 : -speed)}
        >
          ◀ reverse
        </button>
      </Tip>
      <Tip
        text={
          loaded
            ? 'Tape speed: half, normal or double, in whichever direction it is running. The Speed knob in the panel goes anywhere between.'
            : NOTHING
        }
      >
        <div>
          <ToggleButtonGroup
            label="tape speed"
            options={SPEED_LABELS}
            value={current}
            disabled={!loaded}
            large
            onChange={l =>
              engine.set('sampleSpeed', (reversed ? -1 : 1) * SPEEDS[l])
            }
          />
        </div>
      </Tip>
    </div>
  )
}
