import { GateJumper, Keybed } from './Keybed'
import styles from './MonoKeys.module.css'

// The mono synth's bed: walnut cheeks, a black panel with three knob caps for
// the oscillators, and the jumper off the toy's gate.
export function MonoKeys() {
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
        <GateJumper
          control="monoKeyGate"
          cut={styles.cut}
          soldered={styles.soldered}
          cutTip="the jumper off the toy’s gate is cut, so notes reach the synth from these keys, the kit’s trigger lines and a controller. Press to solder it back on"
          solderedTip="the synth’s key input is soldered onto the toy’s gate, so the tune next door plays it too, an octave or two down. Press to cut the jumper"
        />
      }
      tail={<span className={styles.rocker} aria-hidden="true" />}
    />
  )
}
