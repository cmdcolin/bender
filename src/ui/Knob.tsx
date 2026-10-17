import { useRef } from 'react'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { snapToStep } from './controls/index.ts'
import { useControlValue } from './ControlsContext.ts'
import styles from './Knob.module.css'
import { formatValue, fromPos, toPos } from './slider-scale.ts'
import { Tip } from './Tip.tsx'

import type { SliderDef } from './controls/index.ts'

const SWEEP = 270
const CENTRE = 24
const TRACK_R = 20
const PIXELS_PER_TRAVEL = 160
const KEY_STEP = 0.02

const point = (angle: number, r: number) => {
  const rad = (angle * Math.PI) / 180
  return [CENTRE + r * Math.sin(rad), CENTRE - r * Math.cos(rad)] as const
}

const arc = (from: number, to: number) => {
  const [x0, y0] = point(from, TRACK_R)
  const [x1, y1] = point(to, TRACK_R)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${TRACK_R} ${TRACK_R} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

// A rotary control for a continuous slider definition, drawn as the pot on a
// pedal: drag up to turn it up, arrow keys step it, a double press puts it back
// to stock. It reads and writes the same control the slider row does.
export function Knob({ def }: { def: SliderDef }) {
  const value = useControlValue(def.key)
  const drag = useRef<{ y: number; pos: number } | null>(null)
  const pos = toPos(def, value)
  const angle = -SWEEP / 2 + pos * SWEEP
  const write = (to: number) =>
    engine.set(
      def.key,
      snapToStep(def, fromPos(def, Math.min(1, Math.max(0, to)))),
    )
  const [tipX, tipY] = point(angle, 12)
  const [baseX, baseY] = point(angle, 5)
  return (
    <div className={styles.knob}>
      <div
        className={styles.dial}
        role="slider"
        tabIndex={0}
        aria-label={def.label}
        aria-valuemin={0}
        aria-valuemax={1000}
        aria-valuenow={Math.round(pos * 1000)}
        aria-valuetext={formatValue(def, value)}
        onPointerDown={e => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, pos }
          engine.armStep()
        }}
        onPointerMove={e => {
          const from = drag.current
          if (from) write(from.pos + (from.y - e.clientY) / PIXELS_PER_TRAVEL)
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={e => {
          const by =
            e.key === 'ArrowUp' || e.key === 'ArrowRight'
              ? KEY_STEP
              : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
                ? -KEY_STEP
                : e.key === 'PageUp'
                  ? 5 * KEY_STEP
                  : e.key === 'PageDown'
                    ? -5 * KEY_STEP
                    : 0
          const to =
            e.key === 'Home' ? 0 : e.key === 'End' ? 1 : by ? pos + by : null
          if (to === null) return
          e.preventDefault()
          if (!e.repeat) engine.armStep()
          write(to)
        }}
        onDoubleClick={() => {
          engine.armStep()
          engine.set(def.key, DEFAULT_CONTROLS[def.key])
        }}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path className={styles.track} d={arc(-SWEEP / 2, SWEEP / 2)} />
          {pos > 0 && (
            <path className={styles.lit} d={arc(-SWEEP / 2, angle)} />
          )}
          <circle className={styles.cap} cx={CENTRE} cy={CENTRE} r={14} />
          <line
            className={styles.pointer}
            x1={baseX}
            y1={baseY}
            x2={tipX}
            y2={tipY}
          />
        </svg>
      </div>
      <Tip text={def.help}>
        <span className={styles.name}>{def.label}</span>
      </Tip>
      <span className={styles.reading}>{formatValue(def, value)}</span>
    </div>
  )
}
