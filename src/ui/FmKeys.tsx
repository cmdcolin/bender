import styles from './FmKeys.module.css'
import { GateJumper, Keybed } from './Keybed'

// FmKeys draws the FM chip's keyboard as a green circuit board with the chip on
// it and push-button switches for keys. The switch on the deck cuts or solders
// the jumper from the toy's gate.
export function FmKeys() {
  return (
    <Keybed
      dest="fm"
      label="fm keyboard"
      caseClass={styles.board}
      badge={
        <span className={styles.chip}>
          <span className={styles.package}>
            <span className={styles.part}>fm2</span>
            <span className={styles.sub}>2-op</span>
          </span>
        </span>
      }
      extras={
        <GateJumper
          control="fmKeyGate"
          cut={styles.cut}
          soldered={styles.soldered}
          cutTip="the jumper off the toy’s gate is cut: the chip answers these keys, the kit’s trigger lines and nothing else. Press to solder it back on"
          solderedTip="the chip’s key input is soldered onto the toy’s gate, so it plays whatever the keyboard next door strikes as well as what you play here. Press to cut the jumper"
        />
      }
      tail={<span className={styles.header} aria-hidden="true" />}
    />
  )
}
