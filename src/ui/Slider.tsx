import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { useControlValue, useStoreValue } from './ControlsContext'
import type { SliderDef } from './controls'
import { snapToStep } from './controls'
import { midi } from './midi'
import { formatValue, fromPos, readoutChars, toPos } from './slider-scale'
import styles from './Slider.module.css'
import { Tip, type TipHandle } from './Tip'

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

// The widest reading any row in a panel can print. Every row in it reserves
// that much, so the tracks all end in the same place — and it is a floor rather
// than a size, since a row drawn outside any panel, or one whose own reading
// runs longer than its neighbours', still has to fit what it says.
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
    return (
      <Tip ref={tip} text={def.help}>
        <div className={styles.row}>
          <span
            className={touched ? styles.labelTouched : styles.label}
            onClick={() => tip.current?.toggle()}
          >
            {label}
          </span>
          <span className={styles.choices}>
            {choices.length > CHOICES_AS_BUTTONS ? (
              <select
                className={touched ? styles.listOn : styles.list}
                aria-label={label}
                value={Math.round(value) - def.min}
                onChange={e => pick(Number(e.currentTarget.value))}
              >
                {choices.map((c, i) => (
                  <option key={`${i}${c}`} value={i}>
                    {c}
                  </option>
                ))}
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
            <Bind def={def} />
          </span>
        </div>
      </Tip>
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
      style={
        { '--chars': Math.max(readoutChars(def), reserved) } as CSSProperties
      }
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
    <Tip ref={tip} text={def.help}>
      <div className={split?.names ? styles.rowSplit : styles.row}>
        <span
          className={touched ? styles.labelTouched : styles.label}
          onClick={() => tip.current?.toggle()}
          onDoubleClick={() => write(def.key, stock)}
        >
          {label}
        </span>
        {split ? (
          <span
            className={styles.split}
            style={
              {
                '--turn': `${turn * 100}%`,
                '--way':
                  way < 0
                    ? 'color-mix(in srgb, var(--accent) 32%, var(--bg3))'
                    : way > 0
                      ? 'var(--accent)'
                      : 'var(--fg3)',
              } as CSSProperties
            }
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
        ) : def.mark === undefined ? (
          track
        ) : (
          <span
            className={styles.plain}
            style={
              { '--mark': `${toPos(def, def.mark) * 100}%` } as CSSProperties
            }
          >
            <span className={styles.tick} />
            {track}
          </span>
        )}
        <span
          className={
            way < 0
              ? styles.readoutBack
              : way > 0
                ? styles.readoutFwd
                : styles.readout
          }
        >
          {touched ? (
            <Tip
              text={`Off stock — click to put it back to ${formatValue(def, stock)}.`}
            >
              <button
                className={styles.revert}
                aria-label={`reset ${label} to ${formatValue(def, stock)}`}
                onClick={() => write(def.key, stock)}
              >
                {reading}
                <span className={styles.mark}>↺</span>
              </button>
            </Tip>
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
          <Bind def={def} />
        </span>
      </div>
    </Tip>
  )
}
