import styles from './OrderRack.module.css'
import { PedalRack } from './PedalRack'
import { SlotRack } from './SlotRack'

// The one button that governs order, in two sections rather than two doors:
// the six sockets the bends compete for, and the five pedals waiting
// downstream of them. Same question both times — what the signal meets
// first — so one door asks it, even though SlotRack and PedalRack answer it
// differently: a bend can sit out, and a pedal never does.
export function OrderRack() {
  return (
    <>
      <div className={styles.heading}>Onboard effects</div>
      <SlotRack />
      <div className={styles.heading}>Pedals</div>
      <PedalRack />
    </>
  )
}
