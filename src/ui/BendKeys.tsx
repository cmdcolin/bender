import { useEffect, useState, type CSSProperties } from 'react'

import { engine } from '../engine/engine.ts'
import { HEATS, type BendKey } from './bendDeal.ts'
import styles from './BendKeys.module.css'
import {
  bendDeal,
  bendHeat,
  bendName,
  bendStepName,
  bendSwell,
  holdBend,
  letGoAllBends,
  letGoBend,
  lettersWantBends,
  REDEAL_BARS,
  redealAll,
  redealBendKeys,
  redealEvery,
  rememberLetters,
  runBendClock,
  setBendHeat,
  setBendSwell,
  setRedealEvery,
} from './bendKeys.ts'
import { useStoreValue } from './ControlsContext.ts'
import { isTyping } from './isTyping.ts'
import { letterKeys } from './letters.ts'
import { pressThrow, releaseThrow, useThrowKeys } from './throwKeys.ts'
import { throwForKey } from './throws.ts'
import { Tip } from './Tip.tsx'

import type { MorphSeconds } from './morph.ts'

const omitFrom = (set: Set<string>, value: string) => {
  const next = new Set(set)
  next.delete(value)
  return next
}

const setLetters = (bends: boolean) => {
  letterKeys.set(bends ? 'bends' : 'toy')
  rememberLetters(bends)
}

const HEAT_TIP = {
  tame: 'one control a key',
  wild: 'one to three controls a key, now and then a pair that fight',
  wreck:
    'three controls a key, and a third of the keys solder a bay wire or a bend into the chain on top',
}

// The three rows of letters as they sit on a keyboard, each indented by its
// stagger in quarters of a key.
const ROWS = [
  { letters: 'qwertyuiop', indent: 0 },
  { letters: 'asdfghjkl', indent: 1 },
  { letters: 'zxcvbnm,', indent: 3 },
]

function place(row: number, indent: number, i: number): CSSProperties {
  const vars: Record<`--${string}`, number> = {
    '--row': row + 1,
    '--col': indent + 4 * i + 1,
  }
  return vars
}

