import {
  memo,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'

import { DRUM_MOVES, masksOf, throwLast, type DrumMove } from '../drum-moves.ts'
import {
  asLen,
  DRUM_ROMS,
  asEventEvery,
  DRUM_VOICES,
  EVENT_EVERY,
  EVENT_KEYS,
  EVENTS,
  GRID_ROWS,
  NUDGE_KEYS,
  NUDGES,
  RATCHET_KEYS,
  RATCHETS,
  STEPS,
  romMatching,
  stepBit,
  stepState,
  THROW_ROW,
  voiceBit,
  type DrumRom,
  type PanelRow,
  type StepState,
} from '../drums.ts'
import { engine } from '../engine/engine.ts'
import {
  bendDeal,
  bendRow,
  shuffleBendRow,
  toggleBendStep,
} from './bendKeys.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import { SHUFFLE } from './DeviceVerbs.tsx'
import styles from './DrumGrid.module.css'
import { padKeyFor, toggleRowMute } from './drumKeys.ts'
import { Tip } from './Tip.tsx'
import { useStruck } from './useStruck.ts'

import type { ControlKey, Controls } from '../controls.ts'

// Where a row's playhead stands, -1 while the kit is not running. Each row
// reads its own, so a step redraws only the rows whose playhead moved.
function useUnder(live: boolean, len: number): number {
  return useSyncExternalStore(engine.meter.subscribe, () =>
    live ? engine.meter.get().tick % len : -1,
  )
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

const throwIt = (clear: boolean) => {
  const board = engine.controls.get()
  engine.armStep()
  engine.set('drumThrow', clear ? 0 : throwLast(masksOf(board)))
  if (!clear) wakeEcho(board)
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

  return (
    <div className={styles.wrap}>
      <div className={styles.roms}>
        <Tip text={playing ? 'Stop the kit.' : 'Run the kit.'}>
          <button
            className={playing ? styles.playOn : styles.play}
            aria-pressed={playing}
            onClick={() => engine.setDrumsPlaying(!playing)}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </Tip>
        <span className={styles.label}>beats</span>
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
            it. Arming runs the kit, since a hit needs a step to land on, and
            it is never on when you arrive — a machine that records you is one
            you asked to.

            Armed with the kit stopped is a real state and a silent one: the
            hits still sound, so nothing about playing says the pattern isn't
            being kept. It gets its own look rather than a word, because the
            fix is to press play and the button next to it already says so. */}
        <Tip
          text={
            !armed
              ? 'play the pattern in: arm this and every hit — the number keys, a row’s name, a pad on a controller — writes the step it lands on, rounded to the nearest. Arming runs the kit'
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
            onClick={() => engine.armDrumRecord(!armed)}
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
        <span className={styles.label}>memory</span>
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
        <span className={styles.label}>moves</span>
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
        <Tip text="Throw the bar's last snare into Wraith. Shift-click clears the echo row.">
          <button className={styles.move} onClick={e => throwIt(e.shiftKey)}>
            throw
          </button>
        </Tip>
      </div>

      <div className={styles.grid}>
        <Ruler />
        {[...GRID_ROWS, THROW_ROW].map((row, v) => (
          <Row
            key={row.key}
            row={row}
            live={live}
            lit={(struck & voiceBit(v)) !== 0}
            paint={paint}
          />
        ))}
        <BendRow live={live} />
        <CycleRow
          live={live}
          name="ratchet"
          keys={RATCHET_KEYS}
          values={RATCHETS.map((_, i) => i)}
          says={v => (v ? `×${RATCHETS[v]}` : '')}
          tip="How many times each step fires inside itself: ×2 to ×8, every voice on the step, each repeat rolling the dice again. Click to go up, shift-click to go down. Ratchet ramp fades or swells the repeats."
        />
        <CycleRow
          live={live}
          name="nudge"
          keys={NUDGE_KEYS}
          values={NUDGES}
          says={v => (v ? `${v}` : '')}
          tip="How late each step lands, in twelfths of the step: 6 is half a step, 4 and 8 sit on the triplet. A ratcheted step squeezes its repeats into what is left. Click to go later, shift-click to go back."
        />
        <CycleRow
          live={live}
          name="event"
          keys={EVENT_KEYS}
          values={EVENTS.map((_, i) => i)}
          says={v => EVENT_GLYPHS[v]!}
          tail={<EventEvery />}
          tip="A fault on the whole board for the length of its step: c a knife through the output lead, d the cells losing contact so the shared rail sags, b a tape brake on the mix, f the step's first quarter looped, r the power pulled and put back. A run of one letter plays as one fault, so four b in a row brake over the whole beat. A reboot on the shared cells restarts the kit’s bar too, unless the kit runs off another supply. Click to go round, shift-click to go back."
        />
      </div>

      {level === 0 && (
        <button
          className={styles.silent}
          onClick={() => {
            engine.armStep()
            engine.set('drumLevel', 0.8)
            engine.setDrumsPlaying(true)
          }}
        >
          the kit is turned down — bring Level up and run it
        </button>
      )}
    </div>
  )
}

function MuteSwitch({ voice, muted }: { voice: number; muted: boolean }) {
  const label = DRUM_VOICES[voice]!.label
  return (
    <Tip
      text={
        muted
          ? `Put the pattern back on the ${label}. Shift+${padKeyFor(voice)} does it too.`
          : `Keep the pattern off the ${label}; the pad still plays it. Shift+${padKeyFor(voice)} does it too.`
      }
    >
      <button
        className={muted ? styles.muteOn : styles.mute}
        aria-label={`mute ${label}`}
        aria-pressed={muted}
        onClick={() => toggleRowMute(voice)}
      >
        m
      </button>
    </Tip>
  )
}

function Ruler() {
  return (
    <div className={styles.row} aria-hidden="true">
      <span />
      <span />
      <div className={styles.cells}>
        {Array.from({ length: STEPS }, (_, s) => (
          <span key={s} className={styles.tick}>
            {s % 4 === 0 ? s / 4 + 1 : ''}
          </span>
        ))}
      </div>
      <span />
    </div>
  )
}

const Row = memo(function Row({
  row,
  live,
  lit,
  paint,
}: {
  row: PanelRow
  live: boolean
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
  const kind =
    row.key === 'drumAccent'
      ? 'accent'
      : row.key === 'drumThrow'
        ? 'echo'
        : 'voice'
  // Each row's own playhead: the counter is steps clocked, so a short row is
  // round again while the long ones are still in the bar.
  const under = useUnder(live, len)

  const voice = DRUM_VOICES.findIndex(v => v.key === row.key)
  const muted =
    useControlValue('drumRowMute') & (voice < 0 ? 0 : voiceBit(voice))

  return (
    <Tip text={row.help}>
      <div className={kind === 'voice' ? styles.row : styles.extraRow}>
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
        {voice < 0 ? (
          <span />
        ) : (
          <MuteSwitch voice={voice} muted={muted !== 0} />
        )}
        <div className={muted ? styles.cellsMuted : styles.cells}>
          {Array.from({ length: STEPS }, (_, s) => (
            <Cell
              key={s}
              row={row}
              step={s}
              paint={paint}
              className={cellClass({
                kind,
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
          <span className={styles.field}>
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
            <span className={styles.chevron} aria-hidden="true">
              ▾
            </span>
          </span>
        </Tip>
      </div>
    </Tip>
  )
})

// Memoised because the playhead moves: a tick re-renders the row, and without
// this every one of its sixteen cells would rebuild the tip hanging off it to
// arrive at the same box it already had. Only the two cells whose class changed
// have anything to do.
const Cell = memo(function Cell(props: {
  row: PanelRow
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
    if (row.key === THROW_ROW.key && to === 'on') wakeEcho(board)
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
              // oxlint-disable-next-line react/immutability -- paint is a ref the grid shares with every step
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

// The bend keys on the clock: step n fires bend key n for the length of the
// step. Not a control, since the deal it points at is this session's, so the
// row writes its own store and rides in no link.
function BendRow({ live }: { live: boolean }) {
  const mask = useStoreValue(bendRow)
  const deal = useStoreValue(bendDeal)
  const under = useUnder(live, STEPS)
  return (
    <Tip text="Steps that fire a bend key: the first step the first key, the second the second, each held for its step. Redeal the keys and the same steps fire the new ones.">
      <div className={styles.extraRow}>
        <span className={mask ? styles.nameOn : styles.name}>bend</span>
        <span />
        <div className={styles.cells}>
          {Array.from({ length: STEPS }, (_, s) => {
            const on = (mask & stepBit(s)) !== 0
            const k = deal[s]
            return (
              <Tip
                key={s}
                text={k ? `${k.says} on step ${s + 1}` : `step ${s + 1}`}
              >
                <button
                  className={cellClass({
                    kind: 'bend',
                    state: on ? 'on' : 'off',
                    beat: s % 4 === 0,
                    under: s === under,
                    past: false,
                  })}
                  aria-label={`bend step ${s + 1}`}
                  aria-pressed={on}
                  onClick={() => toggleBendStep(s)}
                >
                  {k && <span className={styles.bendLetter}>{k.letter}</span>}
                </button>
              </Tip>
            )
          })}
        </div>
        <Tip text="Light a new scatter of steps.">
          <button
            className={styles.shuffleRow}
            aria-label="shuffle bend steps"
            onClick={() => shuffleBendRow()}
          >
            {SHUFFLE}
          </button>
        </Tip>
      </div>
    </Tip>
  )
}

const EVENT_GLYPHS = ['', 'c', 'd', 'b', 'f', 'r']

// A per-step value that clicks round a short list, on the bend row's cells.
function CycleRow(props: {
  live: boolean
  name: string
  keys: readonly ControlKey[]
  values: readonly number[]
  says: (v: number) => string
  tip: string
  tail?: ReactNode
}) {
  const { keys, values } = props
  const now = useBoardValue(c => keys.map(k => c[k]).join(','))
    .split(',')
    .map(Number)
  const under = useUnder(props.live, STEPS)
  const step = (s: number, by: number) => {
    const at = Math.max(values.indexOf(now[s]!), 0)
    engine.armStep()
    engine.set(keys[s]!, values[(at + by + values.length) % values.length]!)
  }
  return (
    <Tip text={props.tip}>
      <div className={styles.extraRow}>
        <span className={now.some(Boolean) ? styles.nameOn : styles.name}>
          {props.name}
        </span>
        <span />
        <div className={styles.cells}>
          {now.map((v, s) => (
            <button
              key={s}
              className={cellClass({
                kind: 'bend',
                state: v ? 'on' : 'off',
                beat: s % 4 === 0,
                under: s === under,
                past: false,
              })}
              aria-label={`${props.name} step ${s + 1}`}
              aria-pressed={v !== 0}
              onClick={e => step(s, e.shiftKey ? -1 : 1)}
            >
              <span className={styles.bendLetter}>{props.says(v)}</span>
            </button>
          ))}
        </div>
        {props.tail ?? <span />}
      </div>
    </Tip>
  )
}

function EventEvery() {
  const at = asEventEvery(useBoardValue(c => c.drumEventEvery))
  const bars = EVENT_EVERY[at]!
  return (
    <Tip
      text={`The row fires on bar ${bars} of every ${bars}. Click for a longer run, shift-click for a shorter one.`}
    >
      <button
        className={styles.shuffleRow}
        aria-label="bars between faults"
        onClick={e => {
          const by = e.shiftKey ? -1 : 1
          const n = EVENT_EVERY.length
          engine.set('drumEventEvery', (at + by + n) % n)
        }}
      >
        {bars}:{bars}
      </button>
    </Tip>
  )
}

// A throw onto a tape delay that is switched off would do nothing, so the first
// one brings the echo up with only the throws going in.
function wakeEcho(board: Controls) {
  if (board.dlyMix > 0) return
  engine.set('dlyMix', 0.7)
  engine.set('dlySend', 0)
  if (board.dlyFb < 0.55) engine.set('dlyFb', 0.55)
}

function cellClass(s: {
  kind: 'voice' | 'accent' | 'echo' | 'bend'
  state: StepState
  beat: boolean
  under: boolean
  past: boolean
}): string {
  const base =
    s.kind === 'accent'
      ? s.state === 'on'
        ? styles.accentOn
        : styles.accent
      : s.kind === 'echo'
        ? s.state === 'on'
          ? styles.echoOn
          : styles.echo
        : s.kind === 'bend'
          ? s.state === 'on'
            ? styles.bendOn
            : styles.bend
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
