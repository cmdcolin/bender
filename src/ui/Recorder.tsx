import { engine } from '../engine/engine.ts'
import { useStoreValue } from './ControlsContext.ts'
import { MachineKey } from './MachineKey.tsx'
import styles from './Recorder.module.css'
import { RecorderMore } from './RecorderMore.tsx'
import { Cassette } from './StudioArt.tsx'
import { Tip } from './Tip.tsx'

function clock(seconds: number): string {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Recorder() {
  const recording = useStoreValue(engine.recording)
  const recSeconds = useStoreValue(engine.recSeconds)
  const recStems = useStoreValue(engine.recStems)
  const recError = useStoreValue(engine.recError)
  const recNote = useStoreValue(engine.recNote)

  return (
    <section className={styles.box} aria-label="recorder">
      <div className={styles.head}>
        <span className={styles.name}>recorder</span>
        <RecorderMore recording={recording} recStems={recStems} />
      </div>
      <div className={styles.machine}>
        <Cassette running={recording}>
          <span
            className={recording ? styles.counterOn : styles.counter}
            role="timer"
            aria-label="take time"
          >
            {clock(recSeconds)}
          </span>
        </Cassette>
        <div className={styles.keys}>
          <Tip
            text={
              recording
                ? 'Stops the take and saves it.'
                : recStems
                  ? 'Records the output and every source that had something on it — stopping saves the lot.'
                  : 'Records the output to a wav file — stopping saves it.'
            }
          >
            <MachineKey
              legend={recording ? 'stop' : 'rec'}
              name={
                recording
                  ? 'stop and save'
                  : recStems
                    ? 'record stems'
                    : 'record wav'
              }
              red
              latched={recording}
              onClick={() =>
                recording ? engine.stopRecording() : engine.startRecording()
              }
            />
          </Tip>
        </div>
      </div>
      {recError && (
        <p className={styles.error} role="alert">
          the take was not saved: {recError}
        </p>
      )}
      {recNote && (
        <p className={styles.note} role="status">
          {recNote}
        </p>
      )}
    </section>
  )
}
