import { useEffect, useRef } from 'react'
import { engine } from '../engine/engine'
import styles from './Scope.module.css'

// Oscilloscope + peak meter fed by the worklet's meter posts.
export function Scope() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      // The panel is elastic and the trace was not: a fixed 800-wide backing
      // store stretched to whatever width it landed in, and stretched again by
      // the device pixel ratio, which is two hairlines' worth of blur on the one
      // thing here you are meant to read a shape off. Sized to the box it is
      // actually in, so a pixel of trace is a pixel of screen.
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(Math.round(canvas.clientWidth * dpr), 1)
      const h = Math.max(Math.round(canvas.clientHeight * dpr), 1)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const { peak, scope } = engine.meter.get()
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
    draw()
    return () => cancelAnimationFrame(raf)
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
