import { engine } from '../engine/engine.ts'
import { sliderFor } from './controls/index.ts'
import { useBoardValue, useControlValue } from './ControlsContext.ts'
import { DeviceVerbs } from './DeviceVerbs.tsx'
import { rowShown } from './diagram.ts'
import { useOpenFace } from './openStage.ts'
import styles from './Pedals.module.css'
import { ControlSlider } from './Slider.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey } from '../controls.ts'
import type { CSSProperties, ReactNode } from 'react'

// What a stompbox face wears on the bench: its enclosure colour, an optional
// selector switch, the sliders you reach for first with the mix last. The rest
// are one press away on the stage's own panel.
export interface Face {
  colour: string
  switch?: ControlKey
  sliders: readonly ControlKey[]
}

const cssVars = (vars: Record<`--${string}`, string>): CSSProperties => vars

function Selector({ control }: { control: ControlKey }) {
  const def = sliderFor(control)
  const value = useControlValue(control)
  return (
    <Tip text={def.help}>
      <select
        className={styles.selector}
        aria-label={def.label}
        value={Math.round(value) - def.min}
        onChange={e => {
          engine.armStep()
          engine.set(control, def.min + Number(e.currentTarget.value))
        }}
      >
        {def.choices!.map((c, i) => (
          <option key={c} value={i}>
            {c}
          </option>
        ))}
      </select>
    </Tip>
  )
}

/** The footswitch. The lamp is lit while the stage is in the path. */
export function Footswitch({
  stage,
  bypassed,
  tip,
  onPress,
}: {
  stage: string
  bypassed: boolean
  tip: string
  onPress: () => void
}) {
  return (
    <Tip text={tip}>
      <span className={styles.bay}>
        <span
          className={bypassed ? styles.lampOff : styles.lampOn}
          aria-hidden="true"
        />
        <button
          className={styles.foot}
          aria-label={`bypass ${stage}`}
          aria-pressed={bypassed}
          onClick={onPress}
        />
      </span>
    </Tip>
  )
}

export function StompFace({
  stage,
  face,
  seconds,
  footswitch,
  badge,
  onOpen,
  onClose,
}: {
  stage: string
  face: Face
  seconds: number
  footswitch: ReactNode
  badge?: ReactNode
  onOpen: (stage: string) => void
  onClose: () => void
}) {
  const live = useBoardValue(c =>
    face.sliders.filter(key => rowShown(key, c)).join(','),
  ).split(',')
  const ring = useOpenFace(stage)
  return (
    <div
      className={`${styles.pedal} ${ring}`}
      style={cssVars({ '--pedal': face.colour })}
      role="group"
      aria-label={stage.toLowerCase()}
    >
      <div className={styles.head}>
        <span className={styles.name}>{stage}</span>
        {badge}
        <DeviceVerbs stage={stage} seconds={seconds} onClose={onClose} noMute />
      </div>
      <div className={styles.body}>
        <div className={styles.stand}>
          {footswitch}
          <Tip text={`Open ${stage} with all of its controls.`}>
            <button
              className={styles.more}
              aria-label="all controls"
              onClick={() => onOpen(stage)}
            >
              ⋯
            </button>
          </Tip>
        </div>
        <div className={styles.sliders}>
          {face.switch && <Selector control={face.switch} />}
          {face.sliders
            .filter(key => live.includes(key))
            .map(key => (
              <ControlSlider key={key} def={sliderFor(key)} />
            ))}
        </div>
      </div>
    </div>
  )
}
