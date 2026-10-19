import { engine } from '../engine/engine.ts'
import { useStoreValue } from './ControlsContext.ts'
import { DeckGroup, DeckKey, DeckWell } from './DeckKey.tsx'
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
      <span className={styles.name}>recorder</span>
      <div className={styles.machine}>
        <div className={styles.door}>
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
        <div className={styles.keys}>
          <DeckWell label="recorder keys">
            <DeckGroup>
              <Tip
                text={
                  recStems
                    ? 'Records the output and every source that had something on it — stopping saves the lot.'
                    : 'Records the output to a wav file — stopping saves it.'
                }
              >
                <DeckKey
                  glyph="rec"
                  legend="rec"
                  name={recStems ? 'record stems' : 'record wav'}
                  red
                  latched={recording}
                  onClick={() => {
                    if (!recording) engine.startRecording()
                  }}
                />
              </Tip>
              <Tip text="Stops the take and saves it.">
                <DeckKey
                  glyph="stop"
                  legend="stop"
                  name="stop and save"
                  disabled={!recording}
                  onClick={() => engine.stopRecording()}
                />
              </Tip>
            </DeckGroup>
            <DeckGroup>
              <RecorderMore recording={recording} recStems={recStems} />
            </DeckGroup>
          </DeckWell>
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
