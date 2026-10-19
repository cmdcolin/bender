import { engine } from '../engine/engine.ts'
import { useStoreValue } from './ControlsContext.ts'
import styles from './Recorder.module.css'
import { RecorderMore } from './RecorderMore.tsx'
import { Cassette } from './StudioArt.tsx'
import { TabKey } from './TabKey.tsx'
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
      <div className={styles.deck}>
        <div className={styles.top}>
          <span className={styles.name}>recorder</span>
          <div className={styles.tabs}>
            <Tip
              text={
                recording
                  ? 'Stops the take and saves it.'
                  : recStems
                    ? 'Records everything you hear from now until you stop, plus every source on its own — stopping saves the lot.'
                    : 'Records everything you hear, the whole session, from now until you stop — stopping saves it as a wav.'
              }
            >
              <TabKey
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
            <RecorderMore recording={recording} recStems={recStems} />
          </div>
        </div>
        <div className={styles.body}>
          <Cassette running={recording}>
            <span
              className={recording ? styles.counterOn : styles.counter}
              role="timer"
              aria-label="take time"
            >
              {clock(recSeconds)}
            </span>
          </Cassette>
        </div>
      </div>
      <p className={recording ? styles.captionOn : styles.caption}>
        {recording ? 'taping the whole session' : 'rec tapes the whole session'}
      </p>
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
