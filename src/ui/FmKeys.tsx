import { engine } from '../engine/engine'
import { useControlValue } from './ControlsContext'
import { Keybed } from './Keybed'
import styles from './FmKeys.module.css'
import { Tip } from './Tip'

// The FM chip's own keys: a bare board rather than a moulded shell, because the
// chip never had a keyboard — this is one somebody soldered onto it. The switch
// on its deck is the other end of that job: the jumper from the toy's gate, cut
// or left alone.
export function FmKeys() {
  const cut = useControlValue('fmKeyGate') > 0.5

  return (
    <Keybed
      dest="fm"
      label="fm keyboard"
      caseClass={styles.board}
      badge={
        <span className={styles.badge}>
          fm<span className={styles.part}> 2-op</span>
        </span>
      }
      extras={
        <Tip
          text={
            cut
              ? 'the jumper off the toy’s gate is cut: the chip answers these keys, the kit’s trigger lines and nothing else. Press to solder it back on'
              : 'the chip’s key input is soldered onto the toy’s gate, so it plays whatever the keyboard next door strikes as well as what you play here. Press to cut the jumper'
          }
        >
          <button
            className={cut ? styles.cut : styles.soldered}
            aria-pressed={cut}
            onClick={() => {
              engine.armStep()
              engine.set('fmKeyGate', cut ? 0 : 1)
            }}
          >
            {cut ? 'gate cut' : 'toy gate'}
          </button>
        </Tip>
      }
    />
  )
}
