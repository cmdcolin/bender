import { engine } from '../engine/engine.ts'
import { GateJumper, TrigJack } from './GateCables.tsx'
import { Keybed } from './Keybed.tsx'
import { CvJack } from './ModJacks.tsx'
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
            notes={engine.pcmNotes}
            cutTip="No cable in Parlor’s GATE jack, so the keyboard plays these keys, its TRIG cable and nothing else. Press to plug Plinky’s notes in"
            solderedTip="Plinky’s notes reach Parlor through this cable, so the demo song plays it as well as these keys. Press to pull the cable"
          />
          <TrigJack taker="pcm" />
          <CvJack machine="Parlor" />
        </>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} supply="pcmSupply" />
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
