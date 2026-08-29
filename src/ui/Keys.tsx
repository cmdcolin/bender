import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { Keybed } from './Keybed'
import styles from './Keys.module.css'
import { RailLamp } from './RailLamp'
import { Tip } from './Tip'

// The toy: a moulded case with a badge, a speaker and its own melody memory on
// the deck, around the bed every keyboard on this board shares.
export function Keys() {
  // The memory's own switch, on the deck rather than only on the roll: arming
  // it is something you do with your hands already on the keys, and the roll is
  // one panel away behind whatever stage is open.
  const recording = useStoreValue(engine.tuneRecord)
  const tunePlaying = useStoreValue(engine.songPlaying)

  return (
    <Keybed
      dest="toy"
      label="toy keyboard"
      badge={
        <>
          <span className={styles.brand}>bender</span>
          <span className={styles.stripe} aria-hidden="true" />
        </>
      }
      extras={
        <>
          {/* On the deck, which is where a toy put everything. The lamp is the
              battery light: a note that comes out flat, quiet or not at all is
              that number falling. */}
          <RailLamp />
          <Tip
            text={
              !recording
                ? 'record what you play into the toy’s melody memory — thirty-two steps, three notes to a step, on the step the chip is standing on. It puts the memory on, and the tune has to be running for there to be a step. The piano roll is on the keyboard’s own panel'
                : tunePlaying
                  ? 'every key you press is going into the memory. Press to stop'
                  : 'armed, but the tune is stopped — the keys sound and nothing is written. Press play your tune and they land on the step they arrive in'
            }
          >
            <button
              className={
                !recording
                  ? styles.rec
                  : tunePlaying
                    ? styles.recOn
                    : styles.recIdle
              }
              aria-pressed={recording}
              onClick={() => engine.armTuneRecord(!recording)}
            >
              rec
            </button>
          </Tip>
        </>
      }
      tail={<span className={styles.grille} aria-hidden="true" />}
    />
  )
}
