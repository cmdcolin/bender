import {
  memo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
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
  romMatching,
  stepBit,
  stepState,
  voiceBit,
  type DrumRom,
  type DrumRow,
  type StepState,
} from '../drums'
import { DRUM_MOVES, masksOf, type DrumMove } from '../drum-moves'
import { padKeyFor } from './drumKeys'
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

// What a drag across the grid is writing. Held in a ref rather than in state
// because the grid draws none of it: what the cell under the finger became on
// the way down is what every cell the drag reaches becomes too. A drag that
// decided per cell would be a hand rubbing a row out and back in again.
//
// So the three states are three drags. Off a dark step it draws a run of steps;
// off a lit one it wires that run through the dice; off a maybe it wipes.
type Paint = RefObject<StepState | null>

// One click, one state on. The accent row skips the middle one — it has no
// maybe mask, so its contact is the two-state contact it always was.
const NEXT: Record<StepState, StepState> = {
  off: 'on',
  on: 'maybe',
  maybe: 'off',
}

// The pattern, as the plugboard it is: a row per voice, a column per step, and
// the accent row underneath deciding how hard each column lands. The ROM
// buttons write into the same masks, so a factory pattern is a starting point
// you can edit rather than a mode you are stuck in.
//
// Each row carries its own length, so the rows need not come round together.
// Shift-click a step to end a row there; the badge on the right says where it
// ends, and puts the row back to sixteen.
//
// A contact has three positions rather than two: out, closed, and wired through
// the kit's dice, where Chance decides it afresh every lap. Which is the only
// thing on the panel that stops sixteen steps from being sixteen steps.
export function DrumGrid() {
  const playing = useStoreValue(engine.drumsPlaying)
  const armed = useStoreValue(engine.drumRecord)
  const slots = useStoreValue(engine.drumSlots)
  const tick = usePlayTick()
  const struck = useStruck()
  // Two figures rather than the board: the grid is open while a morph travels,
  // and taking the whole of it would rebuild seven rows and their hundred and
  // twelve cells on every frame of one. A board carries every mask a ROM is
  // matched on, so the name is all this needs back.
  const level = useControlValue('drumLevel')
  const loaded = useBoardValue(c => romMatching(c)?.name)
  const live = playing && level > 0
  const paint = useRef<StepState | null>(null)
  // A drag ends wherever the hand lets go, which is often not over a cell — so
  // the release is heard on the window rather than on the button. Without it
  // the direction outlives the gesture, and the next press anywhere on the page
  // dragged over the grid would carry on drawing the run before it.
  useEffect(() => {
    const done = () => {
      paint.current = null
    }
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
  }, [])

  // Through the walk, like every other verb on the panel: a ROM lands on top of
  // whatever you had drawn, and an afternoon of writing a pattern is not a thing
  // a mis-aimed click gets to take. Written straight rather than travelled to —
  // a pattern is sixteen bits, and there is nothing between two of them.
  const load = (r: DrumRom) => {
    engine.armStep()
    engine.writeBoard({ ...engine.controls.get(), ...r.masks })
  }

  // The moves land the same way a ROM does, and for the same reason: one entry
  // in the walk, so a fill you don't like is one ctrl+z away from the bar you
  // spent the afternoon on.
  const play = (move: DrumMove, back: boolean) => {
    const board = engine.controls.get()
    engine.armStep()
    engine.writeBoard({
      ...board,
      ...move.play({
        masks: masksOf(board),
        lens: board,
        rand: Math.random,
        back,
      }),
    })
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.roms}>
        {/* Runs the kit from the grid itself, so toggling it doesn't mean a
            trip back up to the io row while you're looking at the pattern. */}
        <Tip text={playing ? 'Stop the kit.' : 'Run the kit.'}>
          <button
            className={playing ? styles.playOn : styles.play}
            aria-pressed={playing}
            onClick={() => engine.setDrumsPlaying(!playing)}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </Tip>
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
            !armed
              ? 'play the pattern in: arm this and every hit — the number keys, a row’s name, a pad on a controller — writes the step it lands on, rounded to the nearest. The kit has to be running for there to be a step'
              : playing
                ? 'every hit writes the step it lands on, rounded to the nearest. Press to stop'
                : 'armed, but the kit is stopped — hits sound and nothing is written. Run the kit and they land on the step they arrive in'
          }
        >
          <button
            className={
              !armed ? styles.rec : playing ? styles.recOn : styles.recIdle
            }
            aria-pressed={armed}
            onClick={() => engine.drumRecord.set(!armed)}
          >
            record
          </button>
        </Tip>
      </div>

      {/* Spare patterns, next to the grid rather than a preset: empty until you
          put something in one, and nothing here says what a slot holds beyond
          "something" or "nothing" — the grid itself is the only place to see
          what a pattern is. */}
      <div className={styles.slots}>
        {slots.map((slot, i) => (
          <Tip
            key={i}
            text={
              slot
                ? `Load pattern ${i + 1}. Shift-click to overwrite it with the grid as it stands.`
                : `Empty — click to save the grid as it stands into pattern ${i + 1}.`
            }
          >
            <button
              className={slot ? styles.slot : styles.slotEmpty}
              onClick={e =>
                slot && !e.shiftKey
                  ? engine.loadDrumSlot(i)
                  : engine.saveDrumSlot(i)
              }
            >
              {i + 1}
            </button>
          </Tip>
        ))}
      </div>

      {/* What the machine will do to a pattern that a hand drawing sixteen
          contacts at a time will not. They read as verbs rather than as ROMs
          because none of them is a place you can be: a ROM is where the grid
          is, a move is something that happened to it. */}
      <div className={styles.moves}>
        {DRUM_MOVES.map(move => (
          <Tip key={move.name} text={move.blurb}>
            <button
              className={styles.move}
              onClick={e => play(move, e.shiftKey)}
            >
              {move.name}
            </button>
          </Tip>
        ))}
      </div>

      <div className={styles.grid}>
        {GRID_ROWS.map((row, v) => (
          <Row
            key={row.key}
            row={row}
            tick={live ? tick : null}
            lit={(struck & voiceBit(v)) !== 0}
            paint={paint}
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
  paint,
}: {
  row: DrumRow
  tick: number | null
  lit: boolean
  paint: Paint
}) {
  const mask = useControlValue(row.key)
  // The accent row has no maybe mask, so it reads its own back and draws none:
  // a hook cannot be asked for conditionally, and there is nothing else on the
  // board a row would rather be watching.
  const dice = useControlValue(row.maybe ?? row.key)
  const maybe = row.maybe ? dice : 0
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
            text={`Press to hear the ${row.label}, or play it on the ${padKeyFor(voice)} key — with record armed and the kit running, it writes the step it lands on.`}
          >
            <button
              className={
                lit
                  ? styles.nameHit
                  : mask || maybe
                    ? styles.nameOn
                    : styles.name
              }
              onClick={() => engine.drumHit(voiceBit(voice))}
            >
              <span className={styles.padKey}>{padKeyFor(voice)}</span>
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
              paint={paint}
              className={cellClass({
                accent,
                state: stepState(mask, maybe, s),
                beat: s % 4 === 0,
                under: s === under,
                past: s >= len,
              })}
              state={stepState(mask, maybe, s)}
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
  state: StepState
  paint: Paint
}) {
  const { row, step, paint } = props
  // The masks as they stand, not as they stood when this cell last drew: a drag
  // writes a cell per event, and folding a bit into a rendered copy would make
  // every step of the run depend on React having caught up in between.
  //
  // The two are kept apart rather than layered, so what the grid draws is what
  // the kit reads: a step is in one mask or the other or neither.
  const write = (to: StepState) => {
    const board = engine.controls.get()
    const bit = stepBit(step)
    const mask = to === 'on' ? board[row.key] | bit : board[row.key] & ~bit
    if (mask !== board[row.key]) engine.set(row.key, mask)
    if (!row.maybe) return
    const dice =
      to === 'maybe' ? board[row.maybe] | bit : board[row.maybe] & ~bit
    if (dice !== board[row.maybe]) engine.set(row.maybe, dice)
  }
  // Round the three states, or the two the accent row has.
  const next = () =>
    row.maybe ? NEXT[props.state] : props.state === 'on' ? 'off' : 'on'
  return (
    <Tip
      text={
        row.maybe
          ? `One click closes the step, a second wires it through the kit’s dice so it fires as often as Chance says, a third puts it out. Drag across the grid to write a run of whichever the step under your finger became — shift-click to bring the ${row.label} row round after step ${step + 1}.`
          : `Drag across the grid to draw a run of steps — shift-click to bring the ${row.label} row round after step ${step + 1}.`
      }
    >
      <button
        className={props.className}
        aria-label={`${row.label} step ${step + 1}`}
        // Half-pressed is what a maybe step is: the contact is wired up and the
        // kit still has to decide.
        aria-pressed={props.state === 'maybe' ? 'mixed' : props.state === 'on'}
        // The press writes on the way down rather than on the click, because
        // this is where a drag starts and the step under the finger is the one
        // that says which way the drag writes.
        onPointerDown={e => {
          // The left button, a finger or a pen. A right-click is on its way to
          // the browser's own menu and has no business closing a contact.
          if (e.button === 0) {
            // A touch captures the pointer to the element it landed on, and a
            // captured pointer never enters another cell. Handing it straight
            // back is what makes a finger across the grid a drag at all.
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
            engine.armStep()
            if (e.shiftKey) {
              paint.current = null
              engine.set(row.len, step + 1)
            } else {
              paint.current = next()
              write(paint.current)
            }
          }
        }}
        // The rest of the drag. `buttons` is what says the hand is still down:
        // a mouse crossing the grid on its way somewhere else reports none, and
        // a finger that has lifted sends no more of these at all.
        onPointerEnter={e => {
          if (
            (e.buttons & 1) !== 0 &&
            paint.current !== null &&
            paint.current !== props.state
          )
            write(paint.current)
        }}
        // Keyboard only — a click a pointer made was already written on the way
        // down, and a button worked by Enter or the space bar reports no detail.
        onClick={e => {
          if (e.detail === 0) {
            engine.armStep()
            if (e.shiftKey) engine.set(row.len, step + 1)
            else write(next())
          }
        }}
      />
    </Tip>
  )
})

function cellClass(s: {
  accent: boolean
  state: StepState
  beat: boolean
  under: boolean
  past: boolean
}): string {
  const base = s.accent
    ? s.state === 'on'
      ? styles.accentOn
      : styles.accent
    : s.state === 'maybe'
      ? styles.cellMaybe
      : s.state === 'on'
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
