import styles from './FmKeys.module.css'
import { GateJumper, Keybed } from './Keybed.tsx'
import { RailLamp } from './RailLamp.tsx'

// FmKeys draws the FM chip's keyboard as a green circuit board with the chip on
// it and a row of piano keys. The switch on the deck cuts or solders
// the jumper from the toy's gate.
export function FmKeys({
  seconds,
  onClose,
  onOpen,
}: {
  seconds?: number
  onClose?: () => void
  onOpen?: (stage: string) => void
}) {
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
        <>
          <RailLamp onOpen={onOpen} />
          <GateJumper
            control="fmKeyGate"
            cut={styles.cut}
            soldered={styles.soldered}
            cutTip="the jumper off the toy’s gate is cut: the chip answers these keys, the kit’s trigger lines and nothing else. Press to solder it back on"
            solderedTip="the chip’s key input is soldered onto the toy’s gate, so it plays whatever the keyboard next door strikes as well as what you play here. Press to cut the jumper"
          />
        </>
      }
      stage="FM chip"
      seconds={seconds}
      onClose={onClose}
      tail={<span className={styles.header} aria-hidden="true" />}
    />
  )
}
