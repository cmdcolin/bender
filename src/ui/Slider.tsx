import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import {
  bayLfoWires,
  laneHasSpare,
  laneReads,
  laneSays,
  laneWire,
  solderLane,
  unsolderLane,
  wireKeys,
} from './bayWire'
import { choiceName, sliderFor, snapToStep } from './controls'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext'
import { midi } from './midi'
import {
  formatValue,
  fromPos,
  normalEdges,
  pastNormal,
  readoutChars,
  toPos,
} from './slider-scale'
import styles from './Slider.module.css'
import { tapRun, tapValue } from './tap'
import { Tip, type TipHandle } from './Tip'

import type { SliderDef } from './controls'

// A discrete write is its own step in the undo walk: arm one, take it. A drag
// arms on the way down instead, so the whole sweep banks a single step — see
// the range input below.
function write(key: SliderDef['key'], value: number) {
  engine.armStep()
  engine.set(key, value)
}

// The control's end of a knob: what it is bound to, whether it is waiting to be
// bound, and — the part with nowhere else to live — where the physical knob is
// sitting while it has yet to catch this value. Soft takeover makes a knob inert
// until it sweeps through what is on screen, and without the mark the control
// just looks broken.
function Bind({ def }: { def: SliderDef }) {
  const status = useStoreValue(midi.status)
  const armed = useStoreValue(midi.armed)
  const binding = useStoreValue(midi.bindings)[def.key]
  const waiting = useStoreValue(midi.pickups)[def.key]
  if (status !== 'ready') return null
  const mine = armed === def.key
  return (
    <>
      {waiting === undefined ? null : (
        <Tip
          text={`Your knob is sitting at ${formatValue(def, waiting)} — sweep it through ${formatValue(def, engine.controls.get()[def.key])} to pick this control up.`}
        >
          <span className={styles.pickup}>{formatValue(def, waiting)}</span>
        </Tip>
      )}
      <Tip
        text={
          mine
            ? 'move a knob to take this control — esc to cancel'
            : binding === undefined
              ? 'put this control on a knob: press, then move the knob'
              : `on CC${binding.controller}${binding.channel === 0 ? '' : ` ch${binding.channel + 1}`} — press to move it to another knob`
        }
      >
        <button
          className={mine ? styles.bindOn : styles.bind}
          onClick={() => midi.arm(mine ? null : def.key)}
        >
          {binding === undefined ? '⚟' : `CC${binding.controller}`}
        </button>
      </Tip>
    </>
  )
}

// A speed tapped in rather than dialled. Two presses in time are a gap, a gap
// is the answer, and the row follows the hand from there — the same reading the
// MIDI clock takes off arrivals, from the one clock a board always has.
//
// The whole run banks a single step in the walk, the way a slider's whole sweep
// does: arming as the first write goes out means every press after it lands on
// nothing armed, so one ctrl+z puts back the speed you were tapping away from
// rather than the last three presses one at a time.
function Tap({ def, label }: { def: SliderDef; label: string }) {
  const [times, setTimes] = useState<number[]>([])
  const press = () => {
    const run = tapRun(times, performance.now())
    setTimes(run)
    const value = tapValue(def, run)
    if (value !== undefined) {
      if (run.length === 2) engine.armStep()
      engine.set(def.key, value)
    }
  }
  return (
    <Tip
      text={`Sets ${label} by hand: press it in time, twice for a reading and more to sharpen it. Leave it a couple of seconds and the next press starts a fresh count.`}
    >
      <button
        className={styles.action}
        aria-label={`tap ${label}`}
        onClick={() => press()}
      >
        tap
        {times.length > 1 ? (
          <span className={styles.tapCount}>{times.length}</span>
        ) : null}
      </button>
    </Tip>
  )
}

