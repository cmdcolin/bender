import { useEffect, useState } from 'react'

import { engine } from '../engine/engine'
import { useStoreValue } from '../ui/ControlsContext'
import { deliver } from './deliver'
import styles from './pocket.module.css'

const clock = (seconds: number) => {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Record at the left with the last take beside it, run and stop in the middle
// where a camera keeps its shutter, and undo at the right. A take lands on the
// page rather than in the downloads folder, and its chip opens the share sheet.
export function Transport(props: { onPlay: () => void }) {
  const song = useStoreValue(engine.songPlaying)
  const drums = useStoreValue(engine.drumsPlaying)
  const recording = useStoreValue(engine.recording)
  const recSeconds = useStoreValue(engine.recSeconds)
  const walk = useStoreValue(engine.history)
  const playing = song || drums
  const [take, setTake] = useState<{ file: File; seconds: number } | null>(null)

  useEffect(() => {
    engine.takeTo = file => setTake({ file, seconds: engine.recSeconds.get() })
    return () => {
      engine.takeTo = null
    }
  }, [])

  return (
    <div className={styles.row}>
      <span className={styles.left}>
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
        {take === null || recording ? null : (
          <button
            className={styles.take}
            aria-label={`save or share the ${clock(take.seconds)} take`}
            onClick={() => void deliver(take.file)}
          >
            <span className={styles.takeIcon}>⤴</span>
            {clock(take.seconds)}
          </button>
        )}
      </span>
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
