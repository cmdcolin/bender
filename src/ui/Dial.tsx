import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { snapToStep, type SliderDef } from './controls/index.ts'
import { useControlValue } from './ControlsContext.ts'
import styles from './Dial.module.css'
import { formatValue, fromPos, toPos } from './slider-scale.ts'
import { Tip } from './Tip.tsx'

const SWEEP = 270
const CENTRE = 20
const BODY = 12
const TICKS = 11
const KNOB_TRAVEL_PX = 160
const FADER_TRAVEL_PX = 80
const DETENT = 0.02

const point = (pos: number, r: number) => {
  const a = ((-SWEEP / 2 + SWEEP * pos) * Math.PI) / 180
  return [CENTRE + r * Math.sin(a), CENTRE - r * Math.cos(a)] as const
}

const tick = (i: number) => i / (TICKS - 1)

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
  const shade = useId().replaceAll(':', '')
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
      <span className={styles.scale} />
      <span className={styles.slot}>
        <span
          className={touched ? styles.fillOn : styles.fill}
          style={{ height: `${pos * 100}%` }}
        />
      </span>
      <span
        className={touched ? styles.capOn : styles.handle}
        style={{ bottom: `${pos * 100}%` }}
      />
    </div>
  ) : (
    <svg className={styles.knob} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id={shade} cx="35%" cy="30%" r="80%">
          <stop offset="0" className={styles.shineHi} />
          <stop offset="1" className={styles.shineLo} />
        </radialGradient>
      </defs>
      {Array.from({ length: TICKS }, (_, i) => {
        const t = tick(i)
        const [x0, y0] = point(t, 16)
        const [x1, y1] = point(t, 19)
        const lit =
          touched &&
          t >= Math.min(turn, pos) - 1e-6 &&
          t <= Math.max(turn, pos) + 1e-6
        return (
          <line
            key={i}
            className={lit ? styles.tickOn : styles.tick}
            x1={x0}
            y1={y0}
            x2={x1}
            y2={y1}
          />
        )
      })}
      <circle className={styles.skirt} cx={CENTRE} cy={CENTRE} r={BODY + 1.5} />
      <circle
        className={styles.cap}
        cx={CENTRE}
        cy={CENTRE}
        r={BODY}
        fill={`url(#${shade})`}
      />
      <line
        className={touched ? styles.pointerOn : styles.pointer}
        x1={point(pos, 3)[0]}
        y1={point(pos, 3)[1]}
        x2={point(pos, BODY - 1)[0]}
        y2={point(pos, BODY - 1)[1]}
      />
    </svg>
  )

  return (
    <Tip text={def.help}>
      <div
        className={fader ? styles.fader : styles.dial}
        data-control={def.key}
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
