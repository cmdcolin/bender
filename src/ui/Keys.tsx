import { useEffect, useState, type PointerEvent } from 'react'
import { engine } from '../engine/engine'
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

// Three octaves on the board. The chip's divider reaches either side of them, so
// the octave switch moves the whole keyboard rather than scrolling it: what is
// drawn is where your hands are, not everything the chip can strike.
const OCTAVES_DRAWN = 3
const TOP = OCTAVES_DRAWN * 12
const WHITE_PC = [0, 2, 4, 5, 7, 9, 11]
// The pitch classes with a black key above them. Where there is none, two whites
// sit side by side — the pattern that makes a keyboard readable at a glance, and
// the reason the board closes on a tonic with nothing over it.
const BLACK_PC = new Set([0, 2, 5, 7, 9])

const WHITE_KEYS = [
  ...Array.from({ length: OCTAVES_DRAWN }, (_, o) =>
    WHITE_PC.map(pc => pc + 12 * o),
  ).flat(),
  TOP,
]

const blackAbove = (semitone: number) =>
  semitone < TOP && BLACK_PC.has(semitone % 12) ? semitone + 1 : undefined

const OCTAVES = [-2, -1, 0, 1, 2]

// The toy keyboard's keys: clickable, plus the computer keyboard (a s d f...).
// Hold latches what you press, so both hands are free for the panel.
export function Keys() {
  // What was sent, not which key was pressed: the octave moves under your hand
  // and a note has to be let go at the pitch it went down at.
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [hold, setHold] = useState(false)
  const [octave, setOctave] = useState(0)
  const shift = octave * 12
  const isHeld = (note: number) => held.has(note + shift)

  const press = (note: number) => {
    const semitone = note + shift
    if (hold && held.has(semitone)) {
      release(note, true)
      return
    }
    engine.noteOn(semitone)
    setHeld(h => new Set(h).add(semitone))
  }

  const release = (note: number, force = false) => {
    if (hold && !force) return
    engine.noteOff(note + shift)
    setHeld(h => {
      const next = new Set(h)
      next.delete(note + shift)
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

  const key = (note: number, black: boolean) => (
    <button
      className={
        black
          ? isHeld(note)
            ? styles.blackOn
            : styles.black
          : isHeld(note)
            ? styles.whiteOn
            : styles.white
      }
      aria-label={`key ${note + shift}`}
      onPointerDown={e => {
        if (black) e.stopPropagation()
        grab(note)(e)
      }}
      onPointerEnter={slideInto(note)}
      onPointerUp={() => release(note)}
      onPointerLeave={() => isHeld(note) && release(note)}
    >
      {LETTER[note] && (
        <span className={black ? styles.blackLetter : styles.letter}>
          {LETTER[note]}
        </span>
      )}
    </button>
  )

  return (
    <div className={styles.row}>
      <div className={styles.keys}>
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
