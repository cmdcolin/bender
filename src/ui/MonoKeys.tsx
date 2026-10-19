import { engine } from '../engine/engine.ts'
import { GateJumper, Keybed } from './Keybed.tsx'
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
      label="mono synth"
      caseClass={styles.case}
      badge={
        <span className={styles.badge}>
          <span className={styles.model}>mono</span>
          <span className={styles.knobs} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      }
      extras={
        <>
          <RailLamp onOpen={onOpen} />
          <SeqRec dest="mono" name="mono synth" />
          <GateJumper
            control="monoKeyGate"
            notes={engine.monoNotes}
            cut={styles.cut}
            soldered={styles.soldered}
            cutTip="the jumper off the Toy keyboard’s gate is cut, so notes reach the synth from these keys, the kit’s trigger lines and a controller. Press to solder it back on"
            solderedTip="the synth’s key input is soldered onto the Toy keyboard’s gate, so the tune next door plays it too, an octave or two down. Press to cut the jumper"
          />
        </>
      }
      stage="Mono synth"
      onOpen={onOpen}
      seconds={seconds}
      onClose={onClose}
      tail={<span className={styles.rocker} aria-hidden="true" />}
    />
  )
}
