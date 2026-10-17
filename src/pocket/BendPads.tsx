import { engine } from '../engine/engine.ts'
import { HEATS } from '../ui/bendDeal.ts'
import {
  bendDeal,
  bendHeat,
  bendName,
  bendSwell,
  holdBend,
  letGoAllBends,
  letGoBend,
  redealAll,
  setBendHeat,
  setBendSwell,
} from '../ui/bendKeys.ts'
import { useStoreValue } from '../ui/ControlsContext.ts'
import { THROWS } from '../ui/throws.ts'
import { buzz } from './haptics.ts'
import styles from './pocket.module.css'

// The sixteen dealt bends as switches: a tap pins one on and a second tap lets
// it go. The six throws under them spring back as soon as the finger lifts.
export function BendPads() {
  const deal = useStoreValue(bendDeal)
  const held = useStoreValue(engine.held)
  const heat = useStoreValue(bendHeat)
  const swell = useStoreValue(bendSwell)
  const seconds = swell ? 1 : 0
  const anyOn = deal.some(k => held.has(bendName(k.letter)))

  return (
    <div className={styles.bends}>
      <div className={styles.bendGrid}>
        {deal.map(k => {
          const name = bendName(k.letter)
          const on = held.has(name)
          return (
            <button
              key={k.letter}
              className={on ? styles.padOn : styles.pad}
              aria-pressed={on}
              title={k.says}
              aria-label={`${k.letter}: ${k.stages.join(', ')}`}
              onClick={() => {
                buzz()
                if (on) letGoBend(name, seconds)
                else holdBend(name, k, seconds)
              }}
            >
              {k.stages.slice(0, 3).map(line => (
                <span key={line} className={styles.move}>
                  {line}
                </span>
              ))}
            </button>
          )
        })}
      </div>
      <div className={styles.throwRow}>
        {THROWS.map(t => (
          <button
            key={t.name}
            className={held.has(t.name) ? styles.throwOn : styles.throw}
            title={`${t.blurb}, while held`}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              engine.holdThrow(t.name, t.push(engine.controls.get()))
            }}
            onPointerUp={() => engine.letGoThrow(t.name)}
            onPointerCancel={() => engine.letGoThrow(t.name)}
            onLostPointerCapture={() => engine.letGoThrow(t.name)}
            onContextMenu={e => e.preventDefault()}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className={styles.dealRow}>
        <button className={styles.chip} onClick={redealAll}>
          ⚄ redeal
        </button>
        <button
          className={styles.chip}
          disabled={!anyOn}
          onClick={letGoAllBends}
        >
          all off
        </button>
        <span className={styles.dealGap} />
        {HEATS.map(h => (
          <button
            key={h}
            className={heat === h ? styles.chipOn : styles.chip}
            aria-pressed={heat === h}
            title="how hard the next deal comes out"
            onClick={() => setBendHeat(h)}
          >
            {h}
          </button>
        ))}
        <button
          className={swell ? styles.chipOn : styles.chip}
          aria-pressed={swell}
          title="bends swell in and fall back over a second"
          onClick={() => setBendSwell(!swell)}
        >
          swell
        </button>
      </div>
    </div>
  )
}
