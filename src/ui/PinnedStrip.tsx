import { OWNER_BY_KEY, sliderFor } from './controls/index.ts'
import { useStoreValue } from './ControlsContext.ts'
import styles from './PinnedStrip.module.css'
import { pins } from './pins.ts'
import { ControlSlider, ReserveReadout } from './Slider.tsx'

/** The knobs you pinned from any stage, on one strip beside the instruments. */
export function PinnedStrip() {
  const keys = useStoreValue(pins)
  if (keys.length === 0) return null
  const defs = keys.map(sliderFor)
  return (
    <section className={styles.strip} aria-label="pinned controls">
      <span className={styles.title}>pinned</span>
      <ReserveReadout defs={defs}>
        <div className={styles.rows}>
          {defs.map(def => (
            <ControlSlider
              key={def.key}
              def={def}
              label={`${OWNER_BY_KEY.get(def.key) ?? ''} · ${def.label}`}
            />
          ))}
        </div>
      </ReserveReadout>
    </section>
  )
}
