import { useEffect, useRef } from 'react'

import { engine } from '../engine/engine'
import styles from './Scope.module.css'

// Oscilloscope + peak meter fed by the worklet's meter posts.
//
// A frame is requested per meter post rather than looped. A post with a peak of
// zero carries an all-zero trace, since the trace is the tail of the samples
// the peak was taken over, so once a flat line is on the canvas a silent board
// requests no frames and hands the compositor nothing to redraw.
export function Scope() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const g = canvas.getContext('2d')
    if (!g) return undefined
    let raf = 0
    let flat = false
    let resized = true
    const draw = () => {
      raf = 0
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(Math.round(canvas.clientWidth * dpr), 1)
      const h = Math.max(Math.round(canvas.clientHeight * dpr), 1)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        resized = true
      }
      const { peak, scope } = engine.meter.get()
      if (peak === 0 && flat && !resized) return
      flat = peak === 0
      resized = false
      g.fillStyle = '#0a0a0c'
      g.fillRect(0, 0, w, h)
      g.strokeStyle = '#222226'
      g.beginPath()
      g.moveTo(0, h / 2)
      g.lineTo(w, h / 2)
      g.stroke()
      g.strokeStyle = peak > 0.85 ? '#ff3355' : '#ff5d3b'
      g.lineWidth = 1.5 * dpr
      g.beginPath()
      for (let i = 0; i < scope.length; i++) {
        const x = (i / scope.length) * w
        const y = h / 2 - scope[i]! * (h / 2 - 4 * dpr)
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      g.fillStyle = peak > 0.85 ? '#ff3355' : '#3a3a40'
      g.fillRect(0, h - 4 * dpr, Math.min(peak, 1) * w, 4 * dpr)
    }
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(draw)
    }
    const off = engine.meter.subscribe(() => {
      if (!flat || engine.meter.get().peak !== 0) schedule()
    })
    const observer = new ResizeObserver(() => {
      resized = true
      schedule()
    })
    observer.observe(canvas)
    schedule()
    return () => {
      off()
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      width={800}
      height={260}
    />
  )
}