// The bay's end of a row, for the controls one of its four wires can land on:
// the same knob, moving on its own. It was always possible and never findable —
// the wire is in the bay, the lane is one of fifty-four names in a list, and
// nothing on the stage you were standing on said the bay could reach it. The
// button says it, and takes the trip.
//
// Patched, the row says what is on it rather than that something is: a wire off
// the LFO at 0.05 Hz and one at 200 Hz are a sweep and a buzz, and a badge that
// read the same for both would be sending you to the bay to answer a question
// it could answer by standing there. Pressing it unfolds the wire's own
// controls under the row, so the wobble is dialled where you are listening.
//
// Every press is one step in the walk, so a wire soldered by mistake is one
// ctrl+z.
function Mod({
  lane,
  label,
  open,
  onOpen,
}: {
  lane: string
  label: string
  open: boolean
  onOpen: (next: boolean) => void
}) {
  const wire = useBoardValue(c => laneWire(c, lane))
  const reads = useBoardValue(c => laneReads(c, lane))
  const says = useBoardValue(c => laneSays(c, lane))
  const spare = useBoardValue(c => laneHasSpare(c, lane))
  return wire > 0 ? (
    <Tip
      text={`Patch bay wire ${wire} is on this — ${says} — so it moves with your hand off it. Press to ${open ? 'fold the wire away' : 'set the source, the rate and how hard it pushes'}.`}
    >
      <button
        className={styles.modOn}
        aria-expanded={open}
        aria-label={`the bay wire on ${label}`}
        onClick={() => onOpen(!open)}
      >
        ∿ {reads}
        <span className={styles.modCaret}>{open ? '▴' : '▾'}</span>
      </button>
    </Tip>
  ) : spare ? (
    <Tip
      text={`Solders a spare bay wire from the LFO onto ${label}, so it moves on its own — press it again afterwards for the source, the rate and how hard it pushes.`}
    >
      <button
        className={styles.mod}
        aria-label={`put a bay wire on ${label}`}
        onClick={() => {
          engine.armStep()
          engine.writeBoard(solderLane(engine.controls.get(), lane))
          onOpen(true)
        }}
      >
        + mod
      </button>
    </Tip>
  ) : (
    <Tip text="All four of the bay's wires are soldered somewhere else. Unplug one — from the row it is on, or at the patch bay — to put one here.">
      <span className={styles.modFull}>+ mod</span>
    </Tip>
  )
}

// The wire itself, under the row it is on: what it picks up, how hard it
// pushes, and — while it is the bay's own oscillator it picks up — how fast
// that is running.
//
// The rows are the bay's own rows, the same definitions the bay draws, so
// learning one is learning the other and there is no second set of controls to
// keep in step with the first. The one thing said here that the bay does not
// have to say is that its oscillator is one oscillator: a rate dialled on this
// row is the rate of every wire that picks the LFO up.
function ModWire({ lane, label }: { lane: string; label: string }) {
  const wire = useBoardValue(c => laneWire(c, lane))
  const keys = wireKeys(wire)
  const onLfo = useBoardValue(
    c => keys !== undefined && choiceName('mod0Src', c[keys.src]) === 'LFO',
  )
  const shared = useBoardValue(c => bayLfoWires(c) > 1)
  return keys === undefined ? null : (
    <div className={styles.wire}>
      <span className={styles.wireName}>
        Patch bay wire {wire}, on {label}
      </span>
      <ControlSlider def={sliderFor(keys.src)} label="picks up" />
      <ControlSlider def={sliderFor(keys.depth)} label="pushes" />
      {onLfo && (
        <>
          <ControlSlider def={sliderFor('modLfoHz')} label="LFO rate" />
          <ControlSlider def={sliderFor('modLfoShape')} label="LFO shape" />
          {shared && (
            <span className={styles.wireNote}>
              The bay has one oscillator: this rate and shape are every wire
              picking the LFO up, not just this one.
            </span>
          )}
        </>
      )}
      <Tip
        text={`Takes wire ${wire} off ${label}. Where it landed and how hard it was pushing stay on the wire, so + mod puts this patch back rather than a fresh one.`}
      >
        <button
          className={styles.unplug}
          aria-label={`unplug the bay wire on ${label}`}
          onClick={() => {
            engine.armStep()
            engine.writeBoard(unsolderLane(engine.controls.get(), lane))
          }}
        >
          × unplug
        </button>
      </Tip>
    </div>
  )
}

