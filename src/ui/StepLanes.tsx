import { useSyncExternalStore } from 'react'

import { engine } from '../engine/engine.ts'
import {
  asLaneLen,
  LANE_KEYS,
  LANE_LEN_KEYS,
  LANE_MAX,
  LANE_STEPS,
} from '../lanes.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './StepLanes.module.css'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { PointerEvent } from 'react'

const NAMES = ['lane A', 'lane B']

function useUnder(live: boolean, len: number): number {
  return useSyncExternalStore(engine.meter.subscribe, () =>
    live ? engine.meter.get().tick % len : -1,
  )
}

// Two rows of sixteen bars under the bay. A wire picks one up as its source,
// and the kit's counter walks it a step at a time.
export function StepLanes() {
  return (
    <div className={styles.lanes}>
      {LANE_KEYS.map((keys, l) => (
        <Lane key={l} name={NAMES[l]!} keys={keys} lenKey={LANE_LEN_KEYS[l]!} />
      ))}
    </div>
  )
}

function Lane(props: {
  name: string
  keys: readonly ControlKey[]
  lenKey: ControlKey
}) {
  const { keys, lenKey } = props
  const values = useBoardValue(c => keys.map(k => c[k]).join(','))
    .split(',')
    .map(Number)
  const len = asLaneLen(useControlValue(lenKey))
  const live = useStoreValue(engine.drumsPlaying)
  const under = useUnder(live, len)

  const write = (step: number, value: number) => {
    const key = keys[step]!
    if (engine.controls.get()[key] !== value) engine.set(key, value)
  }
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const step = Math.floor(((e.clientX - box.left) / box.width) * LANE_STEPS)
    const y = 1 - (2 * (e.clientY - box.top)) / box.height
    write(
      Math.min(Math.max(step, 0), LANE_STEPS - 1),
      Math.min(Math.max(Math.round(y * LANE_MAX), -LANE_MAX), LANE_MAX),
    )
  }

  return (
    <div className={styles.lane}>
      <div className={styles.head}>
        <span className={styles.name}>{props.name}</span>
        <select
          className={styles.len}
          value={len}
          onChange={e => engine.set(lenKey, Number(e.currentTarget.value))}
          aria-label={`${props.name} length in steps`}
        >
          {Array.from({ length: LANE_STEPS }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1} {i === 0 ? 'step' : 'steps'}
            </option>
          ))}
        </select>
      </div>
      <Tip
        text={`Drag up or down on a step to set what ${props.name} sends while the kit stands on it; the middle is zero. Pick ${props.name} as a wire's source in the bay to land it anywhere the wire reaches.`}
      >
        <div
          className={styles.bars}
          onPointerDown={e => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            engine.armStep()
            at(e)
          }}
          onPointerMove={e => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e)
          }}
        >
          {values.map((v, s) => (
            <div
              key={s}
              role="slider"
              tabIndex={0}
              aria-label={`${props.name} step ${s + 1}`}
              aria-valuemin={-LANE_MAX}
              aria-valuemax={LANE_MAX}
              aria-valuenow={v}
              className={[
                styles.step,
                s % 4 === 0 && styles.beat,
                s === under && styles.under,
                s >= len && styles.past,
              ]
                .filter(Boolean)
                .join(' ')}
              onKeyDown={e => {
                const by =
                  e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0
                if (!by) return
                e.preventDefault()
                engine.armStep()
                write(s, Math.min(Math.max(v + by, -LANE_MAX), LANE_MAX))
              }}
            >
              <span
                className={v < 0 ? styles.down : styles.up}
                style={{ height: `${(50 * Math.abs(v)) / LANE_MAX}%` }}
              />
            </div>
          ))}
        </div>
      </Tip>
    </div>
  )
}
