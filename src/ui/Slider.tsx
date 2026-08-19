import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { useControlValue, useStoreValue } from './ControlsContext'
import type { SliderDef } from './controls'
import { snapToStep } from './controls'
import { midi } from './midi'
import { formatValue, fromPos, toPos } from './slider-scale'
import styles from './Slider.module.css'
import { Tip } from './Tip'

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
          text={`your knob is sitting at ${formatValue(def, waiting)} — sweep it through ${formatValue(def, engine.controls.get()[def.key])} to pick this control up`}
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

// Where a row of picks stops being a row you can read. Up to this many, the
// choices are all on screen and taking one is a single press; past it they wrap
// into a paragraph of buttons and the panel turns into a wall — a sixteen-rate
// decay table is a list to go down, not a keypad.
const CHOICES_AS_BUTTONS = 6

export function ControlSlider({ def }: { def: SliderDef }) {
  const value = useControlValue(def.key)
  const touched = value !== DEFAULT_CONTROLS[def.key]

  if (def.choices) {
    const choices = def.choices
    const pick = (i: number) => write(def.key, def.min + i)
    return (
      <Tip text={def.help}>
        <div className={styles.row}>
          <span className={touched ? styles.labelTouched : styles.label}>
            {def.label}
          </span>
          <span className={styles.choices}>
            {choices.length > CHOICES_AS_BUTTONS ? (
              <select
                className={touched ? styles.listOn : styles.list}
                aria-label={def.label}
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

  return (
    <Tip text={def.help}>
      <div className={styles.row}>
        <span
          className={touched ? styles.labelTouched : styles.label}
          onDoubleClick={() => write(def.key, DEFAULT_CONTROLS[def.key])}
        >
          {def.label}
        </span>
        <input
          className={styles.track}
          type="range"
          min={0}
          max={1000}
          value={Math.round(toPos(def, value) * 1000)}
          // The track is a thousand positions along the travel, which is the
          // wrong thing to read out: what the knob says is its value in its own
          // units, off the same formatter the readout beside it uses. The label
          // is a span rather than a <label> because it also takes a double-click
          // back to stock, so the name has to be given here.
          aria-label={def.label}
          aria-valuetext={formatValue(def, value)}
          // The whole sweep is one gesture and wants one step in the walk, so it
          // arms here and the first move that changes anything takes it. A held
          // arrow key repeats, and a repeat is the same sweep continuing.
          onPointerDown={() => engine.armStep()}
          onKeyDown={e => {
            if (!e.repeat) engine.armStep()
          }}
          onChange={e => {
            const pos = Number(e.currentTarget.value) / 1000
            engine.set(def.key, snapToStep(def, fromPos(def, pos)))
          }}
          onDoubleClick={() => write(def.key, DEFAULT_CONTROLS[def.key])}
        />
        <span className={styles.readout}>
          {formatValue(def, value)}
          {def.action && (
            <Tip text={def.action.title}>
              <button
                className={styles.action}
                onClick={() =>
                  write(
                    def.key,
                    snapToStep(
                      def,
                      def.action!.value(engine.controls.get(), def),
                    ),
                  )
                }
              >
                {def.action.label}
              </button>
            </Tip>
          )}
          <Bind def={def} />
        </span>
      </div>
    </Tip>
  )
}
