import { engine } from '../engine/engine.ts'
import { GateJumper, TrigJack } from './GateCables.tsx'
import { Keybed } from './Keybed.tsx'
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
      label="parlor"
      caseClass={styles.case}
      badge={
        <span className={styles.badge}>
          <span className={styles.model}>parlor</span>
          <span className={styles.strip} aria-hidden="true" />
        </span>
      }
      jack={
        <>
          <GateJumper
            taker="pcm"
            control="pcmKeyGate"
            notes={engine.pcmNotes}
            cutTip="the jumper off Plinky’s gate is cut: the keyboard answers these keys, the kit’s trigger lines and nothing else. Press to solder it back on"
            solderedTip="the keyboard’s key input is soldered onto Plinky’s gate, so the demo song next door plays it as well as what you play here. Press to cut the jumper"
          />
          <TrigJack taker="pcm" />
        </>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} />
          <SeqRec dest="pcm" name="Parlor" />
        </>
      }
      stage="Parlor"
      onOpen={onOpen}
      seconds={seconds}
      onClose={onClose}
      tail={<span className={styles.window} aria-hidden="true" />}
    />
  )
}