// Sixteen throws the dice dealt on the top two rows of letters, the six chosen
// throws on the bottom row, and z and x to let go and redeal, laid out where
// the fingers find them. Letters reach the bends only once the toggle in the
// bar sends them here instead of to a keybed; the bottom row always throws.
export function BendKeys({ morphSeconds }: { morphSeconds: MorphSeconds }) {
  const deal = useStoreValue(bendDeal)
  const held = useStoreValue(engine.held)
  const on = useStoreValue(letterKeys) === 'bends'
  const heat = useStoreValue(bendHeat)
  const swell = useStoreValue(bendSwell)
  const every = useStoreValue(redealEvery)
  const [latched, setLatched] = useState<Set<string>>(new Set())
  // A swell with the morph set to instant still swells: the switch is the ask.
  const seconds = swell ? Math.max(morphSeconds, 1) : 0

  useEffect(() => {
    if (bendDeal.get().length === 0) redealBendKeys(engine.controls.get())
    if (lettersWantBends(window.location.search)) letterKeys.set('bends')
  }, [])

  useThrowKeys()

  const letGo = (k: BendKey) => {
    letGoBend(bendName(k.letter), seconds)
    if (latched.has(k.letter)) setLatched(l => omitFrom(l, k.letter))
  }

  // A press on a key already pinned down is what lets it go, however it got
  // pinned: a key you can see lit and cannot turn off is a stuck key.
  const press = (k: BendKey, latch: boolean) => {
    if (latched.has(k.letter)) {
      letGo(k)
      return
    }
    holdBend(bendName(k.letter), k, seconds)
    if (latch) setLatched(l => new Set(l).add(k.letter))
  }

  const release = (k: BendKey) => {
    if (!latched.has(k.letter)) letGoBend(bendName(k.letter), seconds)
  }

  const letGoAll = () => {
    letGoAllBends()
    setLatched(new Set())
  }

  // The kit's bar clock, which fires the bend row and the redeal counter. Once
  // for the board's life: a hold it has out must not let go because a pad lit.
  useEffect(runBendClock, [])

  // A new hand, from the clock or from x, has nothing pinned in it.
  useEffect(() => bendDeal.subscribe(() => setLatched(new Set())), [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!on || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      const pressed = e.key.toLowerCase()
      if (pressed === 'z') letGoAll()
      else if (pressed === 'x') redealAll()
      else {
        const k = deal.find(d => d.letter === pressed)
        if (k) press(k, e.shiftKey)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (!on) return
      const k = deal.find(d => d.letter === e.key.toLowerCase())
      if (k) release(k)
    }
    // The window losing focus loses the key-up with it, so what a hand was
    // holding lets go; what it pinned down stays pinned.
    const blur = () => {
      for (const k of deal) release(k)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  })

  const keyFor = (letter: string, style: CSSProperties) => {
    const k = deal.find(d => d.letter === letter)
    if (k) {
      const lit =
        held.has(bendName(k.letter)) || held.has(bendStepName(k.letter))
      return (
        <Tip key={letter} text={`${k.says}, while held. Shift pins it down.`}>
          <button
            className={`${lit ? styles.keyHeld : styles.key}${latched.has(letter) ? ` ${styles.pinned}` : ''}`}
            style={style}
            aria-pressed={lit}
            aria-label={`${letter}: ${k.stages.join(', ')}`}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              press(k, e.shiftKey)
            }}
            onPointerUp={() => release(k)}
            onPointerCancel={() => release(k)}
            onLostPointerCapture={() => release(k)}
          >
            <span className={on ? styles.letter : styles.letterOff}>
              {letter}
            </span>
            <span className={styles.what}>{k.stages.join(' · ')}</span>
          </button>
        </Tip>
      )
    }
    const t = throwForKey(letter)
    if (t)
      return (
        <Tip key={letter} text={`${t.blurb}, while held.`}>
          <button
            className={held.has(t.name) ? styles.keyHeld : styles.throwKey}
            style={style}
            aria-pressed={held.has(t.name)}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId)
              pressThrow(t)
            }}
            onPointerUp={() => releaseThrow(t)}
            onPointerCancel={() => releaseThrow(t)}
            onLostPointerCapture={() => releaseThrow(t)}
          >
            <span className={styles.letter}>{letter}</span>
            <span className={styles.what}>{t.name}</span>
          </button>
        </Tip>
      )
    if (letter === 'z' || letter === 'x')
      return (
        <Tip
          key={letter}
          text={
            letter === 'z'
              ? 'Let go of every bend key, pinned or held.'
              : 'Deal sixteen new bend keys for the board as it stands. Everything held lets go first.'
          }
        >
          <button
            className={styles.verbKey}
            style={style}
            onClick={letter === 'z' ? letGoAll : redealAll}
          >
            <span className={on ? styles.letter : styles.letterOff}>
              {letter}
            </span>
            <span className={styles.what}>
              {letter === 'z' ? 'let go' : 'redeal'}
            </span>
          </button>
        </Tip>
      )
    return (
      <span key={letter} className={styles.blank} style={style}>
        {letter}
      </span>
    )
  }

  return (
    <div className={styles.board}>
      <div className={styles.bar}>
        <Tip
          text={
            on
              ? 'The letter keys play the bend keys: hold one, shift pins it, z lets go of everything, x redeals. Press to hand them back to the toy keyboard.'
              : 'Send the computer’s letter keys to the bend keys instead of the toy keyboard.'
          }
        >
          <button
            className={on ? styles.letterSwitchOn : styles.letterSwitch}
            aria-pressed={on}
            onClick={() => setLetters(!on)}
          >
            bend keys
          </button>
        </Tip>
        {on && (
          <span className={styles.settings}>
            {HEATS.map(h => (
              <Tip key={h} text={`${HEAT_TIP[h]} — the next deal reads it`}>
                <button
                  className={heat === h ? styles.chipOn : styles.chip}
                  aria-pressed={heat === h}
                  onClick={() => setBendHeat(h)}
                >
                  {h}
                </button>
              </Tip>
            ))}
            <Tip
              text={`a key swells in over the morph time and falls back over the same time — ${Math.max(morphSeconds, 1)}s as the picker stands`}
            >
              <button
                className={swell ? styles.chipOn : styles.chip}
                aria-pressed={swell}
                onClick={() => setBendSwell(!swell)}
              >
                swell
              </button>
            </Tip>
            <Tip text="Deal a new hand every so many bars of the kit, for a set where you never want to know what the keys do. Counts only while the kit runs.">
              <select
                className={every === 0 ? styles.every : styles.everyOn}
                value={every}
                aria-label="redeal every"
                onChange={e =>
                  setRedealEvery(
                    REDEAL_BARS.find(
                      b => b === Number(e.currentTarget.value),
                    ) ?? 0,
                  )
                }
              >
                {REDEAL_BARS.map(b => (
                  <option key={b} value={b}>
                    {b === 0
                      ? 'keep the deal'
                      : `redeal every ${b === 1 ? 'bar' : `${b} bars`}`}
                  </option>
                ))}
              </select>
            </Tip>
          </span>
        )}
      </div>
      {on && (
        <div className={styles.keys}>
          {ROWS.map(({ letters, indent }, row) =>
            letters
              .split('')
              .map((letter, i) => keyFor(letter, place(row, indent, i))),
          )}
        </div>
      )}
    </div>
  )
}
