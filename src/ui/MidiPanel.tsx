import { useEffect, useState } from 'react'
import { useStoreValue } from './ControlsContext'
import { ALL_SLIDERS, groupFor, sliderFor } from './controls'
import { AUTOMAP_KEYS, DEVICE_PROFILES, midi, type DeviceProfile } from './midi'
import styles from './MidiPanel.module.css'

function label(key: Parameters<typeof sliderFor>[0]): string {
  return `${groupFor(key)} · ${sliderFor(key).label}`
}

function Bindings() {
  const bindings = useStoreValue(midi.bindings)
  // Walked in signal-path order rather than bind order, so a row doesn't move
  // under the pointer as bindings come and go.
  const bound = ALL_SLIDERS.filter(s => bindings[s.key] !== undefined)
  if (bound.length === 0) return null
  return (
    <>
      <div className={styles.list}>
        {bound.map(s => {
          const b = bindings[s.key]
          return b === undefined ? null : (
            <div key={s.key} className={styles.bound}>
              <span className={styles.boundName}>{label(s.key)}</span>
              <span className={styles.cc}>
                CC{b.controller}
                {b.channel === 0 ? '' : ` ch${b.channel + 1}`}
              </span>
              <button
                className={styles.drop}
                onClick={() => midi.clearBinding(s.key)}
                aria-label={`unbind ${s.label}`}
                title={`take ${s.label} off its knob`}
              >
                ×
              </button>
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

function Wired() {
  const armed = useStoreValue(midi.armed)
  const learn = useStoreValue(midi.learn)
  const bpm = useStoreValue(midi.bpm)
  const notes = useStoreValue(midi.notes)
  const clockLock = useStoreValue(midi.clockLock)
  const [deviceName, setDeviceName] = useState(DEVICE_PROFILES[0]?.name ?? '')
  const device: DeviceProfile | undefined =
    DEVICE_PROFILES.find(d => d.name === deviceName) ?? DEVICE_PROFILES[0]

  // Both ways of binding leave the board waiting on a knob, and a hand that has
  // changed its mind wants out without touching the controller.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      midi.arm(null)
      midi.stopLearn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hint =
    learn !== null
      ? `turn a knob${learn.next === null ? '' : ` for ${label(learn.next)}`} — ${learn.done}/${learn.total} bound, esc to stop`
      : armed !== null
        ? `move a knob to take ${label(armed)} — esc to cancel`
        : 'press ⚟ on any control, then move a knob to bind it'

  return (
    <>
      <div className={armed || learn ? styles.waiting : styles.hint}>
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
          <button
            className={styles.btn}
            disabled={device === undefined}
            onClick={() => device && midi.autoMap(device)}
            title={`bind this device's knobs by CC number, in order: the mixes and levels first, then the rest down the signal path. Replaces every binding you have`}
          >
            auto-map{' '}
            {device ? Math.min(device.ccs.length, AUTOMAP_KEYS.length) : 0}
          </button>
          <button
            className={styles.btn}
            onClick={() => midi.learnSequence()}
            title="works on any controller whatever its CC numbers: sweep each knob once, left to right, and each takes the next control. Replaces every binding you have"
          >
            learn in order
          </button>
        </div>
      ) : (
        <button className={styles.btn} onClick={() => midi.stopLearn()}>
          stop learning — keep the {learn.done} bound so far
        </button>
      )}

      <div className={styles.row}>
        <button
          className={notes ? styles.toggleOn : styles.toggle}
          onClick={() => midi.setNotes(!notes)}
          title="notes play the toy chip's keyboard, with A3 at middle C's octave — the same voice the on-screen keys strike"
        >
          notes play the keys
        </button>
        <button
          className={clockLock ? styles.toggleOn : styles.toggle}
          onClick={() => midi.setClockLock(!clockLock)}
          title="the drum machine's tempo follows the clock on the wire. It writes the BPM control, so the slider moves with it"
        >
          clock sets the tempo
        </button>
        <span className={bpm === null ? styles.quiet : styles.clock}>
          {bpm === null ? '♩ no clock' : `♩ ${bpm.toFixed(1)}`}
        </span>
      </div>

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
  const [open, setOpen] = useState(false)
  const count = Object.keys(bindings).length

  const summary =
    status === 'ready'
      ? count === 0
        ? 'connected'
        : `${count} bound`
      : status === 'unsupported'
        ? 'not in this browser'
        : status === 'denied'
          ? 'refused'
          : status === 'requesting'
            ? 'asking…'
            : 'off'

  return (
    <div className={styles.panel}>
      <button
        className={styles.header}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.title}>midi</span>
        <span className={status === 'ready' ? styles.live : styles.quiet}>
          {summary}
        </span>
      </button>
      {!open ? null : status === 'ready' ? (
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
    </div>
  )
}
