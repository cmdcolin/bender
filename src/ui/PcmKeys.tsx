import { engine } from '../engine/engine.ts'
import { GateJumper, Keybed } from './Keybed.tsx'
import styles from './PcmKeys.module.css'
import { RailLamp } from './RailLamp.tsx'
import { SeqRec } from './SeqRec.tsx'

// The home keyboard's bed: a grey moulded case with the model name on the deck,
// a window over the sample memory, and the same jumper off the toy's gate the
// FM chip has.
export function PcmKeys({
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
      dest="pcm"
      label="home keyboard"
      caseClass={styles.case}
      badge={
        <span className={styles.badge}>
          <span className={styles.model}>pcm-8</span>
          <span className={styles.strip} aria-hidden="true" />
        </span>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} />
          <SeqRec dest="pcm" name="home keyboard" />
          <GateJumper
            control="pcmKeyGate"
            notes={engine.pcmNotes}
            cut={styles.cut}
            soldered={styles.soldered}
            cutTip="the jumper off the toy’s gate is cut: the keyboard answers these keys, the kit’s trigger lines and nothing else. Press to solder it back on"
            solderedTip="the keyboard’s key input is soldered onto the toy’s gate, so the demo song next door plays it as well as what you play here. Press to cut the jumper"
          />
        </>
      }
      stage="Home keyboard"
      seconds={seconds}
      onClose={onClose}
      tail={<span className={styles.window} aria-hidden="true" />}
    />
  )
}
