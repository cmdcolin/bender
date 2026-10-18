import { useEffect, useRef } from 'react'

import { engine } from '../engine/engine.ts'
import styles from './RailLamp.module.css'
import { Tip } from './Tip.tsx'

// Three cells in the battery compartment, which is what the toys ran on.
const NOMINAL_V = 4.5

// How long a reboot stays on the lamp. The rail is only down for 70 ms — long
// enough to hear and far too short to read — so the lamp holds the word.
const FLASH_MS = 260

// The shared supply rail, drawn on the deck of every machine that runs off it.
// The lamp writes to the DOM off each meter post, because a React render every
// 8 ms for one number drops frames.
export function RailLamp() {
  const dot = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let seen = engine.meter.get().reboots
    let flashUntil = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let litAt = ''
    let says = ''
    // Runs on each meter post and writes only what changed. An unchanged
    // `textContent` write still swaps the text node and lays the document out
    // again.
    const paint = () => {
      const now = performance.now()
      const { rail, reboots } = engine.meter.get()
      if (reboots !== seen) {
        seen = reboots
        flashUntil = now + FLASH_MS
        clearTimeout(timer)
        timer = setTimeout(paint, FLASH_MS + 20)
      }
      const flashing = now < flashUntil
      const colour = flashing
        ? 'var(--alarm)'
        : `color-mix(in srgb, var(--accent2) ${Math.round(rail * 100)}%, #2a1a12)`
      if (dot.current && litAt !== colour) {
        litAt = colour
        dot.current.style.background = colour
      }
      const volts = flashing ? 'reboot' : `${(rail * NOMINAL_V).toFixed(2)} V`
      if (label.current && says !== volts) {
        says = volts
        label.current.textContent = volts
      }
    }
    const off = engine.meter.subscribe(paint)
    return () => {
      off()
      clearTimeout(timer)
    }
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
