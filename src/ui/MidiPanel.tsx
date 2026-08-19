import { useEffect, useState } from 'react'
import { useControlValue, useStoreValue } from './ControlsContext'
import { ALL_SLIDERS, groupFor, sliderFor } from './controls'
import { engine } from '../engine/engine'
import { AUTOMAP_KEYS, DEVICE_PROFILES, midi, type DeviceProfile } from './midi'
import { GM_CHANNEL, VOICE_KEYS, voiceLabel } from './pads'
import { noteName } from '../notes'
import styles from './MidiPanel.module.css'
import { Tip } from './Tip'

function label(key: Parameters<typeof sliderFor>[0]): string {
  return `${groupFor(key)} · ${sliderFor(key).label}`
}

function Bindings() {
  const bindings = useStoreValue(midi.bindings)
  const pickups = useStoreValue(midi.pickups)
  // Walked in signal-path order rather than bind order, so a row doesn't move
  // under the pointer as bindings come and go.
  const bound = ALL_SLIDERS.flatMap(s => {
    const b = bindings[s.key]
    return b === undefined ? [] : [{ slider: s, binding: b }]
  })
  if (bound.length === 0) return null
  return (
    <>
      <div className={styles.list}>
        {bound.map(({ slider: s, binding: b }) => {
          const stranded = pickups[s.key] !== undefined
          return (
            <div key={s.key} className={styles.bound}>
              <span
                className={stranded ? styles.strandedName : styles.boundName}
              >
                {label(s.key)}
              </span>
              {/* The one thing a knob cannot tell you about itself. An encoder
                  read as a position slams its control to one end and stays
                  there, which looks like a broken binding rather than a wrong
                  one — so the fix sits on the row where that happens. */}
              <Tip
                text={
                  b.relative === true
                    ? 'read as an endless encoder: each message is a turn. Press to read it as a position instead'
                    : 'read as a position: each message is where the knob is. Press if this knob is an endless encoder — the giveaway is a control that slams to one end and sticks'
                }
              >
                <button
                  className={b.relative === true ? styles.modeOn : styles.mode}
                  onClick={() => midi.setRelative(s.key, b.relative !== true)}
                >
                  {b.relative === true ? '↻' : '↔'}
                </button>
              </Tip>
              <span className={styles.cc}>
                CC{b.controller}
                {b.channel === 0 ? '' : ` ch${b.channel + 1}`}
              </span>
              <Tip text={`take ${s.label} off its knob`}>
                <button
                  className={styles.drop}
                  onClick={() => midi.clearBinding(s.key)}
                  aria-label={`unbind ${s.label}`}
                >
                  ×
                </button>
              </Tip>
            </div>
          )
        })}
      </div>
      <button className={styles.danger} onClick={() => midi.clearAll()}>
        clear all {bound.length} bindings
      </button>
    </>
  )
}