// The widest reading any row in a panel can print. Every row in it reserves
// that much, so the tracks all end in the same place — and it is a floor rather
// than a size, since a row drawn outside any panel, or one whose own reading
// runs longer than its neighbours', still has to fit what it says.
const cssVars = (vars: Record<`--${string}`, string | number>): CSSProperties =>
  vars

const Reserved = createContext(0)

export function ReserveReadout({
  defs,
  children,
}: {
  defs: readonly SliderDef[]
  children: ReactNode
}) {
  const chars = useMemo(
    () =>
      defs.reduce((w, d) => (d.choices ? w : Math.max(w, readoutChars(d))), 0),
    [defs],
  )
  return <Reserved.Provider value={chars}>{children}</Reserved.Provider>
}

// How much of the travel either side of a split's turn belongs to the turn
// itself. The knob pulls to it under the hand, because two values a hair apart
// across the turn are not a hair apart in what you hear, and a stop you can
// only hit by luck is a stop that isn't there.
const DETENT = 0.02

function pull(def: SliderDef, pos: number): number {
  const split = def.split
  if (!split?.detent) return fromPos(def, pos)
  return Math.abs(pos - toPos(def, split.at)) < DETENT
    ? split.at
    : fromPos(def, pos)
}

function helpWithNormal(def: SliderDef) {
  if (!def.normal) return def.help
  const [lo, hi] = def.normal.map(v => formatValue(def, v))
  return def.normal[0] === def.min
    ? `${def.help} The red tick marks the top of the normal range, ${hi}.`
    : `${def.help} The red ticks mark the normal range, ${lo} to ${hi}.`
}

function NormalTrack({
  def,
  children,
}: {
  def: SliderDef
  children: ReactNode
}) {
  const [start, end] = normalEdges(def)
  const at = (pos: number) => cssVars({ '--at': pos })
  return (
    <span className={styles.plain}>
      {start > 0 && (
        <>
          <span
            className={styles.over}
            style={cssVars({ '--from': 0, '--to': start })}
          />
          <span className={styles.tick} style={at(start)} />
        </>
      )}
      {end < 1 && (
        <>
          <span
            className={styles.over}
            style={cssVars({ '--from': end, '--to': 1 })}
          />
          <span className={styles.tick} style={at(end)} />
        </>
      )}
      {children}
    </span>
  )
}

// Where a row of picks stops being a row you can read. Up to this many, the
// choices are all on screen and taking one is a single press; past it they wrap
// into a paragraph of buttons and the panel turns into a wall — a sixteen-rate
// decay table is a list to go down, not a keypad.
const CHOICES_AS_BUTTONS = 6

