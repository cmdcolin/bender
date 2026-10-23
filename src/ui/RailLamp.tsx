import { useEffect, useRef } from 'react'

import { SUPPLY } from '../dsp/supplies.ts'
import { useBoardValue } from './ControlsContext.ts'
import styles from './RailLamp.module.css'
import { watchRail } from './railWatch.ts'
import { Tip } from './Tip.tsx'

import type { SupplyKey } from './controls/supply.ts'

// Three cells in the battery compartment, which is what the toys ran on.
const NOMINAL_V = 4.5

const FULL = 'var(--accent2)'

const TIPS: Record<number, string> = {
  [SUPPLY.shared]:
    'The shared cells, 4.5 V fresh, which every machine boots on. Pitch, tempo and level sag as they fall, and near one volt the watchdog reboots every machine on them, which the lamp shows as reboot.',
  [SUPPLY.second]:
    'The second cells, 4.5 V fresh. Pitch, tempo and level sag as they fall, and near one volt their own watchdog reboots only the machines on them, which the lamp shows as reboot.',
  [SUPPLY.bench]:
    'A bench supply: a stiff 4.5 V that never sags, never reboots and ignores load.',
}

// The rail a machine runs off, drawn on its deck: `supply` names the machine's
// selector, or `cells` names a supply outright. The lamp writes to the DOM off
// each meter post, because a React render every 8 ms for one number drops
// frames.
export function RailLamp({
  onOpen,
  supply,
  cells = SUPPLY.shared,
}: {
  onOpen?: (stage: string) => void
  supply?: SupplyKey
  cells?: number
}) {
  const dot = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const on = useBoardValue(c => (supply ? Math.round(c[supply]) : cells))

  useEffect(() => {
    if (on === SUPPLY.bench) {
      if (dot.current) dot.current.style.background = FULL
      if (label.current) label.current.textContent = 'bench'
      return undefined
    }
    let litAt = ''
    let says = ''
    // An unchanged `textContent` write still swaps the text node and lays the
    // document out again, so the lamp writes only what changed.
    return watchRail((rail, rebooting) => {
      const colour = rebooting
        ? 'var(--alarm)'
        : `color-mix(in srgb, ${FULL} ${Math.round(rail * 100)}%, #2a1a12)`
      if (dot.current && litAt !== colour) {
        litAt = colour
        dot.current.style.background = colour
      }
      const volts = rebooting ? 'reboot' : `${(rail * NOMINAL_V).toFixed(2)} V`
      if (label.current && says !== volts) {
        says = volts
        label.current.textContent = volts
      }
    }, on === SUPPLY.second)
  }, [on])

  const lamp = (
    <>
      <span ref={dot} className={styles.dot} />
      <span ref={label} className={styles.volts}>
        {NOMINAL_V.toFixed(2)} V
      </span>
    </>
  )
  const tip = TIPS[on] ?? TIPS[SUPPLY.shared]!

  return (
    <Tip text={onOpen ? `${tip} Press it for the power supply settings.` : tip}>
      {onOpen ? (
        <button
          type="button"
          className={`${styles.lamp} ${styles.press}`}
          aria-label="power supply settings"
          onClick={() => onOpen('Power supply')}
        >
          {lamp}
        </button>
      ) : (
        <span className={styles.lamp}>{lamp}</span>
      )}
    </Tip>
  )
}
