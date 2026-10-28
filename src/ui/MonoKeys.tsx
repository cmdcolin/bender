import { engine } from '../engine/engine.ts'
import { GateJumper, TrigJack } from './GateCables.tsx'
import { Keybed } from './Keybed.tsx'
import { CvJack } from './ModJacks.tsx'
import styles from './MonoKeys.module.css'
import { RailLamp } from './RailLamp.tsx'
import { SeqRec } from './SeqRec.tsx'

// The mono synth's bed: walnut cheeks, a black panel with three knob caps for
// the oscillators, and the jumper off the toy's gate.
export function MonoKeys({
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
      dest="mono"
      label="growler"
      caseClass={styles.case}
      badge={
        <span className={styles.badge}>
          <span className={styles.model}>growler</span>
          <span className={styles.knobs} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      }
      jack={
        <>
          <GateJumper
            taker="mono"
            notes={engine.monoNotes}
            cutTip="No cable in Growler’s GATE jack, so notes reach the synth from these keys, its TRIG cable and a controller. Press to plug Plinky’s notes in"
            solderedTip="Plinky’s notes reach Growler through this cable, so the tune plays it too, an octave or two down. Press to pull the cable"
          />
          <TrigJack taker="mono" />
          <CvJack machine="Growler" />
        </>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} supply="monoSupply" />
          <SeqRec dest="mono" name="Growler" />
        </>
      }
      stage="Growler"
      onOpen={onOpen}
      seconds={seconds}
      onClose={onClose}
      tail={<span className={styles.rocker} aria-hidden="true" />}
    />
  )
}
