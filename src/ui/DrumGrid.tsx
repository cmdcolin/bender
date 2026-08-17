import { useSyncExternalStore } from 'react'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import {
  asLen,
  DRUM_ROMS,
  GRID_ROWS,
  STEPS,
  hasStep,
  romMatching,
  toggleStep,
  type DrumRom,
  type DrumRow,
  type DrumStepKey,
} from '../drums'
import styles from './DrumGrid.module.css'

// The playhead only moves when a step does, so the grid redraws at the step rate
// rather than at the meter's.
function usePlayTick(): number {
  return useSyncExternalStore(
    engine.meter.subscribe,
    () => engine.meter.get().tick,
  )
}

// The pattern, as the plugboard it is: a row per voice, a column per step, and
// the accent row underneath deciding how hard each column lands. The ROM
// buttons write into the same masks, so a factory pattern is a starting point
// you can edit rather than a mode you are stuck in.
//
// Each row carries its own length, so the rows need not come round together.
// Shift-click a step to end a row there; the badge on the right says where it
// ends, and puts the row back to sixteen.
export function DrumGrid() {
  const controls = useStoreValue(engine.controls)
  const playing = useStoreValue(engine.drumsPlaying)
  const tick = usePlayTick()
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
          <Row key={row.key} row={row} tick={live ? tick : null} />
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

function Row({ row, tick }: { row: DrumRow; tick: number | null }) {
  const controls = useStoreValue(engine.controls)
  const mask = controls[row.key]
  const len = asLen(controls[row.len])
  const accent = row.key === 'drumAccent'
  // Each row's own playhead: the counter is steps clocked, so a short row is
  // round again while the long ones are still in the bar.
  const under = tick === null ? -1 : tick % len

  return (
    <div className={styles.row} title={row.help}>
      <span className={mask ? styles.nameOn : styles.name}>{row.label}</span>
      <div className={styles.cells}>
        {Array.from({ length: STEPS }, (_, s) => (
          <button
            key={s}
            className={cellClass({
              accent,
              on: hasStep(mask, s),
              beat: s % 4 === 0,
              under: s === under,
              past: s >= len,
            })}
            aria-label={`${row.label} step ${s + 1}`}
            aria-pressed={hasStep(mask, s)}
            title={`shift-click to bring the ${row.label} row round after step ${s + 1}`}
            onClick={e =>
              e.shiftKey
                ? engine.set(row.len, s + 1)
                : engine.set(row.key, toggleStep(mask, s))
            }
          />
        ))}
      </div>
      {/* A select rather than a nudge or a shift-click alone: it says what the
          numbers are, it is one tap on a phone, and it is the only way to give a
          row its sixteen steps back once you have shortened it. */}
      <select
        className={len === STEPS ? styles.len : styles.lenShort}
        value={len}
        onChange={e => engine.set(row.len, Number(e.currentTarget.value))}
        aria-label={`${row.label} row length`}
        title={
          len === STEPS
            ? `how many steps the ${row.label} row plays before it comes round. All sixteen is the machine as it left the factory; anything else runs against the rows that kept theirs`
            : `the ${row.label} row comes round every ${len} steps, so it lands somewhere different against the others each bar`
        }
      >
        {Array.from({ length: STEPS }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
    </div>
  )
}

function cellClass(s: {
  accent: boolean
  on: boolean
  beat: boolean
  under: boolean
  past: boolean
}): string {
  const base = s.accent
    ? s.on
      ? styles.accentOn
      : styles.accent
    : s.on
      ? styles.cellOn
      : styles.cell
  return [
    base,
    s.beat && styles.beat,
    s.under && styles.under,
    s.past && styles.past,
  ]
    .filter(Boolean)
    .join(' ')
}
