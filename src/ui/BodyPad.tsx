import { useState, type PointerEvent } from 'react'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { groupFor, sliderFor } from './controls'
import styles from './BodyPad.module.css'

const DEST_LABELS = sliderFor('mod0Dest').choices ?? []
const PATCH_BAY = groupFor('mod0Src')
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

// Skin resistance between two contacts, in kΩ: high and useless until you
// lean on it.
function resistance(x: number, y: number): string {
  const kohm = 1500 * Math.pow(10, -(0.6 * x + 1.6 * y))
  return kohm >= 1000
    ? `${(kohm / 1000).toFixed(2)} MΩ`
    : `${Math.round(kohm)} kΩ`
}

// The bare contacts every bent toy grows sooner or later: touch both and your
// body becomes the resistor. Wire an axis to something in the patch bay first,
// or the pad does nothing — which is also true of the real thing.
export function BodyPad({ onOpen }: { onOpen: (name: string) => void }) {
  const controls = useStoreValue(engine.controls)
  const [held, setHeld] = useState(false)

  const wires = ([0, 1, 2, 3] as const).flatMap(i => {
    const src = Math.round(controls[`mod${i}Src`])
    if (src !== 5 && src !== 6) return []
    return [
      `body ${src === 5 ? 'X' : 'Y'} → ${DEST_LABELS[Math.round(controls[`mod${i}Dest`])]}`,
    ]
  })

  const track = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    engine.patch({
      bodyX: clamp01((e.clientX - r.left) / r.width),
      bodyY: clamp01(1 - (e.clientY - r.top) / r.height),
    })
  }

  const lift = () => {
    setHeld(false)
    engine.patch({ bodyX: 0, bodyY: 0 })
  }

  return (
    <div className={styles.wrap}>
      <div
        className={held ? styles.padOn : styles.pad}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setHeld(true)
          track(e)
        }}
        onPointerMove={e => held && track(e)}
        onPointerUp={lift}
        onPointerCancel={lift}
      >
        <span className={styles.contact} style={{ left: '7%' }} />
        <span className={styles.contact} style={{ left: '93%' }} />
        {held && (
          <>
            <span
              className={styles.vline}
              style={{ left: `${controls.bodyX * 100}%` }}
            />
            <span
              className={styles.hline}
              style={{ top: `${(1 - controls.bodyY) * 100}%` }}
            />
            <span
              className={styles.dot}
              style={{
                left: `${controls.bodyX * 100}%`,
                top: `${(1 - controls.bodyY) * 100}%`,
              }}
            />
          </>
        )}
        <span className={styles.legend}>body contact</span>
      </div>
      <div className={styles.readout}>
        <span className={held ? styles.ohmsOn : styles.ohms}>
          {held ? resistance(controls.bodyX, controls.bodyY) : '∞ Ω'}
        </span>
        {wires.length > 0 ? (
          wires.map(w => (
            <span key={w} className={styles.wire}>
              {w}
            </span>
          ))
        ) : (
          <button className={styles.unwired} onClick={() => onOpen(PATCH_BAY)}>
            no wire soldered to it — patch one
          </button>
        )}
      </div>
    </div>
  )
}
