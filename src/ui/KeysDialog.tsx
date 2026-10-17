import { useState, type CSSProperties, type KeyboardEvent } from 'react'

import { semitoneName } from '../notes.ts'
import { useStoreValue } from './ControlsContext.ts'
import { pitch } from './keyboard.ts'
import {
  DEFAULT_KEYMAP,
  KEY_ROWS,
  keymap,
  moveKey,
  resetKeymap,
  roleOf,
  type KeyRole,
} from './keymap.ts'
import styles from './KeysDialog.module.css'

const INDENTS = [0, 1, 3]

const describe = (role: KeyRole): { main: string; sub?: string } => {
  if (role.kind === 'note') return { main: semitoneName(pitch(role.index, 0)) }
  if (role.kind === 'octave')
    return {
      main: role.step < 0 ? 'oct −' : 'oct +',
      sub: role.step < 0 ? 'let go' : 'redeal',
    }
  return { main: role.name }
}

const place = (row: number, i: number): CSSProperties => {
  const vars: Record<`--${string}`, number> = {
    '--row': row + 1,
    '--col': INDENTS[row]! + 4 * i + 1,
  }
  return vars
}

export function KeysDialog({ onClose }: { onClose: () => void }) {
  const map = useStoreValue(keymap)
  const [picked, setPicked] = useState<string | null>(null)
  const pickedRole = picked === null ? undefined : roleOf(map, picked)
  const remapped = map.some((k, i) => k !== DEFAULT_KEYMAP[i])

  const drop = (to: string) => {
    if (picked !== null) moveKey(picked, to)
    setPicked(null)
  }

  const press = (letter: string) => {
    if (picked === null) {
      if (roleOf(map, letter)) setPicked(letter)
    } else if (picked === letter) setPicked(null)
    else drop(letter)
  }

  // The keys the board listens to must not answer while one is being chosen.
  const keyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (picked === null || e.metaKey || e.ctrlKey || e.altKey) return
    const letter = e.key.toLowerCase()
    if (KEY_ROWS.some(row => row.includes(letter)) && letter.length === 1) {
      e.preventDefault()
      drop(letter)
    }
  }

  return (
    <dialog
      ref={el => {
        if (el && !el.open) {
          el.showModal()
          el.querySelector<HTMLElement>('[data-done]')?.focus()
        }
      }}
      onCancel={e => {
        e.preventDefault()
        if (picked === null) onClose()
        else setPicked(null)
      }}
      onKeyDown={keyDown}
      onKeyUp={e => e.stopPropagation()}
      aria-label="computer keys"
      className={styles.card}
    >
      <p className={styles.title}>Computer keys</p>
      <p className={styles.says}>
        {pickedRole
          ? `Press the key that should be ${describe(pickedRole).main}, or click it. Esc to cancel.`
          : 'Click a key, then press or click where it should go. The key already there takes its place.'}
      </p>
      <div className={styles.keys}>
        {KEY_ROWS.map((letters, row) =>
          letters.split('').map((letter, i) => {
            const role = roleOf(map, letter)
            const what = role ? describe(role) : null
            const cls = [
              role ? styles[role.kind] : styles.blank,
              picked === letter ? styles.picked : '',
            ].join(' ')
            return (
              <button
                key={letter}
                className={cls}
                style={place(row, i)}
                aria-pressed={picked === letter}
                aria-label={
                  what ? `${letter}: ${what.main}` : `${letter}: unused`
                }
                onClick={() => press(letter)}
              >
                <span className={styles.letter}>{letter}</span>
                {what && <span className={styles.main}>{what.main}</span>}
                {what?.sub && <span className={styles.sub}>{what.sub}</span>}
              </button>
            )
          }),
        )}
      </div>
      <ul className={styles.legend}>
        <li>
          <b>note</b>: plays that note on the bed the letters go to, and fires
          the matching bend key
        </li>
        <li>
          <b>oct</b>: moves the keybed an octave; with the bend keys on, lets go
          and redeals
        </li>
        <li>
          <b>throw</b>: held for the effect, whatever else the letters do
        </li>
      </ul>
      <div className={styles.actions}>
        <button
          className={styles.quiet}
          disabled={!remapped}
          onClick={() => {
            resetKeymap()
            setPicked(null)
          }}
        >
          reset
        </button>
        <button className={styles.done} data-done onClick={onClose}>
          done
        </button>
      </div>
    </dialog>
  )
}
