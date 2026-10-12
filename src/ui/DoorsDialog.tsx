import { engine } from '../engine/engine'
import { DOORS, type Door } from './doors'
import styles from './DoorsDialog.module.css'
import { boardFrom } from './share'

// What a fresh tab opens onto: a handful of boards to start from, each one
// playing on the press, eased up over a couple of seconds.
export function DoorsDialog(props: { onClose: () => void }) {
  const { onClose } = props

  const enter = async (door: Door) => {
    engine.patch(boardFrom(door.board(), engine.controls.get()))
    await engine.start()
    engine.fadeIn()
    engine.runAll()
    onClose()
  }

  return (
    <dialog
      ref={el => {
        if (el && !el.open) el.showModal()
      }}
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
      aria-label="pick a way in"
      className={styles.card}
    >
      <p className={styles.title}>Where to start?</p>
      <ul className={styles.doors}>
        {DOORS.map((door, i) => (
          <li key={door.name}>
            <button
              className={i === 0 ? styles.first : styles.door}
              autoFocus={i === 0}
              onClick={() => void enter(door)}
            >
              <span className={styles.name}>▶ {door.name}</span>
              <span className={styles.says}>{door.says}</span>
            </button>
          </li>
        ))}
      </ul>
      <button className={styles.quiet} onClick={onClose}>
        or look around in silence
      </button>
    </dialog>
  )
}
