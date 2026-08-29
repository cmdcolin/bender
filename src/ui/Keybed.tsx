import { useEffect, useState, type PointerEvent, type ReactNode } from 'react'
import { engine } from '../engine/engine'
import type { NoteDest } from '../engine/messages'
import { semitoneName } from '../notes'
import { useStoreValue } from './ControlsContext'
import { blackAbove, OCTAVES, pitch, TOP, WHITE_KEYS } from './keyboard'
import { letterKeys } from './letters'
import styles from './Keybed.module.css'
import { Tip } from './Tip'

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

const omitFrom = (set: Set<number>, value: number) => {
  const next = new Set(set)
  next.delete(value)
  return next
}

// Who is holding a key down, and so what colour it is.
type Lit = 'hand' | 'chip' | 'dark'

const KEY_CLASS = {
  white: { dark: styles.white, hand: styles.whiteOn, chip: styles.whiteChip },
  black: { dark: styles.black, hand: styles.blackOn, chip: styles.blackChip },
}

interface Props {
  /** Which synthesiser this bed's keys are wired to. */
  dest: NoteDest
  /** What the bed is called, for anything reading the page rather than looking
      at it: two keybeds drawn the same way are two lists of identical keys. */
  label: string
  /** The case, for a board that is not moulded plastic. */
  caseClass?: string
  /** What the deck carries besides the switches: a badge, a speaker, a lamp. */
  badge?: ReactNode
  /** Switches that belong to this machine, ahead of the ones every bed has. */
  extras?: ReactNode
  tail?: ReactNode
}

