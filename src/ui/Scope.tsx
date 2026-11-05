import { useEffect, useRef } from 'react'

import { SCOPE_LEN } from '../dsp/scopeTrace.ts'
import { engine } from '../engine/engine.ts'
import styles from './Scope.module.css'

const GHOSTS = 6
const TRACES = GHOSTS + 1

// Oscilloscope + peak meter fed by the worklet's meter posts, with the last few
// traces left fading behind the newest. A frame is requested per meter post
// rather than looped, and once enough silent posts have pushed every ghost off
// a flat line, a silent board requests no frames at all.
export function Scope(props: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d')
    return canvas && g ? watchMeter(canvas, g) : undefined
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={props.className ?? styles.canvas}
      width={800}
      height={260}
    />
  )
}

function watchMeter(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D) {
  const traces = new Float32Array(TRACES * SCOPE_LEN)
  let newest = 0
  let quiet = TRACES
  let raf = 0
  const draw = () => {
    raf = 0
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(Math.round(canvas.clientWidth * dpr), 1)
    const h = Math.max(Math.round(canvas.clientHeight * dpr), 1)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const { peak } = engine.meter.get()
    const hot = peak > 0.85
    g.fillStyle = '#0a0a0c'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#222226'
    g.beginPath()
    g.moveTo(0, h / 2)
    g.lineTo(w, h / 2)
    g.stroke()
    g.strokeStyle = hot ? '#ff3355' : '#ff5d3b'
    g.lineWidth = 1.5 * dpr
    const scale = h / 2 - 4 * dpr
    for (let age = GHOSTS; age >= 0; age--) {
      const row = ((newest - age + TRACES) % TRACES) * SCOPE_LEN
      const fade = 1 - age / TRACES
      g.globalAlpha = age === 0 ? 1 : 0.45 * fade * fade
      g.beginPath()
      for (let i = 0; i < SCOPE_LEN; i++) {
        const x = (i / SCOPE_LEN) * w
        const y = h / 2 - traces[row + i]! * scale
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    g.globalAlpha = 1
    g.fillStyle = hot ? '#ff3355' : '#3a3a40'
    g.fillRect(0, h - 4 * dpr, Math.min(peak, 1) * w, 4 * dpr)
  }
  const schedule = () => {
    if (raf === 0) raf = requestAnimationFrame(draw)
  }
  const off = engine.meter.subscribe(() => {
    const { peak, scope } = engine.meter.get()
    quiet = peak === 0 ? quiet + 1 : 0
    if (quiet <= TRACES) {
      newest = (newest + 1) % TRACES
      const row = newest * SCOPE_LEN
      if (peak === 0) traces.fill(0, row, row + SCOPE_LEN)
      else traces.set(scope, row)
      schedule()
    }
  })
  const observer = new ResizeObserver(schedule)
  observer.observe(canvas)
  schedule()
  return () => {
    off()
    observer.disconnect()
    cancelAnimationFrame(raf)
  }
}
