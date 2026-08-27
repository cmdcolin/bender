import { engine } from '../engine/engine'
import styles from './StartOverlay.module.css'

// What a shared link opens onto: a board already patched and waiting, with
// both run buttons small and one map among many things on the panel. Nobody
// finds those on the first look, so this sits over the whole page and says
// what to press. It only ever shows once — closing it, by any door, means the
// board is either playing or you asked to look at it in silence, and neither
// of those wants the overlay back on the next click.
export function StartOverlay(props: { onClose: () => void }) {
  const { onClose } = props

  const start = async () => {
    await engine.start()
    engine.fadeIn()
    engine.toggleRun()
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
      aria-label="start the board"
      className={styles.card}
    >
      <button className={styles.start} autoFocus onClick={start}>
        ▶ click to start
      </button>
      <p className={styles.line}>
        Somebody sent you this board. Nothing plays until you press it — the
        sound comes up over a couple of seconds rather than landing at full
        volume.
      </p>
      <button className={styles.quiet} onClick={onClose}>
        or look at it in silence
      </button>
    </dialog>
  )
}
