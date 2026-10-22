import { useEffect, useRef, useState } from 'react'

import { engine } from '../engine/engine.ts'
import styles from './EffectPads.module.css'
import { claimPress, claimRelease } from './keyPress.ts'
import { Tip } from './Tip.tsx'

// A row of effect buttons over a keybed, the way the toys had them. Each one
// is down for as long as a finger, Enter or Space holds it. With the bed's
// hold switch on, a press latches the button until the next press on it.
export function EffectPads({
  dest,
  names,
  tips,
  hold = false,
  className,
}: {
  dest: 'toy' | 'fm'
  names: readonly string[]
  tips: readonly string[]
  hold?: boolean
  /** Sets the colour each button lights in, as `--cap-lit`. */
  className?: string
}) {
  const [down, setDown] = useState(-1)
  const latest = useRef(-1)
  useEffect(() => {
    if (!hold) return undefined
    return () => {
      if (latest.current >= 0) engine.sfx(dest, latest.current, false)
      latest.current = -1
      setDown(-1)
    }
  }, [hold, dest])
  const press = (sfx: number) => {
    if (hold && down === sfx) {
      engine.sfx(dest, sfx, false)
      latest.current = -1
      setDown(-1)
      return
    }
    engine.sfx(dest, sfx, true)
    latest.current = sfx
    setDown(sfx)
  }
  const release = (sfx: number) => {
    if (hold || down !== sfx) return
    latest.current = -1
    engine.sfx(dest, sfx, false)
    setDown(-1)
  }
  return (
    <div
      className={`${styles.row} ${className ?? ''}`}
      role="group"
      aria-label="effect buttons"
    >
      {names.map((name, sfx) => (
        <Tip key={name} text={tips[sfx] ?? name}>
          <button
            className={down === sfx ? styles.padOn : styles.pad}
            aria-pressed={down === sfx}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              press(sfx)
            }}
            onPointerUp={() => release(sfx)}
            onPointerCancel={() => release(sfx)}
            onLostPointerCapture={() => release(sfx)}
            onKeyDown={e => claimPress(e) && press(sfx)}
            onKeyUp={e => claimRelease(e) && release(sfx)}
          >
            {name}
          </button>
        </Tip>
      ))}
    </div>
  )
}
