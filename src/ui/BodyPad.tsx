import { useState, type PointerEvent } from 'react'
import { engine } from '../engine/engine'
import { useBoardValue, useControlValue } from './ControlsContext'
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
  // Three figures rather than the board. The pad sits beside the keys through
  // every morph, and taking the whole board would redraw it — and the tip on
  // every wire under it — sixty times a second to print the same two contacts.
  // The wires are a string for the same reason: a fresh array each call is a
  // new value every frame, whatever it says.
  const x = useControlValue('bodyX')
  const y = useControlValue('bodyY')
  const soldered = useBoardValue(c =>
    ([0, 1, 2, 3] as const)
      .flatMap(i => {
        const src = Math.round(c[`mod${i}Src`])
        if (src !== 5 && src !== 6) return []
        return [
          `body ${src === 5 ? 'X' : 'Y'} → ${DEST_LABELS[Math.round(c[`mod${i}Dest`])]}`,
        ]
      })
      .join('\n'),
  )
  const wires = soldered ? soldered.split('\n') : []
  const [held, setHeld] = useState(false)

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
            <span className={styles.vline} style={{ left: `${x * 100}%` }} />
            <span
              className={styles.hline}
              style={{ top: `${(1 - y) * 100}%` }}
            />
            <span
              className={styles.dot}
              style={{
                left: `${x * 100}%`,
                top: `${(1 - y) * 100}%`,
              }}
            />
          </>
        )}
        <span className={styles.legend}>body contact</span>
      </div>
      <div className={styles.readout}>
        <span className={held ? styles.ohmsOn : styles.ohms}>
          {held ? resistance(x, y) : '∞ Ω'}
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
