import { useEffect, useRef } from 'react'

import { N_BANDS } from '../dsp/util/bandMeter.ts'
import { engine, SOUND_FLOOR } from '../engine/engine.ts'
import { CHANNELS } from './controls/index.ts'
import { useStoreValue } from './ControlsContext.ts'
import { FALL, HOT, position, SILENT } from './meterScale.ts'
import styles from './SourceMeters.module.css'
import { showSourceMeters, sourceMetersShown } from './sourceMeters.ts'
import { Tip } from './Tip.tsx'

export function SourceMetersSwitch() {
  const on = useStoreValue(sourceMetersShown)
  return (
    <Tip
      text={
        on
          ? 'Hide the meters under this row.'
          : 'Show every source’s level and its ten octave bands under this row, to see which one is doing what.'
      }
    >
      <button
        className={on ? styles.switchOn : styles.switch}
        aria-pressed={on}
        onClick={() => showSourceMeters(!on)}
      >
        meters
      </button>
    </Tip>
  )
}

export function SourceMeters() {
  return useStoreValue(sourceMetersShown) ? <Tiles /> : null
}

function Tiles() {
  const tiles = useRef<(HTMLElement | null)[]>([])
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    engine.watchBands(true)
    const stop = watchMeter(tiles.current, canvases.current)
    return () => {
      stop()
      engine.watchBands(false)
    }
  }, [])

  return (
    <div className={styles.tiles} aria-label="source meters">
      {CHANNELS.map(({ key, name }, i) => (
        <figure
          key={key}
          className={styles.tile}
          data-quiet
          ref={el => {
            tiles.current[i] = el
          }}
        >
          <canvas
            className={styles.canvas}
            ref={el => {
              canvases.current[i] = el
            }}
          />
          <figcaption className={styles.name}>{name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function watchMeter(
  tiles: readonly (HTMLElement | null)[],
  canvases: readonly (HTMLCanvasElement | null)[],
) {
  const level = new Float32Array(CHANNELS.length)
  const bands = new Float32Array(CHANNELS.length * N_BANDS)
  const quiet = CHANNELS.map(() => true)
  const drawn = CHANNELS.map(() => false)
  const css = canvases[0] ? getComputedStyle(canvases[0]) : null
  const colour = (name: string, fallback: string) =>
    (css ? css.getPropertyValue(name).trim() : '') || fallback
  const accent = colour('--accent', 'orangered')
  const alarm = colour('--alarm', 'red')
  let raf = 0

  const draw = () => {
    raf = 0
    const m = engine.meter.get()
    const dpr = window.devicePixelRatio || 1
    let moving = false
    for (const [i, { tap }] of CHANNELS.entries()) {
      const fell = level[i]! * FALL
      level[i] = Math.max(m.taps[tap] ?? 0, fell < SILENT ? 0 : fell)
      let live = level[i] > 0
      for (let b = 0; b < N_BANDS; b++) {
        const j = i * N_BANDS + b
        const was = bands[j]! * FALL
        bands[j] = Math.max(
          m.bands[tap * N_BANDS + b] ?? 0,
          was < SILENT ? 0 : was,
        )
        if (bands[j] > 0) live = true
      }
      if (live) moving = true

      const hush = level[i] < SOUND_FLOOR
      const tile = tiles[i]
      if (tile && quiet[i] !== hush) {
        quiet[i] = hush
        tile.toggleAttribute('data-quiet', hush)
      }

      const canvas = canvases[i]
      const g = canvas?.getContext('2d')
      if (canvas && g && (live || drawn[i])) {
        drawn[i] = live
        const w = Math.max(Math.round(canvas.clientWidth * dpr), 1)
        const h = Math.max(Math.round(canvas.clientHeight * dpr), 1)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        g.clearRect(0, 0, w, h)
        const meterW = Math.max(Math.round(3 * dpr), 2)
        const gap = Math.max(Math.round(dpr), 1)
        const barW = (w - meterW - 2 * gap) / N_BANDS
        g.fillStyle = accent
        for (let b = 0; b < N_BANDS; b++) {
          const bh = Math.round(position(bands[i * N_BANDS + b]!) * h)
          g.fillRect(Math.round(b * barW), h - bh, Math.ceil(barW) - gap, bh)
        }
        const pos = position(level[i])
        g.fillStyle = pos > HOT ? alarm : accent
        const lh = Math.round(pos * h)
        g.fillRect(w - meterW, h - lh, meterW, lh)
      }
    }
    if (moving) schedule()
  }

  const schedule = () => {
    if (raf === 0) raf = requestAnimationFrame(draw)
  }
  const off = engine.meter.subscribe(() => {
    const { taps, bands: posted } = engine.meter.get()
    if (taps.some(v => v > 0) || posted.some(v => v > 0)) schedule()
  })
  const observer = new ResizeObserver(() => {
    drawn.fill(true)
    schedule()
  })
  for (const canvas of canvases) if (canvas) observer.observe(canvas)
  schedule()
  return () => {
    off()
    observer.disconnect()
    cancelAnimationFrame(raf)
  }
}
