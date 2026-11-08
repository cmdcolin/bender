import { engine } from '../engine/engine.ts'
import { Dialog } from './components/Dialog.tsx'
import { useStoreValue } from './ControlsContext.ts'
import styles from './StartOverlay.module.css'

export function StartOverlay(props: { onClose: () => void }) {
  const { onClose } = props

  const fault = useStoreValue(engine.fault)

  const start = async () => {
    try {
      await engine.start()
    } catch {
      return
    }
    engine.fadeIn()
    engine.runLink()
    onClose()
  }

  return (
    <Dialog
      label="start the board"
      size="narrow"
      loud
      onCancel={onClose}
      className={styles.card}
    >
      <button className={styles.start} autoFocus onClick={start}>
        ▶ click to start
      </button>
      {fault !== '' && (
        <p className={styles.line} role="alert">
          {fault}
        </p>
      )}
      <p className={styles.line}>
        Somebody sent you this board. Nothing plays until you press it — the
        sound comes up over a couple of seconds rather than landing at full
        volume.
      </p>
      <button className={styles.quiet} onClick={onClose}>
        or look at it in silence
      </button>
    </Dialog>
  )
}
