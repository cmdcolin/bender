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
const BLACK: Record<number, number> = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10, 6: 13, 7: 15 }

// The toy keyboard's keys: clickable, plus the computer keyboard (a s d f...).
export function Keys() {
  const [held, setHeld] = useState<Set<number>>(new Set())

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const note = KEY_MAP[e.key.toLowerCase()]
      if (note === undefined) return
      engine.noteOn(note)
      setHeld(h => new Set(h).add(note))
    }
    const up = (e: KeyboardEvent) => {
      const note = KEY_MAP[e.key.toLowerCase()]
      if (note === undefined) return
      engine.noteOff(note)
      setHeld(h => {
        const next = new Set(h)
        next.delete(note)
        return next
      })
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const press = (note: number) => {
    engine.noteOn(note)
    setHeld(h => new Set(h).add(note))
  }
  const release = (note: number) => {
    engine.noteOff(note)
    setHeld(h => {
      const next = new Set(h)
      next.delete(note)
      return next
    })
  }

  return (
    <div className={styles.keys}>
      {WHITE.map((note, i) => (
        <div key={note} className={styles.whiteWrap}>
          <button
            className={held.has(note) ? styles.whiteOn : styles.white}
            onPointerDown={() => press(note)}
            onPointerUp={() => release(note)}
            onPointerLeave={() => held.has(note) && release(note)}
          />
          {BLACK[i] !== undefined && (
            <button
              className={held.has(BLACK[i]!) ? styles.blackOn : styles.black}
              onPointerDown={e => {
                e.stopPropagation()
                press(BLACK[i]!)
              }}
              onPointerUp={() => release(BLACK[i]!)}
              onPointerLeave={() => held.has(BLACK[i]!) && release(BLACK[i]!)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
