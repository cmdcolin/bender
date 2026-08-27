import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { engine } from '../engine/engine'
import { isSharp, semitoneName } from '../notes'
import {
  asTuneLen,
  HOLD,
  isNote,
  laneForNote,
  laneOf,
  NOTE_HI,
  NOTE_LO,
  REST,
  TUNE_ALL_STEP_KEYS,
  TUNE_LANE_KEYS,
  TUNE_STEPS,
  voicing,
} from '../tune'
import { YOURS } from '../dsp/stages/roms'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext'
import styles from './TuneRoll.module.css'
import { Tip } from './Tip'

// How much of the keyboard the roll shows at once. Two octaves is what a toy
// melody stays inside of and what fits the panel without the grid becoming the
// whole of it; the rest of the memory's reach is a press away on the octave
// buttons, and the window opens on what you played.
const ROWS = 24
const TOP_BASE = Math.max(NOTE_HI - ROWS + 1, NOTE_LO)

// C, in the chip's counting — its zero note is A, so a C is three semitones up.
const isC = (note: number) => ((note % 12) + 12) % 12 === 3

// The window's bottom, snapped to a C so the rows read as octaves rather than
// as wherever the lowest note you played happened to land.
const octaveFloor = (note: number) => Math.floor((note - 3) / 12) * 12 + 3

const clampBase = (note: number) => Math.min(Math.max(note, NOTE_LO), TOP_BASE)

const baseFor = (lanes: number[][]) => {
  const notes = lanes.flat().filter(isNote)
  return clampBase(octaveFloor(notes.length === 0 ? -9 : Math.min(...notes)))
}

// Where the tune's counter is standing. The same story as the kit's playhead:
// it only moves when a step does, so the roll redraws at the tune's rate rather
// than at the meter's.
function useTunePos(): number {
  return useSyncExternalStore(
    engine.meter.subscribe,
    () => engine.meter.get().tunePos,
  )
}

// Ninety-six numbers read through one subscription rather than ninety-six. What
// the board hands back has to be comparable with Object.is or every write to any
// control redraws the roll, so the steps travel as a string and come back as
// numbers — which is one small parse per write against the seven hundred and
// sixty-eight cells a morph would otherwise rebuild every frame.
function useLanes(): number[][] {
  const packed = useBoardValue(c => TUNE_ALL_STEP_KEYS.map(k => c[k]).join(','))
  const flat = packed.split(',').map(Number)
  return TUNE_LANE_KEYS.map((_, lane) =>
    flat.slice(lane * TUNE_STEPS, (lane + 1) * TUNE_STEPS),
  )
}

// What a drag across the roll is drawing. Held in a ref rather than in state
// because the roll draws none of it, the same as the kit's grid holds its own.
type Paint = RefObject<boolean>

