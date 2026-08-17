import { useSyncExternalStore } from 'react'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import {
  DRUM_ROMS,
  GRID_ROWS,
  STEPS,
  hasStep,
  romMatching,
  toggleStep,
  type DrumRom,
  type DrumStepKey,
} from './drums'
import styles from './DrumGrid.module.css'

// The playhead only moves when the step does, so the grid redraws sixteen times
// a bar rather than at the meter's rate.
function usePlayStep(): number {
  return useSyncExternalStore(
    engine.meter.subscribe,
    () => engine.meter.get().step,
  )
}

// The pattern, as the plugboard it is: a row per voice, a column per step, and
// the accent row underneath deciding how hard each column lands. The ROM
// buttons write into the same masks, so a factory pattern is a starting point
// you can edit rather than a mode you are stuck in.
export function DrumGrid() {
  const controls = useStoreValue(engine.controls)
  const playing = useStoreValue(engine.drumsPlaying)
  const playStep = usePlayStep()
  const live = playing && controls.drumLevel > 0
  const masks = Object.fromEntries(
    GRID_ROWS.map(r => [r.key, controls[r.key]]),
  ) as Record<DrumStepKey, number>
  const loaded = romMatching(masks)

  const load = (r: DrumRom) => engine.patch(r.masks)

  return (
    <div className={styles.wrap}>
      <div className={styles.roms}>
        {DRUM_ROMS.map(r => (
          <button
            key={r.name}
            className={loaded === r ? styles.romOn : styles.rom}
            title={r.blurb}
            onClick={() => load(r)}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {GRID_ROWS.map(row => (
          <div key={row.key} className={styles.row} title={row.help}>
            <span className={controls[row.key] ? styles.nameOn : styles.name}>
              {row.label}
            </span>
            <div className={styles.cells}>
              {Array.from({ length: STEPS }, (_, s) => {
                const on = hasStep(controls[row.key], s)
                const beat = s % 4 === 0
                const under = live && s === playStep
                return (
                  <button
                    key={s}
                    className={cellClass(
                      row.key === 'drumAccent',
                      on,
                      beat,
                      under,
                    )}
                    aria-label={`${row.label} step ${s + 1}`}
                    aria-pressed={on}
                    onClick={() =>
                      engine.set(row.key, toggleStep(controls[row.key], s))
                    }
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* The one place that may start the kit, because it is a button that says
          it will. Nothing else on the board presses play for you. */}
      {live || (
        <button
          className={styles.silent}
          onClick={() => {
            if (controls.drumLevel === 0) engine.patch({ drumLevel: 0.8 })
            engine.setDrumsPlaying(true)
          }}
        >
          {controls.drumLevel === 0
            ? 'the kit is turned down — bring Level up and run it'
            : 'the kit is stopped — run it'}
        </button>
      )}
    </div>
  )
}

function cellClass(
  accent: boolean,
  on: boolean,
  beat: boolean,
  under: boolean,
): string {
  const base = accent
    ? on
      ? styles.accentOn
      : styles.accent
    : on
      ? styles.cellOn
      : styles.cell
  return [base, beat && styles.beat, under && styles.under]
    .filter(Boolean)
    .join(' ')
}
