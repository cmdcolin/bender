import { useEffect, useRef } from 'react'
import { engine } from '../engine/engine'
import styles from './RailLamp.module.css'
import { Tip } from './Tip'

// Three cells in the battery compartment, which is what the toys ran on.
const NOMINAL_V = 4.5

// How long a reboot stays on the lamp. The rail is only down for 70 ms — long
// enough to hear and far too short to read — so the lamp holds the word.
const FLASH_MS = 260

// The rail, on the panel. It is the number everything else on the board comes
// off — pitch, tempo, how loud a voice is, whether the chip is running at all —
// and until now you could only infer it from the sound. Written straight to the
// DOM off the meter's own posts, the way the scope is: a React render every 8 ms
// to move one number is a render the board can feel.
export function RailLamp() {
  const dot = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    let seen = engine.meter.get().reboots
    let flashUntil = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const { rail, reboots } = engine.meter.get()
      if (reboots !== seen) {
        seen = reboots
        flashUntil = now + FLASH_MS
      }
      const flashing = now < flashUntil
      if (dot.current) {
        // Full cells are a lit lamp; a dying rail dims and reddens with it, and
        // a reboot is the one thing that lights it right up.
        dot.current.style.background = flashing
          ? 'var(--danger)'
          : `color-mix(in srgb, var(--accent2) ${Math.round(rail * 100)}%, #2a1a12)`
      }
      if (label.current) {
        label.current.textContent = flashing
          ? 'reboot'
          : `${(rail * NOMINAL_V).toFixed(2)} V`
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <Tip text="The toy's supply rail, 4.5 V on fresh cells. Everything the chip does rides on it: pitch and tempo sag as it falls, and under about half a volt the watchdog power-cycles the chip — which is what the lamp says on a reboot.">
      <span className={styles.lamp}>
        <span ref={dot} className={styles.dot} />
        <span ref={label} className={styles.volts}>
          {NOMINAL_V.toFixed(2)} V
        </span>
      </span>
    </Tip>
  )
}