// `label` overrides the name the row prints, for a control drawn somewhere its
// own name says nothing: the mixer gathers seven faders and six of them are
// called *Level*, so on the desk each one is called the machine it belongs to.
// Everything else about the row is the same row, deliberately — the same
// tooltip, the same double-click back to stock, the same knob it is bound to.
export function ControlSlider({
  def,
  label = def.label,
}: {
  def: SliderDef
  label?: string
}) {
  const value = useControlValue(def.key)
  // Whether the wire on this row is unfolded under it. The row's own state:
  // two rows on the same panel can be open at once, and closing the stage
  // forgets them, which is what a fold on a row should do.
  const [wireOpen, setWireOpen] = useState(false)
  // Whether the knob is under a hand rather than under the arrow keys. The pull
  // to a split's turn belongs to the drag: a key step is smaller than the turn
  // is wide, so a knob that pulled for the keyboard too would be one the
  // keyboard could never walk off the stop.
  const hand = useRef(false)
  const reserved = useContext(Reserved)
  const stock = DEFAULT_CONTROLS[def.key]
  const touched = value !== stock
  const action = def.action
  // A hover tip is invisible to anyone who can't read it in the second before
  // it drifts away, so the label is also a button onto the same bubble: click
  // pins it open until you click elsewhere or press Escape.
  const tip = useRef<TipHandle>(null)

  if (def.choices) {
    const choices = def.choices
    const pick = (i: number) => write(def.key, def.min + i)
    const option = (i: number) => (
      <option key={`${i}${choices[i]}`} value={i}>
        {choices[i]}
      </option>
    )
    return (
      <>
        <div className={styles.row}>
          <Tip ref={tip} text={def.help}>
            <span
              className={touched ? styles.labelTouched : styles.label}
              onClick={() => tip.current?.toggle()}
            >
              {label}
            </span>
          </Tip>
          <span className={styles.choices}>
            {choices.length > CHOICES_AS_BUTTONS ? (
              <select
                className={touched ? styles.listOn : styles.list}
                aria-label={label}
                value={Math.round(value) - def.min}
                onChange={e => pick(Number(e.currentTarget.value))}
              >
                {def.groups
                  ? def.groups.map(g => (
                      <optgroup key={g.name} label={g.name}>
                        {g.choices.map(c => option(choices.indexOf(c)))}
                      </optgroup>
                    ))
                  : choices.map((_, i) => option(i))}
              </select>
            ) : (
              choices.map((c, i) => (
                <button
                  key={c}
                  className={
                    Math.round(value) - def.min === i
                      ? styles.choiceOn
                      : styles.choice
                  }
                  onClick={() => pick(i)}
                >
                  {c}
                </button>
              ))
            )}
            {def.lane === undefined ? null : (
              <Mod
                lane={def.lane}
                label={label}
                open={wireOpen}
                onOpen={next => setWireOpen(next)}
              />
            )}
            <Bind def={def} />
          </span>
        </div>
        {def.lane === undefined || !wireOpen ? null : (
          <ModWire lane={def.lane} label={label} />
        )}
      </>
    )
  }

  const split = def.split
  const pos = toPos(def, value)
  const turn = split ? toPos(def, split.at) : 0
  // Which half of the travel the knob is standing in: below the turn, above it,
  // or on it. Everything the row draws about direction comes off this.
  const way = split ? Math.sign(value - split.at) : 0
  const normal =
    split?.normal === undefined ? undefined : toPos(def, split.normal)

  // The reading in a box cut to the widest thing the panel can print, so a value
  // that grows a character mid-drag does not shove the track it came from.
  const reading = (
    <span
      className={styles.value}
      style={cssVars({ '--chars': Math.max(readoutChars(def), reserved) })}
    >
      {formatValue(def, value)}
    </span>
  )

  const track = (
    <input
      className={split ? styles.splitTrack : styles.track}
      type="range"
      min={0}
      max={1000}
      value={Math.round(pos * 1000)}
      // The track is a thousand positions along the travel, which is the
      // wrong thing to read out: what the knob says is its value in its own
      // units, off the same formatter the readout beside it uses. The label
      // is a span rather than a <label> because it also takes a double-click
      // back to stock, so the name has to be given here.
      aria-label={label}
      aria-valuetext={formatValue(def, value)}
      // The whole sweep is one gesture and wants one step in the walk, so it
      // arms here and the first move that changes anything takes it. A held
      // arrow key repeats, and a repeat is the same sweep continuing.
      onPointerDown={() => {
        hand.current = true
        engine.armStep()
      }}
      onPointerUp={() => (hand.current = false)}
      onPointerCancel={() => (hand.current = false)}
      onKeyDown={e => {
        hand.current = false
        if (!e.repeat) engine.armStep()
      }}
      onChange={e => {
        const at = Number(e.currentTarget.value) / 1000
        engine.set(
          def.key,
          snapToStep(def, hand.current ? pull(def, at) : fromPos(def, at)),
        )
      }}
      onDoubleClick={() => write(def.key, stock)}
    />
  )

  return (
    <>
      <div className={split?.names ? styles.rowSplit : styles.row}>
        <Tip ref={tip} text={helpWithNormal(def)}>
          <span
            className={touched ? styles.labelTouched : styles.label}
            onClick={() => tip.current?.toggle()}
            onDoubleClick={() => write(def.key, stock)}
          >
            {label}
          </span>
        </Tip>
        {split ? (
          <span
            className={styles.split}
            style={cssVars({
              '--turn': `${turn * 100}%`,
              '--way':
                way < 0
                  ? 'color-mix(in srgb, var(--accent) 32%, var(--surface-raised))'
                  : way > 0
                    ? 'var(--accent)'
                    : 'var(--fg3)',
            })}
          >
            {/* The travel drawn as the two things it is: a bed tinted dim
              below the turn and shaded full strength above it, the throw
              filled from the turn out to where the knob is standing rather
              than from the far end, and the turn itself marked. A knob
              sitting a hair the wrong side of the middle now reads as the
              wrong side rather than as nearly nothing. */}
            <span className={styles.bed}>
              <span
                className={styles.throw}
                style={{
                  left: `${Math.min(pos, turn) * 100}%`,
                  width: `${Math.abs(pos - turn) * 100}%`,
                }}
              />
              <span className={styles.turn} />
              {def.normal &&
                normalEdges(def)
                  .filter(edge => edge > 0 && edge < 1)
                  .map(edge => (
                    <span
                      key={edge}
                      className={styles.normalTick}
                      style={{ left: `${edge * 100}%` }}
                    />
                  ))}
              {normal !== undefined && (
                <>
                  <span
                    className={styles.normalBand}
                    style={{
                      left: `${Math.min(turn, normal) * 100}%`,
                      width: `${Math.abs(normal - turn) * 100}%`,
                    }}
                  />
                  <span
                    className={styles.normalTick}
                    style={{ left: `${normal * 100}%` }}
                  />
                </>
              )}
            </span>
            {track}
            {split.names && (
              <span className={styles.ends}>
                <span className={way < 0 ? styles.endBack : styles.end}>
                  ◀ {split.names.below}
                </span>
                <span className={way === 0 ? styles.endMid : styles.end}>
                  {split.names.mid}
                </span>
                <span className={way > 0 ? styles.endFwd : styles.end}>
                  {split.names.above} ▶
                </span>
              </span>
            )}
          </span>
        ) : def.normal === undefined ? (
          track
        ) : (
          <NormalTrack def={def}>{track}</NormalTrack>
        )}
        <span
          className={
            pastNormal(def, value)
              ? styles.readoutOver
              : way < 0
                ? styles.readoutBack
                : way > 0
                  ? styles.readoutFwd
                  : styles.readout
          }
        >
          {touched ? (
            <>
              {reading}
              <Tip
                text={`Off stock — click to put it back to ${formatValue(def, stock)}.`}
              >
                <button
                  className={styles.revert}
                  aria-label={`reset ${label} to ${formatValue(def, stock)}`}
                  onClick={() => write(def.key, stock)}
                >
                  <span className={styles.mark}>↺</span>
                </button>
              </Tip>
            </>
          ) : (
            <>
              {reading}
              <span className={styles.markIdle}>↺</span>
            </>
          )}
          {action && (
            <Tip text={action.title}>
              <button
                className={styles.action}
                onClick={() =>
                  write(
                    def.key,
                    snapToStep(def, action.value(engine.controls.get(), def)),
                  )
                }
              >
                {action.label}
              </button>
            </Tip>
          )}
          {def.tap === undefined ? null : <Tap def={def} label={label} />}
          {def.lane === undefined ? null : (
            <Mod
              lane={def.lane}
              label={label}
              open={wireOpen}
              onOpen={next => setWireOpen(next)}
            />
          )}
          <Bind def={def} />
        </span>
      </div>
      {def.lane === undefined || !wireOpen ? null : (
        <ModWire lane={def.lane} label={label} />
      )}
    </>
  )
}
