import { useEffect, useRef, useState } from 'react'

import { engine } from '../engine/engine.ts'
import { TAP_BUS } from '../engine/params.ts'
import { CHANNELS, DUCKS, sliderFor } from './controls/index.ts'
import { useBoardValue } from './ControlsContext.ts'
import { Dial } from './Dial.tsx'
import { shownOn } from './fitted.ts'
import { FALL, HOT, position, SILENT } from './meterScale.ts'
import styles from './Mixer.module.css'
import { ControlSlider } from './Slider.tsx'
import { Tip } from './Tip.tsx'

// The strips, and the bus under them. Fixed at module load rather than worked
// out per render: the desk is the desk. Every channel that reaches the bus is
// drawn, which is a longer list than the group's `borrows` — the mic and the
// sampler are yours to set and the desk's only to show.
const ROWS = CHANNELS.map(c => ({
  ...c,
  def: sliderFor(c.key),
  duck: DUCKS[c.tap],
}))
const TAPS = [...ROWS.map(r => r.tap), TAP_BUS]

// The desk. Every source's fader on one screen with a meter beside it, which is
// the pair of questions a mix is: how far is this up, and is anything coming out
// of it. They are not the same question — a fader at zero and a fader at three
// quarters on a chip nothing has struck read the same on the board and nothing
// alike here.
//
// The bars are written straight to the DOM off the meter's own posts, the way
// the rail lamp and the scope are: eight React renders a frame to move eight
// widths is a panel the board can feel.
export function Mixer() {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const lamps = useRef<(HTMLSpanElement | null)[]>([])
  const readout = useRef<HTMLSpanElement>(null)
  const [all, setAll] = useState(false)
  const onMap = useBoardValue(c => {
    const shown = shownOn(c)
    return ROWS.filter(r => shown.has(r.name))
      .map(r => r.name)
      .join('|')
  }).split('|')
  const away = ROWS.filter(r => !onMap.includes(r.name))

  useEffect(() => {
    let raf = 0
    const held = new Float32Array(TAPS.length)
    // What each bar is already painted, so a frame that changes nothing writes
    // nothing: a style write is a style write whether or not the string differs,
    // and on a stock board four of the eight are empty and stay empty.
    const painted: (string | undefined)[] = []
    const lit: (string | undefined)[] = []
    const glow = new Float32Array(ROWS.length)
    const glowing: (string | undefined)[] = []
    const draw = () => {
      raf = 0
      const { taps, ldr } = engine.meter.get()
      let moving = false
      for (const [i, row] of ROWS.entries()) {
        const lamp = lamps.current[i]
        if (lamp) {
          const fell = glow[i]! * FALL
          glow[i] = Math.max(ldr[row.tap] ?? 0, fell < SILENT ? 0 : fell)
          if (glow[i] > 0) moving = true
          const opacity = glow[i].toFixed(2)
          if (glowing[i] !== opacity) {
            glowing[i] = opacity
            lamp.style.opacity = opacity
          }
        }
      }
      for (const [i, tap] of TAPS.entries()) {
        const bar = bars.current[i]
        if (bar) {
          const fell = held[i]! * FALL
          held[i] = Math.max(taps[tap] ?? 0, fell < SILENT ? 0 : fell)
          if (held[i] > 0) moving = true
          const pos = position(held[i])
          const width = `scaleX(${pos})`
          if (painted[i] !== width) {
            painted[i] = width
            bar.style.transform = width
          }
          const colour = pos > HOT ? 'var(--alarm)' : 'var(--accent)'
          if (lit[i] !== colour) {
            lit[i] = colour
            bar.style.background = colour
          }
        }
      }
      const bus = held[held.length - 1]!
      const peak = bus > 0 ? `${(20 * Math.log10(bus)).toFixed(0)} dB` : '-∞ dB'
      if (readout.current && readout.current.textContent !== peak)
        readout.current.textContent = peak
      if (moving) schedule()
    }
    // A frame per meter post that carries a level, and frames after that only
    // while a bar is still falling. A desk with nothing on it requests none.
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(draw)
    }
    const off = engine.meter.subscribe(() => {
      const { taps, ldr } = engine.meter.get()
      if (TAPS.some(tap => (taps[tap] ?? 0) > 0) || ldr.some(d => d > 0))
        schedule()
    })
    schedule()
    return () => {
      off()
      cancelAnimationFrame(raf)
    }
  }, [])

  const bar = (i: number) => (
    <span
      ref={el => {
        bars.current[i] = el
      }}
      className={styles.fill}
    />
  )

  return (
    <>
      {ROWS.map(({ def, name, duck }, i) =>
        all || onMap.includes(name) ? (
          <div key={def.key} className={styles.strip}>
            <div className={styles.channel}>
              <ControlSlider def={def} label={name} />
              <span className={styles.track}>{bar(i)}</span>
            </div>
            {duck && (
              <span className={styles.duck}>
                <Dial def={duck} small />
                <span className={styles.lamp}>
                  <span
                    ref={el => {
                      lamps.current[i] = el
                    }}
                    className={styles.glow}
                  />
                </span>
              </span>
            )}
          </div>
        ) : null,
      )}
      {away.length > 0 && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? '▴ hide' : '▾ show'} {away.length} off the board
        </button>
      )}
      <Tip text="What the channels above add up to, before a single effect — read where the faders meet rather than at the output, so it says which of them is eating the headroom rather than what the limiter did about it.">
        <div className={styles.bus}>
          <span className={styles.busName}>mix bus</span>
          <span className={styles.busTrack}>{bar(TAPS.length - 1)}</span>
          <span ref={readout} className={styles.busPeak}>
            -∞ dB
          </span>
        </div>
      </Tip>
    </>
  )
}
