import { useEffect, useRef } from 'react'
import { engine } from '../engine/engine'
import { TAP_BUS } from '../engine/params'
import { CHANNELS, sliderFor } from './controls'
import { ControlSlider } from './Slider'
import styles from './Mixer.module.css'
import { Tip } from './Tip'

// Where a channel doing nothing at all sits on the bar. A fader is linear and
// hearing is not: half up is six decibels down, which on a linear meter is a bar
// still half full. Forty-eight decibels of travel puts a channel you can only
// just hear at the left-hand end rather than off the scale.
const FLOOR_DB = 48
const HOT = 0.7

// How fast a bar falls. The taps come back as the peak since the last meter,
// sixteen milliseconds of it, and a kick read that way is one frame at full and
// then nothing — so the rise is instant and the fall is not, which is what every
// meter with a needle in it does for the same reason.
const FALL = 0.86

// The strips, and the bus under them. Fixed at module load rather than worked
// out per render: the desk is the desk. Every channel that reaches the bus is
// drawn, which is a longer list than the group's `borrows` — the mic and the
// sampler are yours to set and the desk's only to show.
const ROWS = CHANNELS.map(c => ({ ...c, def: sliderFor(c.key) }))
const TAPS = [...ROWS.map(r => r.tap), TAP_BUS]

const position = (v: number) =>
  v <= 0 ? 0 : Math.min(Math.max(1 + (20 * Math.log10(v)) / FLOOR_DB, 0), 1)

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
  const readout = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const held = new Float32Array(TAPS.length)
    // What each bar is already painted, so a frame that changes nothing writes
    // nothing: a style write is a style write whether or not the string differs,
    // and on a stock board four of the eight are empty and stay empty.
    const painted: (string | undefined)[] = []
    const lit: (string | undefined)[] = []
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const taps = engine.meter.get().taps
      for (const [i, tap] of TAPS.entries()) {
        const bar = bars.current[i]
        if (bar) {
          held[i] = Math.max(taps[tap] ?? 0, held[i]! * FALL)
          const pos = position(held[i]!)
          const width = `scaleX(${pos})`
          if (painted[i] !== width) {
            painted[i] = width
            bar.style.transform = width
          }
          const colour = pos > HOT ? 'var(--danger)' : 'var(--accent)'
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
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
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
      {ROWS.map(({ def, name }, i) => (
        <div key={def.key} className={styles.strip}>
          <ControlSlider def={def} label={name} />
          <span className={styles.track}>{bar(i)}</span>
        </div>
      ))}
      <Tip text="what the channels above add up to, before a single bend — read where the faders meet rather than at the output, so it says which of them is eating the headroom rather than what the limiter did about it">
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
