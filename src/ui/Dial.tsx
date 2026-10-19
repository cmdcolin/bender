import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { snapToStep, type SliderDef } from './controls/index.ts'
import { useControlValue } from './ControlsContext.ts'
import styles from './Dial.module.css'
import { formatValue, fromPos, toPos } from './slider-scale.ts'
import { Tip } from './Tip.tsx'

const SWEEP = 270
const RADIUS = 15
const CENTRE = 20
const KNOB_TRAVEL_PX = 160
const FADER_TRAVEL_PX = 96
const DETENT = 0.02

const point = (pos: number, r: number) => {
  const a = ((-SWEEP / 2 + SWEEP * pos) * Math.PI) / 180
  return [CENTRE + r * Math.sin(a), CENTRE - r * Math.cos(a)] as const
}

const arc = (from: number, to: number) => {
  const [x0, y0] = point(Math.min(from, to), RADIUS)
  const [x1, y1] = point(Math.max(from, to), RADIUS)
  const large = Math.abs(to - from) * SWEEP > 180 ? 1 : 0
  return `M${x0} ${y0}A${RADIUS} ${RADIUS} 0 ${large} 1 ${x1} ${y1}`
}

// A control on the desk: a round knob, or a vertical fader. Drag it up and down,
// step it with the arrow keys, double-click to put it back to stock. A knob with
// a turn, like an EQ band, clicks into it on the way past.
export function Dial({
  def,
  fader = false,
  short,
}: {
  def: SliderDef
  fader?: boolean
  short?: string
}) {
  const value = useControlValue(def.key)
  const [held, setHeld] = useState(false)
  const drag = useRef<{ y: number; pos: number } | null>(null)
  const groove = useRef<HTMLDivElement>(null)
  const stock = DEFAULT_CONTROLS[def.key]
  const touched = value !== stock
  const pos = toPos(def, value)
  const turn = def.split ? toPos(def, def.split.at) : 0
  const reading = formatValue(def, value)

  const put = (next: number) => engine.set(def.key, snapToStep(def, next))
  const reset = () => {
    engine.armStep()
    engine.set(def.key, stock)
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    engine.armStep()
    drag.current = { y: e.clientY, pos }
    setHeld(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const from = drag.current
    if (!from) return
    const travel = fader
      ? groove.current?.clientHeight || FADER_TRAVEL_PX
      : KNOB_TRAVEL_PX
    const next = Math.min(
      Math.max(from.pos + (from.y - e.clientY) / travel, 0),
      1,
    )
    put(
      def.split && Math.abs(next - turn) < DETENT
        ? def.split.at
        : fromPos(def, next),
    )
  }
  const up = () => {
    drag.current = null
    setHeld(false)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? def.step * 10 : def.step
    const to =
      e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? value + step
        : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
          ? value - step
          : e.key === 'PageUp'
            ? value + def.step * 10
            : e.key === 'PageDown'
              ? value - def.step * 10
              : e.key === 'Home'
                ? def.min
                : e.key === 'End'
                  ? def.max
                  : undefined
    if (to === undefined) return
    e.preventDefault()
    if (!e.repeat) engine.armStep()
    put(to)
  }

  const face = fader ? (
    <div ref={groove} className={styles.groove}>
      <span className={styles.slot}>
        <span
          className={touched ? styles.fillOn : styles.fill}
          style={{ height: `${pos * 100}%` }}
        />
      </span>
      <span className={styles.cap} style={{ bottom: `${pos * 100}%` }} />
    </div>
  ) : (
    <svg className={styles.knob} viewBox="0 0 40 40" aria-hidden="true">
      <path className={styles.ring} d={arc(0, 1)} />
      {pos === turn ? null : (
        <path
          className={touched ? styles.sweepOn : styles.sweep}
          d={arc(turn, pos)}
        />
      )}
      <line
        className={touched ? styles.pointerOn : styles.pointer}
        x1={point(pos, 4)[0]}
        y1={point(pos, 4)[1]}
        x2={point(pos, RADIUS)[0]}
        y2={point(pos, RADIUS)[1]}
      />
    </svg>
  )

  return (
    <Tip text={def.help}>
      <div
        className={fader ? styles.fader : styles.dial}
        data-held={held ? '' : undefined}
        role="slider"
        tabIndex={0}
        aria-label={def.label}
        aria-orientation={fader ? 'vertical' : undefined}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={value}
        aria-valuetext={reading}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        onDoubleClick={reset}
      >
        {face}
        <span className={touched ? styles.nameOn : styles.name}>
          {short ?? def.label}
        </span>
        <span className={styles.reading}>{reading}</span>
      </div>
    </Tip>
  )
}
