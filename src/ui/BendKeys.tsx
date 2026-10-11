import { useEffect, useState } from 'react'

import { engine } from '../engine/engine'
import {
  bendDeal,
  bendHeat,
  bendName,
  bendStepName,
  bendSwell,
  HEATS,
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
  type BendKey,
} from './bendKeys'
import styles from './BendKeys.module.css'
import { useStoreValue } from './ControlsContext'
import { isTyping } from './isTyping'
import { letterKeys } from './letters'
import { useCoarse } from './measure'
import throwStyles from './Throws.module.css'
import { Tip } from './Tip'

import type { MorphSeconds } from './morph'

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

// Sixteen throws the dice dealt, one per letter key. Held while the key or the
// pad is down; shift latches one so both hands are free. Letters reach the row
// only once the switch at its head sends them here instead of to a keybed.
export function BendKeys({ morphSeconds }: { morphSeconds: MorphSeconds }) {
  const deal = useStoreValue(bendDeal)
  const held = useStoreValue(engine.held)
  const on = useStoreValue(letterKeys) === 'bends'
  const heat = useStoreValue(bendHeat)
  const swell = useStoreValue(bendSwell)
  const every = useStoreValue(redealEvery)
  const coarse = useCoarse()
  const [latched, setLatched] = useState<Set<string>>(new Set())
  // A swell with the morph set to instant still swells: the switch is the ask.
  const seconds = swell ? Math.max(morphSeconds, 1) : 0

  useEffect(() => {
    if (bendDeal.get().length === 0) redealBendKeys(engine.controls.get())
    if (lettersWantBends(window.location.search)) letterKeys.set('bends')
  }, [])

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
  // for the row's life: a hold it has out must not let go because a pad lit.
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

  return (
    <div className={throwStyles.row}>
      {coarse ? (
        <span className={throwStyles.label}>bend</span>
      ) : (
        <Tip
          text={
            on
              ? 'the letter keys are throwing the board around: a s d f … hold a bend key, shift pins one down, z lets go of everything, x deals sixteen new ones. Press to hand the letters back to the toy keyboard.'
              : 'send the letter keys to this row: a s d f … hold a bend key, shift pins one down, z lets go of everything, x deals sixteen new ones.'
          }
        >
          <button
            className={on ? styles.switchOn : styles.switch}
            aria-pressed={on}
            onClick={() => setLetters(!on)}
          >
            {on ? 'letters bend' : 'bend'}
          </button>
        </Tip>
      )}
      {deal.map(k => {
        const lit =
          held.has(bendName(k.letter)) || held.has(bendStepName(k.letter))
        return (
          <Tip
            key={k.letter}
            text={`${k.says}, while held. Shift-click pins it down.`}
          >
            <button
              className={`${lit ? throwStyles.padOn : throwStyles.pad}${latched.has(k.letter) ? ` ${styles.pinned}` : ''}`}
              aria-pressed={lit}
              onPointerDown={e => {
                e.currentTarget.setPointerCapture(e.pointerId)
                press(k, e.shiftKey)
              }}
              onPointerUp={() => release(k)}
              onPointerCancel={() => release(k)}
              onLostPointerCapture={() => release(k)}
            >
              {k.name}
              {!coarse && <span className={throwStyles.key}>{k.letter}</span>}
            </button>
          </Tip>
        )
      })}
      <Tip text="Deal sixteen new bend keys off the dice for the board as it stands. Everything held lets go first.">
        <button className={styles.deal} onClick={redealAll}>
          redeal
        </button>
      </Tip>
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
                REDEAL_BARS.find(b => b === Number(e.currentTarget.value)) ?? 0,
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
    </div>
  )
}
