import { RailLamp } from './RailLamp.tsx'
import styles from './SupplyReading.module.css'

// The rail's voltage at the head of its own panel, with the five machines it
// feeds named beside it. The lamp on each deck reads the same rail.
export function SupplyReading() {
  return (
    <div className={styles.reading}>
      <RailLamp />
      <p className={styles.feeds}>
        Feeds the toy keyboard, toy drums, FM chip, home keyboard and mono
        synth. Every knob here sags all five at once.
      </p>
    </div>
  )
}
