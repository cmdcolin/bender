import { useEffect, useRef } from 'react'

import styles from './RailLamp.module.css'
import { watchRail } from './railWatch.ts'
import { Tip } from './Tip.tsx'

// Three cells in the battery compartment, which is what the toys ran on.
const NOMINAL_V = 4.5

// The shared supply rail, drawn on the deck of every machine that runs off it.
// The lamp writes to the DOM off each meter post, because a React render every
// 8 ms for one number drops frames.
export function RailLamp() {
  const dot = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let litAt = ''
    let says = ''
    // An unchanged `textContent` write still swaps the text node and lays the
    // document out again, so the lamp writes only what changed.
    return watchRail((rail, rebooting) => {
      const colour = rebooting
        ? 'var(--alarm)'
        : `color-mix(in srgb, var(--accent2) ${Math.round(rail * 100)}%, #2a1a12)`
      if (dot.current && litAt !== colour) {
        litAt = colour
        dot.current.style.background = colour
      }
      const volts = rebooting ? 'reboot' : `${(rail * NOMINAL_V).toFixed(2)} V`
      if (label.current && says !== volts) {
        says = volts
        label.current.textContent = volts
      }
    })
  }, [])

  return (
    <Tip text="The battery rail the toy keyboard, drums, FM chip, home keyboard and mono synth share, 4.5 V on fresh cells. Pitch, tempo and level sag as it falls, and near one volt the watchdog reboots the chips, which the lamp shows as reboot.">
      <span className={styles.lamp}>
        <span ref={dot} className={styles.dot} />
        <span ref={label} className={styles.volts}>
          {NOMINAL_V.toFixed(2)} V
        </span>
      </span>
    </Tip>
  )
}