// The pads. They bind by being hit rather than by arming a control, so every
// voice is listed whether it has a pad or not: the ⚟ on a row waits for one pad
// and leaves the other five alone, which is what a single wrong hat pad wants.
// Nothing learned at all is the ordinary case — channel 10 is General MIDI's
// drum channel and reaches the kit with nothing set up.
function Pads() {
  const pads = useStoreValue(midi.pads)
  const bound = useStoreValue(midi.padBindings)
  const learn = useStoreValue(midi.padLearn)
  const armed = useStoreValue(midi.armedPad)
  const learned = VOICE_KEYS.filter(k => bound[k] !== undefined)
  if (!pads) return null
  return (
    <>
      <div className={styles.row}>
        {learn === null ? (
          <Tip text="hit a pad for each of the kit's six voices in turn. For a pad bank that isn't on channel 10, or isn't General MIDI — the ones that are need none of this. Replaces every pad you have; the ⚟ on a row moves one">
            <button className={styles.btn} onClick={() => midi.learnPads()}>
              learn pads
            </button>
          </Tip>
        ) : (
          <button className={styles.btn} onClick={() => midi.stopPadLearn()}>
            stop learning — keep the {learn.done} bound so far
          </button>
        )}
        {learned.length === 0 ? (
          <span className={styles.quiet}>
            pads on channel {GM_CHANNEL + 1} play the kit by General MIDI
          </span>
        ) : null}
      </div>
      <div className={styles.list}>
        {VOICE_KEYS.map(key => {
          const p = bound[key]
          const mine = armed === key
          return (
            <div key={key} className={styles.bound}>
              <span className={mine ? styles.strandedName : styles.boundName}>
                {voiceLabel(key)}
              </span>
              <Tip
                text={
                  mine
                    ? `hit the pad you want the ${voiceLabel(key)} on — esc to cancel`
                    : `put the ${voiceLabel(key)} on one pad, leaving the other five where they are`
                }
              >
                <button
                  className={mine ? styles.modeOn : styles.mode}
                  onClick={() => midi.armPad(mine ? null : key)}
                  aria-label={`bind the ${voiceLabel(key)} to a pad`}
                >
                  ⚟
                </button>
              </Tip>
              <span className={p === undefined ? styles.quiet : styles.cc}>
                {p === undefined
                  ? `GM ch${GM_CHANNEL + 1}`
                  : `${noteName(p.note)}${p.channel === 0 ? '' : ` ch${p.channel + 1}`}`}
              </span>
              {p === undefined ? null : (
                <Tip text={`take the ${voiceLabel(key)} off its pad`}>
                  <button
                    className={styles.drop}
                    onClick={() => midi.clearPad(key)}
                    aria-label={`unbind the ${voiceLabel(key)} pad`}
                  >
                    ×
                  </button>
                </Tip>
              )}
            </div>
          )
        })}
      </div>
      {learned.length === 0 ? null : (
        <button className={styles.danger} onClick={() => midi.clearPads()}>
          clear {learned.length} pad{learned.length === 1 ? '' : 's'} — back to
          General MIDI
        </button>
      )}
    </>
  )
}

// What the wire is actually carrying. A controller that does nothing is either
// silent or misread, and only the raw bytes tell those apart.
function Wire() {
  const traffic = useStoreValue(midi.traffic)
  const debug = useStoreValue(midi.debug)
  const notes = useStoreValue(midi.notes)
  const pads = useStoreValue(midi.pads)
  const running = useStoreValue(engine.running)
  const level = useControlValue('drumLevel')
  return (
    <>
      {/* Notes reach the chip through the audio engine, and a suspended engine
          drops them without a sound or a word. Nothing else on the board says
          so, because everything else is reached by a click that would have
          started it. */}
      {(notes || pads) && !running ? (
        <div className={styles.waiting}>
          the audio engine is asleep — MIDI alone can’t wake it. Click the page
          once, or press a key, and the notes will sound
        </div>
      ) : null}
      {/* Level is the switch that decides the kit is there at all, and a pad
          reaching a kit that is turned down is a dead pad with a busy wire —
          the same silence as a pad nothing has bound. */}
      {traffic?.voice !== undefined && level === 0 ? (
        <div className={styles.waiting}>
          pads are striking the kit, but its Level is at zero — bring it up and
          they will sound
        </div>
      ) : null}
      {/* This toggle starts on, so the press that looks like switching it on is
          the press that switched it off — and the keybed goes quiet with the
          wire still visibly busy. */}
      {!notes &&
      traffic?.voice === undefined &&
      traffic?.text.startsWith('note') === true ? (
        <div className={styles.waiting}>
          keys are arriving but “notes play the keys” is off — it starts on, so
          a press turns it off
        </div>
      ) : null}
      <div className={styles.row}>
        <span className={traffic === null ? styles.quiet : styles.wire}>
          {traffic === null
            ? 'nothing on the wire yet — move a knob or press a key'
            : `${traffic.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')} · ${traffic.text}${traffic.voice === undefined ? '' : ` → ${traffic.voice}`}`}
        </span>
        {traffic === null ? null : (
          <span className={styles.quiet}>
            {traffic.count} msg{traffic.count === 1 ? '' : 's'}
            {traffic.port === '' ? '' : ` · ${traffic.port}`}
          </span>
        )}
        <Tip text="also print every message to the browser console, which keeps a scrollback the one-line readout cannot">
          <button
            className={debug ? styles.toggleOn : styles.toggle}
            onClick={() => midi.setDebug(!debug)}
          >
            log to console
          </button>
        </Tip>
      </div>
    </>
  )
}

