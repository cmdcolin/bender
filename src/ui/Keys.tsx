import { useEffect, useState, type PointerEvent } from 'react'
import { engine } from '../engine/engine'
import { semitoneName } from '../notes'
import { useStoreValue } from './ControlsContext'
import { blackAbove, OCTAVES, pitch, TOP, WHITE_KEYS } from './keyboard'
import { RailLamp } from './RailLamp'
import styles from './Keys.module.css'

const KEY_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
}

// The letter each key answers to, drawn on the key itself. Cheap keyboards
// printed the note names on theirs, and it beats hunting for a hint under the
// panel — sixteen keys carry one, and the rest of the board is for the mouse or
// for the octave switch to bring under your hands.
const LETTER: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_MAP).map(([letter, note]) => [note, letter]),
)

// Who is holding a key down, and so what colour it is.
type Lit = 'hand' | 'chip' | 'dark'

const KEY_CLASS = {
  white: { dark: styles.white, hand: styles.whiteOn, chip: styles.whiteChip },
  black: { dark: styles.black, hand: styles.blackOn, chip: styles.blackChip },
}

// The toy keyboard's keys: clickable, plus the computer keyboard (a s d f...).
// Hold latches what you press, so both hands are free for the panel.
export function Keys() {
  // What was sent, not which key was pressed: the octave moves under your hand
  // and a note has to be let go at the pitch it went down at.
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [hold, setHold] = useState(false)
  const [octave, setOctave] = useState(0)
  const shift = octave * 12
  const at = (key: number) => pitch(key, shift)
  // Two lights on one board. What a hand is holding down — this one's pointer,
  // the letter keys, a controller — and what the chip is sounding on its own,
  // which is the ROM's tune, the backing under it, and whatever the kit's
  // trigger line strikes. Your own notes are in both, a meter apart, so yours
  // wins and the toy's is what is left.
  const keysDown = useStoreValue(engine.keysDown)
  const chipNotes = useStoreValue(engine.chipNotes)
  const isDown = (key: number) => held.has(at(key))
  const litBy = (key: number): Lit =>
    keysDown.has(at(key)) ? 'hand' : chipNotes.has(at(key)) ? 'chip' : 'dark'
  // A keybed reaches further than three octaves, and so does the tune when the
  // clock bend drags it off the board. A note played past either end would
  // otherwise light nothing at all and read as a dead wire.
  const playing = [...keysDown, ...chipNotes]
  const below = playing.some(s => s < at(0))
  const above = playing.some(s => s > at(TOP))

  const press = (key: number) => {
    const semitone = at(key)
    // Latched keys let go on a second press. What is latched is what is
    // sounding, not what this component remembers sending: panic clears the
    // board underneath it, and a key that is dark should strike, not unlatch.
    if (hold && keysDown.has(semitone)) {
      release(key, true)
      return
    }
    engine.noteOn(semitone)
    setHeld(h => new Set(h).add(semitone))
  }

  const release = (key: number, force = false) => {
    if (hold && !force) return
    engine.noteOff(at(key))
    setHeld(h => {
      const next = new Set(h)
      next.delete(at(key))
      return next
    })
  }

  const releaseAll = () => {
    for (const semitone of held) engine.noteOff(semitone)
    setHeld(new Set())
  }

  // Whatever is down went down at the old octave, and nothing is going to let go
  // of it once the keys have moved out from under it.
  const shiftTo = (next: number) => {
    releaseAll()
    setOctave(next)
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const pressed = e.key.toLowerCase()
      const step = pressed === 'z' ? -1 : pressed === 'x' ? 1 : 0
      if (step !== 0) {
        const next = octave + step
        if (OCTAVES.includes(next)) shiftTo(next)
        return
      }
      const note = KEY_MAP[pressed]
      if (note !== undefined) press(note)
    }
    const up = (e: KeyboardEvent) => {
      const note = KEY_MAP[e.key.toLowerCase()]
      if (note !== undefined) release(note)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  // A hand dragged across three octaves plays what it crosses. The capture a
  // touch hands to the key it started on would otherwise keep every event there,
  // so a glissando would come out as one note held down.
  const grab = (note: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    press(note)
  }
  const slideInto = (note: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.buttons && !hold) press(note)
  }

  const key = (note: number, black: boolean) => {
    const lit = litBy(note)
    return (
      <button
        className={KEY_CLASS[black ? 'black' : 'white'][lit]}
        aria-label={`key ${semitoneName(at(note))}`}
        aria-pressed={lit !== 'dark'}
        onPointerDown={e => {
          if (black) e.stopPropagation()
          grab(note)(e)
        }}
        onPointerEnter={slideInto(note)}
        onPointerUp={() => release(note)}
        onPointerLeave={() => isDown(note) && release(note)}
      >
        {LETTER[note] && (
          <span className={black ? styles.blackLetter : styles.letter}>
            {LETTER[note]}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className={styles.row}>
      <div className={styles.keys}>
        {below && <span className={styles.offLow}>◂</span>}
        {above && <span className={styles.offHigh}>▸</span>}
        {WHITE_KEYS.map(note => {
          const black = blackAbove(note)
          return (
            <div key={note} className={styles.whiteWrap}>
              {key(note, false)}
              {black !== undefined && key(black, true)}
            </div>
          )
        })}
      </div>
      <div className={styles.switches}>
        {/* Beside the keys because the keys are what it explains: a note that
            comes out flat, quiet or not at all is this number falling. */}
        <RailLamp />
        <button
          className={hold ? styles.holdOn : styles.hold}
          onClick={() => {
            if (hold) releaseAll()
            setHold(!hold)
          }}
          title="latch keys on — press a held key again to let it go"
        >
          hold
        </button>
        <span className={styles.octaves}>
          {OCTAVES.map(o => (
            <button
              key={o}
              className={o === octave ? styles.octaveOn : styles.octave}
              onClick={() => shiftTo(o)}
              title={`move the whole board ${o === 0 ? 'back where the toy has it' : `${Math.abs(o)} octave${Math.abs(o) === 1 ? '' : 's'} ${o < 0 ? 'down' : 'up'}`} — z and x do the same`}
            >
              {o > 0 ? `+${o}` : o}
            </button>
          ))}
        </span>
      </div>
    </div>
  )
}
