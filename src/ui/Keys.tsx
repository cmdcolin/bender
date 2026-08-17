import { useEffect, useState } from 'react'
import { engine } from '../engine/engine'
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

const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14]
const BLACK: Record<number, number> = {
  0: 1,
  1: 3,
  3: 6,
  4: 8,
  5: 10,
  6: 13,
  7: 15,
}

// Sixteen keys is what the toy had; where they sit on the chip's divider is not.
// An octave either way covers a bass line and the top of the counter, which is
// where the narrow tones run out of ticks and widen back into squares.
const OCTAVES = [-1, 0, 1, 2]

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
      const key = e.key.toLowerCase()
      const step = key === 'z' ? -1 : key === 'x' ? 1 : 0
      if (step !== 0) {
        const next = octave + step
        if (OCTAVES.includes(next)) shiftTo(next)
        return
      }
      const note = KEY_MAP[key]
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

  return (
    <div className={styles.row}>
      <div className={styles.keys}>
        {WHITE.map((note, i) => (
          <div key={note} className={styles.whiteWrap}>
            <button
              className={isHeld(note) ? styles.whiteOn : styles.white}
              onPointerDown={() => press(note)}
              onPointerUp={() => release(note)}
              onPointerLeave={() => isHeld(note) && release(note)}
            />
            {BLACK[i] !== undefined && (
              <button
                className={isHeld(BLACK[i]!) ? styles.blackOn : styles.black}
                onPointerDown={e => {
                  e.stopPropagation()
                  press(BLACK[i]!)
                }}
                onPointerUp={() => release(BLACK[i]!)}
                onPointerLeave={() => isHeld(BLACK[i]!) && release(BLACK[i]!)}
              />
            )}
          </div>
        ))}
      </div>
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
            title={`move the keys ${o === 0 ? 'back where the toy has them' : `${Math.abs(o)} octave${Math.abs(o) === 1 ? '' : 's'} ${o < 0 ? 'down' : 'up'}`} — z and x do the same`}
          >
            {o > 0 ? `+${o}` : o}
          </button>
        ))}
      </span>
    </div>
  )
}
