import { memo, useEffect, useState, useSyncExternalStore } from 'react'
import { engine } from '../engine/engine'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext'
import {
  asLen,
  DRUM_ROMS,
  DRUM_VOICES,
  GRID_ROWS,
  N_DRUM_VOICES,
  STEPS,
  hasStep,
  romMatching,
  toggleStep,
  voiceBit,
  type DrumRom,
  type DrumRow,
} from '../drums'
import styles from './DrumGrid.module.css'
import { Tip } from './Tip'

// The playhead only moves when a step does, so the grid redraws at the step rate
// rather than at the meter's.
function usePlayTick(): number {
  return useSyncExternalStore(
    engine.meter.subscribe,
    () => engine.meter.get().tick,
  )
}

// How long a row stays lit after a hit. Long enough to see at a glance, short
// enough that sixteenth hats still read as sixteen hits rather than one lamp.
const FLASH_MS = 110

// Which rows are lit, from what the kit reports firing. The report is every
// hit, not every step: the mic on the trigger line, a bridged patch, a pad and
// the retrigger bend all land on steps the playhead gives no warning of, and
// this is the only place they show.
//
// The meter arrives sixty times a second and mostly says nothing fired, so the
// bits are compared before they are set — an unchanged mask re-renders nothing.
function useStruck(): number {
  const [lit, setLit] = useState(0)
  useEffect(() => {
    const at = new Float64Array(N_DRUM_VOICES)
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      const now = performance.now()
      let bits = 0
      for (let v = 0; v < N_DRUM_VOICES; v++)
        if (now - at[v]! < FLASH_MS) bits |= voiceBit(v)
      setLit(bits)
      // A kit that stops reporting — the engine suspended, the page hidden —
      // would otherwise leave whatever was lit at that moment lit for ever.
      clearTimeout(timer)
      if (bits !== 0) timer = setTimeout(settle, FLASH_MS)
    }
    const off = engine.meter.subscribe(() => {
      const hits = engine.meter.get().hits
      if (hits !== 0) {
        const now = performance.now()
        for (let v = 0; v < N_DRUM_VOICES; v++)
          if (hits & voiceBit(v)) at[v] = now
      }
      settle()
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [])
  return lit
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
  const playing = useStoreValue(engine.drumsPlaying)
  const tapping = useStoreValue(engine.tapRecord)
  const tick = usePlayTick()
  const struck = useStruck()
  // Two figures rather than the board: the grid is open while a morph travels,
  // and taking the whole of it would rebuild seven rows and their hundred and
  // twelve cells on every frame of one. A board carries every mask a ROM is
  // matched on, so the name is all this needs back.
  const level = useControlValue('drumLevel')
  const loaded = useBoardValue(c => romMatching(c)?.name)
  const live = playing && level > 0

  // Through the walk, like every other verb on the panel: a ROM lands on top of
  // whatever you had drawn, and an afternoon of writing a pattern is not a thing
  // a mis-aimed click gets to take. Written straight rather than travelled to —
  // a pattern is sixteen bits, and there is nothing between two of them.
  const load = (r: DrumRom) => {
    engine.armStep()
    engine.writeBoard({ ...engine.controls.get(), ...r.masks })
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.roms}>
        {DRUM_ROMS.map(r => (
          <Tip key={r.name} text={r.blurb}>
            <button
              className={loaded === r.name ? styles.romOn : styles.rom}
              onClick={() => load(r)}
            >
              {r.name}
            </button>
          </Tip>
        ))}
        {/* The other way a pattern gets written: play it in rather than draw
            it. It needs the kit running for there to be a step to land on, and
            it is never on when you arrive — a machine that records you is one
            you asked to.

            Armed with the kit stopped is a real state and a silent one: the
            hits still sound, so nothing about playing says the pattern isn't
            being kept. It gets its own look rather than a word, because the
            fix is to press play and the button next to it already says so. */}
        <Tip
          text={
            !tapping
              ? 'play the pattern in: arm this and every pad hit — or press of a row’s name — writes the step it lands on, rounded to the nearest. The kit has to be running for there to be a step'
              : playing
                ? 'pads and row names write the step they land on, rounded to the nearest. Press to stop'
                : 'armed, but the kit is stopped — hits sound and nothing is written. Run the kit and they land on the step they arrive in'
          }
        >
          <button
            className={
              !tapping ? styles.tap : playing ? styles.tapOn : styles.tapIdle
            }
            aria-pressed={tapping}
            onClick={() => engine.tapRecord.set(!tapping)}
          >
            tap in
          </button>
        </Tip>
      </div>

      <div className={styles.grid}>
        {GRID_ROWS.map((row, v) => (
          <Row
            key={row.key}
            row={row}
            tick={live ? tick : null}
            lit={(struck & voiceBit(v)) !== 0}
          />
        ))}
      </div>

      {/* The one place that may start the kit, because it is a button that says
          it will. Nothing else on the board presses play for you. */}
      {live || (
        <button
          className={styles.silent}
          onClick={() => {
            if (level === 0) {
              engine.armStep()
              engine.set('drumLevel', 0.8)
            }
            engine.setDrumsPlaying(true)
          }}
        >
          {level === 0
            ? 'the kit is turned down — bring Level up and run it'
            : 'the kit is stopped — run it'}
        </button>
      )}
    </div>
  )
}

function Row({
  row,
  tick,
  lit,
}: {
  row: DrumRow
  tick: number | null
  lit: boolean
}) {
  const mask = useControlValue(row.key)
  const len = asLen(useControlValue(row.len))
  const accent = row.key === 'drumAccent'
  // Each row's own playhead: the counter is steps clocked, so a short row is
  // round again while the long ones are still in the bar.
  const under = tick === null ? -1 : tick % len

  const voice = DRUM_VOICES.findIndex(v => v.key === row.key)

  return (
    <Tip text={row.help}>
      <div className={styles.row}>
        {/* The name is the voice itself: press it to hear the row without waiting
            for the playhead to reach a step you have just written. Accent is
            not a voice, so its name is only a name. */}
        {voice < 0 ? (
          <span className={mask ? styles.nameOn : styles.name}>
            {row.label}
          </span>
        ) : (
          <Tip
            text={`press to hear the ${row.label} — with tap in armed and the kit running, it writes the step it lands on`}
          >
            <button
              className={
                lit ? styles.nameHit : mask ? styles.nameOn : styles.name
              }
              onClick={() => engine.drumHit(voiceBit(voice))}
            >
              {row.label}
            </button>
          </Tip>
        )}
        <div className={styles.cells}>
          {Array.from({ length: STEPS }, (_, s) => (
            <Cell
              key={s}
              row={row}
              step={s}
              className={cellClass({
                accent,
                on: hasStep(mask, s),
                beat: s % 4 === 0,
                under: s === under,
                past: s >= len,
              })}
              on={hasStep(mask, s)}
              mask={mask}
            />
          ))}
        </div>
        {/* A select rather than a nudge or a shift-click alone: it says what the
            numbers are, it is one tap on a phone, and it is the only way to
            give a row its sixteen steps back once you have shortened it. */}
        <Tip
          text={
            len === STEPS
              ? `how many steps the ${row.label} row plays before it comes round. All sixteen is the machine as it left the factory; anything else runs against the rows that kept theirs`
              : `the ${row.label} row comes round every ${len} steps, so it lands somewhere different against the others each bar`
          }
        >
          <select
            className={len === STEPS ? styles.len : styles.lenShort}
            value={len}
            onChange={e => engine.set(row.len, Number(e.currentTarget.value))}
            aria-label={`${row.label} row length`}
          >
            {Array.from({ length: STEPS }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </Tip>
      </div>
    </Tip>
  )
}

// Memoised because the playhead moves: a tick re-renders the row, and without
// this every one of its sixteen cells would rebuild the tip hanging off it to
// arrive at the same box it already had. Only the two cells whose class changed
// have anything to do.
const Cell = memo(function Cell(props: {
  row: DrumRow
  step: number
  className: string
  on: boolean
  mask: number
}) {
  const { row, step } = props
  return (
    <Tip
      text={`shift-click to bring the ${row.label} row round after step ${step + 1}`}
    >
      <button
        className={props.className}
        aria-label={`${row.label} step ${step + 1}`}
        aria-pressed={props.on}
        onClick={e =>
          e.shiftKey
            ? engine.set(row.len, step + 1)
            : engine.set(row.key, toggleStep(props.mask, step))
        }
      />
    </Tip>
  )
})

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