function Wired() {
  const armed = useStoreValue(midi.armed)
  const learn = useStoreValue(midi.learn)
  const bpm = useStoreValue(midi.bpm)
  const notes = useStoreValue(midi.notes)
  const pads = useStoreValue(midi.pads)
  const padLearn = useStoreValue(midi.padLearn)
  const armedPad = useStoreValue(midi.armedPad)
  const clockLock = useStoreValue(midi.clockLock)
  const lights = useStoreValue(midi.lights)
  const stranded = Object.keys(useStoreValue(midi.pickups)).length
  const [deviceName, setDeviceName] = useState(DEVICE_PROFILES[0]?.name ?? '')
  const [encoders, setEncoders] = useState(false)
  const device: DeviceProfile | undefined =
    DEVICE_PROFILES.find(d => d.name === deviceName) ?? DEVICE_PROFILES[0]

  // Both ways of binding leave the board waiting on a knob, and a hand that has
  // changed its mind wants out without touching the controller.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      midi.arm(null)
      midi.stopLearn()
      midi.stopPadLearn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hint =
    armedPad !== null
      ? `hit a pad to take ${voiceLabel(armedPad)} — esc to cancel`
      : padLearn !== null
        ? `hit the pad for ${padLearn.next === null ? 'the kit' : voiceLabel(padLearn.next)} — ${padLearn.done}/${padLearn.total} bound, esc to stop`
        : learn !== null
          ? `turn a knob${learn.next === null ? '' : ` for ${label(learn.next)}`} — ${learn.done}/${learn.total} bound, esc to stop`
          : armed !== null
            ? `move a knob to take ${label(armed)} — esc to cancel`
            : // A preset or a roll strands every bound knob at once, and only
              // the open stage shows its own amber marks — so the count belongs
              // here, where every binding is listed whatever stage it lives on.
              stranded > 0
              ? `${stranded} knob${stranded === 1 ? '' : 's'} out of step with the board — sweep each through its value to pick it up`
              : 'press ⚟ on any control, then move a knob to bind it'

  return (
    <>
      <div
        className={
          armed || learn || padLearn || armedPad || stranded > 0
            ? styles.waiting
            : styles.hint
        }
      >
        {hint}
      </div>

      {learn === null ? (
        <div className={styles.row}>
          <select
            className={styles.select}
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
          >
            {DEVICE_PROFILES.map(d => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <Tip text="bind this device's knobs by CC number, in order: the mixes and levels first, then the rest down the signal path. Replaces every binding you have">
            <button
              className={styles.btn}
              disabled={device === undefined}
              onClick={() => device && midi.autoMap(device)}
            >
              auto-map{' '}
              {device ? Math.min(device.ccs.length, AUTOMAP_KEYS.length) : 0}
            </button>
          </Tip>
          <Tip text="works on any controller whatever its CC numbers: sweep each knob once, left to right, and each takes the next control. Replaces every binding you have">
            <button
              className={styles.btn}
              onClick={() => midi.learnSequence(encoders)}
            >
              learn in order
            </button>
          </Tip>
          {/* A sweep can see which knob moved but not what kind of knob it is:
              an encoder's clicks and a fader's positions are the same bytes. */}
          <Tip text="the knobs being swept are endless encoders — they report turns, not positions. Applies to what learn in order binds">
            <button
              className={encoders ? styles.toggleOn : styles.toggle}
              onClick={() => setEncoders(!encoders)}
            >
              ↻ endless
            </button>
          </Tip>
        </div>
      ) : (
        <button className={styles.btn} onClick={() => midi.stopLearn()}>
          stop learning — keep the {learn.done} bound so far
        </button>
      )}

      <div className={styles.row}>
        <Tip text="notes play the toy chip's keyboard — the same voice the on-screen keys strike, and they light the same keys. The sustain pedal holds them, and all-notes-off lets them go, on any CC nothing else has taken">
          <button
            className={notes ? styles.toggleOn : styles.toggle}
            onClick={() => midi.setNotes(!notes)}
          >
            notes play the keys
          </button>
        </Tip>
        <Tip text="pads play the drum machine's voices. Channel 10 is General MIDI's drum channel and lands on the kit with nothing to set up; a pad bank sending anything else is what learn pads is for">
          <button
            className={pads ? styles.toggleOn : styles.toggle}
            onClick={() => midi.setPads(!pads)}
          >
            pads play the kit
          </button>
        </Tip>
        <Tip text="the drum machine's tempo follows the clock on the wire. It writes the BPM control, so the slider moves with it">
          <button
            className={clockLock ? styles.toggleOn : styles.toggle}
            onClick={() => midi.setClockLock(!clockLock)}
          >
            clock sets the tempo
          </button>
        </Tip>
        <Tip text="send each bound control's value back out, so a device with lit rings shows where the board is. A ring that follows a preset is a knob that was never stranded">
          <button
            className={lights ? styles.toggleOn : styles.toggle}
            onClick={() => midi.setLights(!lights)}
          >
            light the rings
          </button>
        </Tip>
        <span className={bpm === null ? styles.quiet : styles.clock}>
          {bpm === null ? '♩ no clock' : `♩ ${bpm.toFixed(1)}`}
        </span>
      </div>

      <Pads />
      <Wire />
      <Bindings />
    </>
  )
}

// The wire, folded away until there is one. Everything it offers is meaningless
// without a controller plugged in, and the panel's other sections are the board
// itself — so this opens on a press rather than taking a stage's worth of room
// from them.
export function MidiPanel() {
  const status = useStoreValue(midi.status)
  const bindings = useStoreValue(midi.bindings)
  const stranded = Object.keys(useStoreValue(midi.pickups)).length
  const count = Object.keys(bindings).length

  const summary =
    status === 'ready'
      ? count === 0
        ? 'connected'
        : // Folded away is where this panel usually sits, so a stranded knob has
          // to be visible from the outside or the header is telling a half-truth
          // about a board whose knobs have all gone inert.
          stranded > 0
          ? `${count} bound · ${stranded} waiting`
          : `${count} bound`
      : status === 'unsupported'
        ? 'not in this browser'
        : status === 'denied'
          ? 'refused'
          : status === 'requesting'
            ? 'asking…'
            : 'off — press to connect a controller'

  // A disclosure, which the browser already has: <details> keeps the open state,
  // draws its own marker and works from the keyboard, so none of that is written
  // here. Unconnected the summary wears a border, because folded away and with
  // nothing wired it is the only way to reach the wire at all.
  return (
    <details className={styles.panel}>
      <summary
        className={status === 'ready' ? styles.header : styles.headerCall}
      >
        <span className={styles.title}>midi</span>
        <span
          className={
            stranded > 0 && status === 'ready'
              ? styles.waitingTag
              : status === 'ready'
                ? styles.live
                : styles.quiet
          }
        >
          {summary}
        </span>
      </summary>
      {status === 'ready' ? (
        <Wired />
      ) : status === 'unsupported' ? (
        <div className={styles.hint}>
          this browser has no Web MIDI — Chrome and Edge do, Safari and Firefox
          don’t.
        </div>
      ) : (
        <div className={styles.row}>
          <button className={styles.btn} onClick={() => midi.enable()}>
            connect a controller
          </button>
          <span className={styles.hint}>
            {status === 'denied'
              ? 'the browser refused — allow MIDI for this site and try again'
              : 'the browser will ask once, then remember'}
          </span>
        </div>
      )}
    </details>
  )
}
