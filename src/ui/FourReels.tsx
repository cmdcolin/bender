import { useEffect, useRef } from 'react'

import { TRACKS } from '../dsp/stages/fourTrack'
import { PEAK_BINS } from '../dsp/stages/sampler'
import { engine } from '../engine/engine'
import styles from './FourReels.module.css'
import { Tip } from './Tip'

import type { Controls } from '../controls'

const ROW = 22
const GAP = 4
const LABEL = 18

// The tape lit while that loop is somewhere you can hear it, grey while it is
// not; shed oxide in rust under it; the head white.
const LIT = '#ff5d3b'
const DIM = '#3a3a40'
const RUST = '#9a4a2a'
const HEAD = '#e8e8ea'
const BG = '#0a0a0c'

const CUE = ['four1Cue', 'four2Cue', 'four3Cue', 'four4Cue'] as const
const FADER = ['four1Fader', 'four2Fader', 'four3Fader', 'four4Fader'] as const

const heard = (c: Controls, k: number) =>
  c.fourLevel > 0 && (c[CUE[k]!] > 0 || c[FADER[k]!] > 0)

// The four loops, drawn: what is on each, where its head stands and where its
// oxide has come away. One canvas written off the meter, as the sampler's reel
// is, so the heads can move every frame without a React render.
export function FourReels() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const laps = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return undefined
    const g = el.getContext('2d')
    if (!g) return undefined
    let raf = 0
    let said = ''
    const draw = () => {
      raf = 0
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(Math.round(el.clientWidth * dpr), 1)
      const h = Math.max(Math.round(el.clientHeight * dpr), 1)
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
      }
      const m = engine.meter.get()
      const c = engine.controls.get()
      g.fillStyle = BG
      g.fillRect(0, 0, w, h)
      const row = ROW * dpr
      const left = LABEL * dpr
      const span = w - left
      const bw = Math.max(span / PEAK_BINS, 1)
      g.font = `${10 * dpr}px ui-monospace, monospace`
      g.textBaseline = 'middle'
      for (let k = 0; k < TRACKS; k++) {
        const top = k * (ROW + GAP) * dpr
        const mid = top + row / 2
        const threaded = m.fourLaps[k]! > 0
        g.fillStyle = threaded ? '#8a8a92' : '#45454c'
        g.fillText(String(k + 1), 4 * dpr, mid)
        if (!threaded) {
          g.fillStyle = '#45454c'
          g.fillText('no tape', left + 4 * dpr, mid)
          continue
        }
        const base = k * PEAK_BINS
        g.beginPath()
        for (let i = 0; i < PEAK_BINS; i++) {
          const v = Math.min(m.fourPeaks[base + i] ?? 0, 1)
          const bar = Math.max(v * (row / 2 - dpr), 0.5 * dpr)
          g.rect(left + i * bw, mid - bar, bw, bar * 2)
        }
        g.fillStyle = heard(c, k) ? LIT : DIM
        g.fill()
        g.fillStyle = RUST
        for (let i = 0; i < PEAK_BINS; i++) {
          const d = m.fourShed[base + i] ?? 0
          if (d <= 0) continue
          g.globalAlpha = Math.min(0.25 + d, 1)
          g.fillRect(left + i * bw, top + row - 3 * dpr, bw, 3 * dpr)
        }
        g.globalAlpha = 1
        g.fillStyle = HEAD
        g.fillRect(left + m.fourHeads[k]! * span - dpr, top, 2 * dpr, row)
      }
      const says = Array.from(m.fourLaps, (s, k) =>
        s > 0 ? `${k + 1} · ${s.toFixed(2)} s` : `${k + 1} · —`,
      ).join('   ')
      if (laps.current && says !== said) {
        said = says
        laps.current.textContent = says
      }
    }
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(draw)
    }
    const offMeter = engine.meter.subscribe(schedule)
    const offControls = engine.controls.subscribe(schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    schedule()
    return () => {
      offMeter()
      offControls()
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className={styles.wrap}>
      <Tip text="The four loops: what is on each, where its head stands, and in rust where the oxide has come away. A loop is lit while you can hear it, through its cue or its channel. A loop with no tape threads the first time its Record comes up.">
        <canvas
          ref={canvas}
          className={styles.reels}
          style={{ height: TRACKS * (ROW + GAP) - GAP }}
        />
      </Tip>
      <div className={styles.foot}>
        <span ref={laps} className={styles.laps} />
        <Tip text="Wipe all four loops and their wear, as a fresh cassette would be: the loops stay cut to the lengths they were.">
          <button
            className={styles.blank}
            onClick={() => engine.blankFourTrack()}
          >
            blank cassette
          </button>
        </Tip>
      </div>
    </div>
  )
}
