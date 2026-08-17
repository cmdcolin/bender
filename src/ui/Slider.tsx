import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { useControlValue } from './ControlsContext'
import type { SliderDef } from './controls'
import { snapToStep } from './controls'
import { formatValue, fromPos, toPos } from './slider-scale'
import styles from './Slider.module.css'

export function ControlSlider({ def }: { def: SliderDef }) {
  const value = useControlValue(def.key)
  const touched = value !== DEFAULT_CONTROLS[def.key]

  if (def.choices) {
    return (
      <div className={styles.row} title={def.help}>
        <span className={touched ? styles.labelTouched : styles.label}>{def.label}</span>
        <span className={styles.choices}>
          {def.choices.map((c, i) => {
            const v = def.min + i
            return (
              <button
                key={c}
                className={Math.round(value) === v ? styles.choiceOn : styles.choice}
                onClick={() => engine.set(def.key, v)}
              >
                {c}
              </button>
            )
          })}
        </span>
      </div>
    )
  }

  return (
    <div className={styles.row} title={def.help}>
      <span
        className={touched ? styles.labelTouched : styles.label}
        onDoubleClick={() => engine.set(def.key, DEFAULT_CONTROLS[def.key])}
      >
        {def.label}
      </span>
      <input
        className={styles.track}
        type="range"
        min={0}
        max={1000}
        value={Math.round(toPos(def, value) * 1000)}
        onChange={e => {
          const pos = Number(e.currentTarget.value) / 1000
          engine.set(def.key, snapToStep(def, fromPos(def, pos)))
        }}
        onDoubleClick={() => engine.set(def.key, DEFAULT_CONTROLS[def.key])}
      />
      <span className={styles.readout}>{formatValue(def, value)}</span>
    </div>
  )
}
