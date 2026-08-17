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
      const { peak, scope } = engine.meter.get()
      const w = canvas.width
      const h = canvas.height
      g.fillStyle = '#0a0a0c'
      g.fillRect(0, 0, w, h)
      g.strokeStyle = '#222226'
      g.beginPath()
      g.moveTo(0, h / 2)
      g.lineTo(w, h / 2)
      g.stroke()
      g.strokeStyle = peak > 0.85 ? '#ff3355' : '#ff5d3b'
      g.lineWidth = 1.5
      g.beginPath()
      for (let i = 0; i < scope.length; i++) {
        const x = (i / scope.length) * w
        const y = h / 2 - scope[i]! * (h / 2 - 4)
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      g.fillStyle = peak > 0.85 ? '#ff3355' : '#3a3a40'
      g.fillRect(0, h - 4, Math.min(peak, 1) * w, 4)
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
