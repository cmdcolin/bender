import styles from './OrderRack.module.css'
import { PedalRack } from './PedalRack.tsx'
import { SlotRack } from './SlotRack.tsx'

export function OrderRack() {
  return (
    <>
      <div className={styles.heading}>Sockets</div>
      <SlotRack />
      <div className={styles.heading}>After the sockets</div>
      <PedalRack />
    </>
  )
}
