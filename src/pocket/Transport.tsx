import { engine } from '../engine/engine'
import { useStoreValue } from '../ui/ControlsContext'
import styles from './pocket.module.css'

const clock = (seconds: number) => {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Record at the left, run and stop in the middle where a camera keeps its
// shutter, and undo at the right.
export function Transport(props: { onPlay: () => void }) {
  const song = useStoreValue(engine.songPlaying)
  const drums = useStoreValue(engine.drumsPlaying)
  const recording = useStoreValue(engine.recording)
  const recSeconds = useStoreValue(engine.recSeconds)
  const walk = useStoreValue(engine.history)
  const playing = song || drums

  return (
    <div className={styles.row}>
      <button
        className={recording ? styles.recOn : styles.rec}
        aria-label={recording ? 'stop and save the take' : 'record a wav'}
        onClick={() =>
          recording ? engine.stopRecording() : engine.startRecording()
        }
      >
        <span className={styles.recDot} />
        {recording ? clock(recSeconds) : 'rec'}
      </button>
      <button
        className={playing ? styles.playOn : styles.play}
        aria-label={playing ? 'stop' : 'play'}
        onClick={props.onPlay}
      >
        {playing ? '■' : '▶'}
      </button>
      <button
        className={styles.side}
        aria-label="undo"
        disabled={walk.past.length === 0}
        onClick={() => engine.undo(1)}
      >
        ↶
      </button>
    </div>
  )
}