// A keybed: clickable, and the computer's letter keys wherever they are wired.
// Hold latches what you press, so both hands are free for the panel.
export function Keybed({ dest, label, caseClass, badge, extras, tail }: Props) {
  // What was sent, not which key was pressed: the octave moves under your hand
  // and a note has to be let go at the pitch it went down at.
  const [held, setHeld] = useState<Set<number>>(new Set())
  // Notes alt-click has pinned down, one at a time. The hold switch latches
  // everything you touch after it; this holds a drone under both hands while the
  // rest of the board still plays and lets go the way keys normally do.
  const [latched, setLatched] = useState<Set<number>>(new Set())
  const [hold, setHold] = useState(false)
  const [octave, setOctave] = useState(0)
  const shift = octave * 12
  const at = (key: number) => pitch(key, shift)
  // Two lights on one board. What a hand is holding down — this one's pointer,
  // the letter keys, a controller — and what the chip is sounding on its own,
  // which for the toy is the ROM's tune and the backing under it, and for the
  // FM chip is the toy's gate and the kit's trigger lines. Your own notes are
  // in both, a meter apart, so yours wins and the chip's is what is left.
  const keysDown = useStoreValue(
    dest === 'fm' ? engine.fmKeysDown : engine.keysDown,
  )
  const chipNotes = useStoreValue(
    dest === 'fm' ? engine.fmNotes : engine.chipNotes,
  )
  const owns = useStoreValue(letterKeys) === dest
  const isDown = (key: number) => held.has(at(key))
  const litBy = (key: number): Lit =>
    keysDown.has(at(key)) ? 'hand' : chipNotes.has(at(key)) ? 'chip' : 'dark'
  // A keybed reaches further than three octaves, and so does the tune when the
  // clock bend drags it off the board. A note played past either end would
  // otherwise light nothing at all and read as a dead wire.
  const playing = [...keysDown, ...chipNotes]
  const below = playing.some(s => s < at(0))
  const above = playing.some(s => s > at(TOP))

  // Whether letting go of a key lets go of the note.
  const sticky = (semitone: number) => hold || latched.has(semitone)

  const press = (key: number, latch = false) => {
    const semitone = at(key)
    // A press on a note already pinned down is what lets it go — by the hold
    // switch or by alt, either way, since a key you can see lit and cannot turn
    // off is a stuck note however it got that way. What counts as down is what
    // is sounding rather than what this component remembers sending: panic
    // clears the board underneath it, and a dark key should strike.
    if (keysDown.has(semitone) && (latch || sticky(semitone))) {
      release(key, true)
      return
    }
    engine.noteOn(semitone, 1, dest)
    setHeld(h => new Set(h).add(semitone))
    if (latch) setLatched(l => new Set(l).add(semitone))
  }

  const release = (key: number, force = false) => {
    const semitone = at(key)
    if (!force && sticky(semitone)) return
    engine.noteOff(semitone, dest)
    setHeld(h => omitFrom(h, semitone))
    if (latched.has(semitone)) setLatched(l => omitFrom(l, semitone))
  }

  const releaseAll = () => {
    for (const semitone of held) engine.noteOff(semitone, dest)
    setHeld(new Set())
    setLatched(new Set())
  }

  // What a hand was holding, when the hand goes away: the window loses focus
  // mid-press and the key-up lands wherever the focus went, so without this a
  // note is held for ever by a key nobody is pressing any more. What was pinned
  // down on purpose stays down — that is what pinning it was for.
  const releaseLoose = () => {
    const loose = [...held].filter(semitone => !sticky(semitone))
    if (loose.length === 0) return
    for (const semitone of loose) engine.noteOff(semitone, dest)
    setHeld(h => {
      const next = new Set(h)
      for (const semitone of loose) next.delete(semitone)
      return next
    })
  }

  // Whatever is down went down at the old octave, and nothing is going to let go
  // of it once the keys have moved out from under it.
  const shiftTo = (next: number) => {
    releaseAll()
    setOctave(next)
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!owns || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
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
      if (!owns) return
      const note = KEY_MAP[e.key.toLowerCase()]
      if (note !== undefined) release(note)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', releaseLoose)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', releaseLoose)
    }
  })

  // The letters go to one bed at a time, and what this one is holding goes with
  // them: a note struck by a letter key whose wire has just moved has nothing
  // left that can let it go.
  useEffect(() => {
    if (!owns) releaseLoose()
  }, [owns])

  // A hand dragged across three octaves plays what it crosses. The capture a
  // touch hands to the key it started on would otherwise keep every event there,
  // so a glissando would come out as one note held down.
  const grab = (note: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    press(note, e.altKey)
  }
  const slideInto = (note: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.buttons && !hold) press(note)
  }
  // A pointer taken away rather than lifted: a window manager claiming alt-drag
  // to move the window, a touch turning into a scroll, the system stepping in.
  // No pointer-up follows any of them, so this is the last word on the note.
  const cancel = (note: number) => () => release(note)

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
        onPointerCancel={cancel(note)}
      >
        {owns && LETTER[note] && (
          <span className={black ? styles.blackLetter : styles.letter}>
            {LETTER[note]}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className={styles.row}>
      <div
        className={`${styles.body} ${caseClass ?? ''}`}
        role="group"
        aria-label={label}
      >
        <div className={styles.deck}>
          {badge}
          <div className={styles.switches}>
            {extras}
            <Tip
              text={
                owns
                  ? 'the computer keyboard is wired to this bed — a s d f play it, z and x move the octave'
                  : 'wire the computer keyboard to this bed: a s d f play it, z and x move the octave. There is one keyboard in front of the panel and two beds on it, so it plays whichever is switched on'
              }
            >
              <button
                className={owns ? styles.keysOn : styles.keysOff}
                aria-pressed={owns}
                onClick={() => letterKeys.set(dest)}
              >
                keys
              </button>
            </Tip>
            <Tip text="Latch keys on — press a held key again to let it go. Alt-click a single key to pin just that one down.">
              <button
                className={hold ? styles.holdOn : styles.hold}
                aria-pressed={hold}
                onClick={() => {
                  if (hold) releaseAll()
                  setHold(!hold)
                }}
              >
                hold
              </button>
            </Tip>
            <span className={styles.stamp}>octave</span>
            <span className={styles.octaves}>
              {OCTAVES.map(o => (
                <Tip
                  key={o}
                  text={`move the whole board ${o === 0 ? 'back where the toy has it' : `${Math.abs(o)} octave${Math.abs(o) === 1 ? '' : 's'} ${o < 0 ? 'down' : 'up'}`}${owns ? ' — z and x do the same' : ''}`}
                >
                  <button
                    className={o === octave ? styles.octaveOn : styles.octave}
                    onClick={() => shiftTo(o)}
                  >
                    {o > 0 ? `+${o}` : o}
                  </button>
                </Tip>
              ))}
            </span>
            {tail}
          </div>
        </div>
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
      </div>
    </div>
  )
}
