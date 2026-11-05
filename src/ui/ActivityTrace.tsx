import { useEffect, useRef } from 'react'

import { DRUM_VOICES } from '../drums.ts'
import { activity, trace } from './activity.ts'
import styles from './ActivityPanel.module.css'
import { useStoreSelect } from './ControlsContext.ts'
import { LANE_COLORS, TRACE_MS, laneKeys } from './trace.ts'

const LANE_PX = 30
const KIT_PX = 26
const LABEL_PX = 9

export function ActivityTrace() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lanes = useStoreSelect(activity, a => laneKeys(a.lines).length)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d')
    return canvas && g ? drawLoop(canvas, g) : undefined
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={styles.trace}
      style={{ height: lanes * LANE_PX + KIT_PX }}
      role="img"
      aria-label="the controls the script moved over the last 12 seconds, over the kit's hits"
    />
  )
}

function drawLoop(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D) {
  const css = getComputedStyle(canvas)
  const color = (name: string) => css.getPropertyValue(name).trim() || '#888'
  const laneColors = LANE_COLORS.map(color)
  const hitColor = color('--hits')
  const saidColor = color('--accent2')
  const quiet = color('--fg4')
  const font = css.getPropertyValue('--mono').trim() || 'monospace'
  let raf = 0

  const draw = () => {
    raf = requestAnimationFrame(draw)
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(Math.round(canvas.clientWidth * dpr), 1)
    const h = Math.max(Math.round(canvas.clientHeight * dpr), 1)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const now = Date.now()
    const x = (at: number) => w * (1 - (now - at) / TRACE_MS)
    const lanes = trace.lanes()
    const laneH = LANE_PX * dpr
    const kitTop = lanes.length * laneH
    const kitH = h - kitTop

    g.clearRect(0, 0, w, h)

    g.fillStyle = '#ffffff0d'
    for (const bar of trace.bars()) g.fillRect(x(bar.at), 0, dpr, h)

    g.fillStyle = '#ffffff1f'
    for (const level of trace.levels()) {
      const lh = Math.min(level.peak, 1) * kitH
      g.fillRect(x(level.at), h - lh, 3 * dpr, lh)
    }

    const row = kitH / DRUM_VOICES.length
    g.fillStyle = hitColor
    for (const hit of trace.hits())
      for (const [v] of DRUM_VOICES.entries())
        if (hit.voices & (1 << v))
          g.fillRect(
            x(hit.at),
            kitTop + v * row,
            3 * dpr,
            Math.max(row - dpr, dpr),
          )

    g.lineWidth = 1.5 * dpr
    g.font = `${LABEL_PX * dpr}px ${font}`
    g.textBaseline = 'top'
    for (const [i, lane] of lanes.entries()) {
      const top = i * laneH
      const y = (pos: number) => top + laneH - 2 * dpr - pos * (laneH - 4 * dpr)
      const stroke = laneColors[i % laneColors.length]!
      g.fillStyle = '#ffffff08'
      g.fillRect(0, top + laneH - dpr, w, dpr)
      g.strokeStyle = stroke
      g.beginPath()
      for (const [j, p] of lane.points.entries()) {
        if (j === 0) g.moveTo(Math.max(x(p.at), 0), y(p.pos))
        else {
          g.lineTo(x(p.at), y(lane.points[j - 1]!.pos))
          g.lineTo(x(p.at), y(p.pos))
        }
      }
      const last = lane.points.at(-1)
      if (last) {
        g.lineTo(w, y(last.pos))
        g.stroke()
        g.lineTo(w, top + laneH)
        g.lineTo(Math.max(x(lane.points[0]!.at), 0), top + laneH)
        g.globalAlpha = 0.15
        g.fillStyle = stroke
        g.fill()
        g.globalAlpha = 1
        g.beginPath()
        g.arc(w - 3 * dpr, y(last.pos), 2.5 * dpr, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = quiet
      g.fillText(lane.label, 3 * dpr, top + 2 * dpr)
    }

    for (const line of activity.get().lines) {
      const at = x(line.at)
      if (at >= 0) {
        g.fillStyle = line.said ? saidColor : quiet
        g.fillRect(at, 0, dpr, line.said ? h : 4 * dpr)
      }
    }
  }

  raf = requestAnimationFrame(draw)
  return () => cancelAnimationFrame(raf)
}