// The melody memory, drawn the way a memory of notes wants to be drawn: a row
// per pitch, a column per step, and a bar across the steps a note is held for.
//
// The same shape as the kit's grid one floor up, deliberately — the two
// machines keep what you wrote the same way, and the only difference is that a
// row of this is a pitch rather than a drum.
export function TuneRoll() {
  const lanes = useLanes()
  const len = asTuneLen(useControlValue('tuneLen'))
  const poly = Math.round(useControlValue('tunePoly')) === 1
  const playing = useStoreValue(engine.songPlaying)
  const armed = useStoreValue(engine.tuneRecord)
  const mine = useBoardValue(c => Math.round(c.chipTune) === YOURS)
  const pos = useTunePos()
  const [base, setBase] = useState(() => baseFor(lanes))
  const paint = useRef(false)
  // What each lane is sounding, step by step. A cell is lit by whichever lane
  // has that note on that step, so a chord is three rows of one column and the
  // roll never has to say which chip is playing which of them.
  const bars = lanes.map(voicing)
  const under = playing && mine ? pos % len : -1

  // A drag ends wherever the hand lets go, which is often not over a cell. Without
  // this the gesture outlives itself, and the next press anywhere on the panel
  // dragged over the roll would carry on drawing.
  useEffect(() => {
    const done = () => {
      paint.current = false
    }
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
  }, [])

  const shift = (by: number) => setBase(b => clampBase(b + by))

  // Whether the memory holds anything the window is not showing. The roll draws
  // two octaves of a memory that reaches five, so a note written outside them —
  // played in off the octave switch, or arrived on a link — is a note you would
  // otherwise edit around without ever seeing it.
  const written = lanes.flat().filter(isNote)
  const above = written.some(n => n > base + ROWS - 1)
  const below = written.some(n => n < base)

  // Top row is the highest note, the way every roll and every stave is drawn.
  const notes = Array.from({ length: ROWS }, (_, i) => base + ROWS - 1 - i)

  const wipe = () => {
    engine.armStep()
    engine.writeBoard({
      ...engine.controls.get(),
      ...Object.fromEntries(TUNE_ALL_STEP_KEYS.map(k => [k, REST])),
    })
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        {/* Runs the tune from the roll itself, so toggling it doesn't mean a
            trip back up to the io row while you're looking at the memory. */}
        <Tip text={playing ? 'Stop the tune.' : 'Run the tune.'}>
          <button
            className={playing ? styles.playOn : styles.play}
            aria-pressed={playing}
            onClick={() => engine.setSongPlaying(!playing)}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </Tip>
        {/* The record button, on the memory it writes into. The other one is on
            the keyboard's own deck, where your hands are — the same switch,
            reachable from both because you cannot watch this and play the keys
            at the same time. */}
        <Tip
          text={
            !armed
              ? 'play the melody in: arm this and every key you press — on screen, on the letter keys, on a controller — writes the step the chip is standing on. Arming puts the memory on, since a memory the chip is not playing records in silence'
              : playing
                ? 'every key you press writes the step it lands on, and a key held across steps comes out as one long note. Press to stop'
                : 'armed, but the tune is stopped — the keys still sound and nothing is written. Run the tune and they land on the step they arrive in'
          }
        >
          <button
            className={
              !armed ? styles.rec : playing ? styles.recOn : styles.recIdle
            }
            aria-pressed={armed}
            onClick={() => engine.armTuneRecord(!armed)}
          >
            record
          </button>
        </Tip>
        <Tip text="Wipe every step of the memory. One entry in the walk, so a memory you did not mean to wipe is one ctrl+z away.">
          <button className={styles.verb} onClick={() => wipe()}>
            clear
          </button>
        </Tip>
        <span className={styles.spacer} />
        <Tip
          text={
            below
              ? 'Move the window down an octave. Lit because there are notes down there: the memory reaches five octaves and the roll draws two of them.'
              : 'Move the window down an octave — the memory reaches further than the two octaves drawn.'
          }
        >
          <button
            className={below ? styles.octaveMore : styles.octave}
            onClick={() => shift(-12)}
            aria-label="window down an octave"
          >
            ▾
          </button>
        </Tip>
        <Tip
          text={
            above
              ? 'Move the window up an octave. Lit because there are notes up there.'
              : 'Move the window up an octave.'
          }
        >
          <button
            className={above ? styles.octaveMore : styles.octave}
            onClick={() => shift(12)}
            aria-label="window up an octave"
          >
            ▴
          </button>
        </Tip>
        {/* The number on its own read as a setting nobody could name. It says
            what it does now, and the grid draws the line it names. */}
        <Tip
          text={
            len === TUNE_STEPS
              ? 'how many steps the memory plays before it comes round. All thirty-two is the whole of it, the same length as the songs in the ROM bank; anything less is a shorter phrase, and the steps past the end keep whatever they were holding'
              : `the memory comes round every ${len} steps — the rest are still written, they are just past the end`
          }
        >
          <label className={styles.loop}>
            <span className={styles.loopLabel}>loop</span>
            <select
              className={len === TUNE_STEPS ? styles.len : styles.lenShort}
              value={len}
              onChange={e =>
                engine.set('tuneLen', Number(e.currentTarget.value))
              }
              aria-label="loop length in steps"
            >
              {Array.from({ length: TUNE_STEPS }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} {i === 0 ? 'step' : 'steps'}
                </option>
              ))}
            </select>
          </label>
        </Tip>
      </div>

      <Tip text="Click a cell to put that note on that step, and drag across to draw a line. Click a note again to take it off, and shift-click a step to hold whatever the step before it struck. Three notes fit on a step while the memory is in poly: the first goes to the melody lane and the rest to the chips stacked on it. In mono the chip reads the melody lane alone, so the stacked notes draw faint and a step you write on loses them.">
        <div className={styles.grid}>
          {notes.map(note => (
            <div key={note} className={styles.row}>
              <span className={styles.name}>
                {isC(note) ? semitoneName(note) : ''}
              </span>
              <div className={styles.cells}>
                {Array.from({ length: TUNE_STEPS }, (_, s) => {
                  const lane = bars.findIndex(l => l[s]!.note === note)
                  const on = lane >= 0
                  const head = on && bars[lane]![s]!.head
                  return (
                    <Cell
                      key={s}
                      step={s}
                      note={note}
                      paint={paint}
                      poly={poly}
                      on={on}
                      head={head}
                      className={cellClass({
                        on,
                        head,
                        ghost: on && !poly && lane > 0,
                        sharp: isSharp(note),
                        beat: s % 4 === 0,
                        under: s === under,
                        past: s >= len,
                        wrap: s === len,
                      })}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Tip>
    </div>
  )
}

// Memoised for the same reason the kit's cells are: the playhead moves, and a
// roll is seven hundred and sixty-eight cells. Only the two columns whose class
// changed have anything to do.
const Cell = memo(function Cell(props: {
  step: number
  note: number
  on: boolean
  head: boolean
  poly: boolean
  className: string
  paint: Paint
}) {
  const { step, note, paint, poly } = props
  // Written against the board as it stands rather than as it was drawn: a drag
  // writes a cell per event, and folding a note into a rendered copy would make
  // every step of the line depend on React having caught up in between. Which
  // lane takes the write is the same question — the lane a note is already on
  // if it is on one, else whichever is free.
  const write = (value: number) => {
    const c = engine.controls.get()
    const held = laneOf(c, step, note)
    const lane = poly
      ? held >= 0
        ? held
        : laneForNote(c, step, note, true)
      : 0
    const key = TUNE_LANE_KEYS[lane]![step]!
    // Drawing on the roll puts the chip on the memory, the way arming record
    // does. A note written into a memory nothing is playing is a note you drew
    // and cannot hear: the roll is the one panel where what you are looking at
    // and what is coming out of the speaker have to be the same thing. The tune
    // the chip was on is a press of the picker away, and one undo puts back
    // both it and the note, since the pair land as one entry in the walk.
    if (Math.round(c.chipTune) !== YOURS) engine.set('chipTune', YOURS)
    engine.set(key, value)
    // In mono the memory is one word a step, so a step you draw on comes out
    // holding one note: whatever the stacked chips were keeping there goes with
    // the write rather than sitting under it as a chord that comes back the
    // moment somebody flips the switch. Drag across the roll and the chords go
    // with the line you are drawing.
    if (!poly) {
      for (const keys of TUNE_LANE_KEYS.slice(1)) {
        const stacked = keys[step]!
        if (c[stacked] !== REST) engine.set(stacked, REST)
      }
    }
  }
  const put = (shift: boolean) => write(shift ? HOLD : props.head ? REST : note)
  return (
    <button
      className={props.className}
      aria-label={`${semitoneName(note)} step ${step + 1}`}
      aria-pressed={props.on}
      // On the way down, where a drag starts — the same as the kit's grid, and
      // for the same reason.
      onPointerDown={e => {
        if (e.button === 0) {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
          engine.armStep()
          paint.current = true
          put(e.shiftKey)
        }
      }}
      // The rest of the drag: one note per step it crosses, so a hand across the
      // roll draws a line. A step already carrying this note is left alone,
      // rather than being cleared and written again as the pointer wanders.
      onPointerEnter={e => {
        if ((e.buttons & 1) !== 0 && paint.current && !props.head) write(note)
      }}
      // Keyboard only: a click a pointer made was written on the way down.
      onClick={e => {
        if (e.detail === 0) {
          engine.armStep()
          put(e.shiftKey)
        }
      }}
    />
  )
})

function cellClass(s: {
  on: boolean
  head: boolean
  ghost: boolean
  sharp: boolean
  beat: boolean
  under: boolean
  past: boolean
  wrap: boolean
}): string {
  return [
    s.on ? (s.head ? styles.headOn : styles.holdOn) : styles.cell,
    s.ghost && styles.ghost,
    s.sharp && styles.sharp,
    s.beat && styles.beat,
    s.under && styles.under,
    s.past && styles.past,
    s.wrap && styles.wrapLine,
  ]
    .filter(Boolean)
    .join(' ')
}
