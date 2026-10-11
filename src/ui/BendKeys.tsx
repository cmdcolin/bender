import { useEffect, useState } from 'react'

import { engine } from '../engine/engine'
import { bendDeal, bendName, redealBendKeys, type BendKey } from './bendKeys'
import styles from './BendKeys.module.css'
import { useStoreValue } from './ControlsContext'
import { isTyping } from './isTyping'
import { letterKeys } from './letters'
import { useCoarse } from './measure'
import throwStyles from './Throws.module.css'
import { Tip } from './Tip'

const omitFrom = (set: Set<string>, value: string) => {
  const next = new Set(set)
  next.delete(value)
  return next
}

// Sixteen throws the dice dealt, one per letter key. Held while the key or the
// pad is down; shift latches one so both hands are free. Letters reach the row
// only once the switch at its head sends them here instead of to a keybed.
export function BendKeys() {
  const deal = useStoreValue(bendDeal)
  const held = useStoreValue(engine.held)
  const on = useStoreValue(letterKeys) === 'bends'
  const coarse = useCoarse()
  const [latched, setLatched] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (bendDeal.get().length === 0) redealBendKeys(engine.controls.get())
  }, [])

  const letGo = (k: BendKey) => {
    engine.letGoThrow(bendName(k.letter))
    if (latched.has(k.letter)) setLatched(l => omitFrom(l, k.letter))
  }

  // A press on a key already pinned down is what lets it go, however it got
  // pinned: a key you can see lit and cannot turn off is a stuck key.
  const press = (k: BendKey, latch: boolean) => {
    if (latched.has(k.letter)) {
      letGo(k)
      return
    }
    engine.holdThrow(bendName(k.letter), k.push(engine.controls.get()))
    if (latch) setLatched(l => new Set(l).add(k.letter))
  }

  const release = (k: BendKey) => {
    if (!latched.has(k.letter)) engine.letGoThrow(bendName(k.letter))
  }

  const letGoAll = () => {
    for (const k of deal) engine.letGoThrow(bendName(k.letter))
    setLatched(new Set())
  }

  const redeal = () => {
    letGoAll()
    redealBendKeys(engine.controls.get())
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!on || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      const pressed = e.key.toLowerCase()
      if (pressed === 'z') letGoAll()
      else if (pressed === 'x') redeal()
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
              : 'send the letter keys here instead of the toy keyboard: a s d f … hold a bend key, shift pins one down, z lets go of everything, x deals sixteen new ones.'
          }
        >
          <button
            className={on ? styles.switchOn : styles.switch}
            aria-pressed={on}
            onClick={() => letterKeys.set(on ? 'toy' : 'bends')}
          >
            {on ? 'letters bend' : 'bend'}
          </button>
        </Tip>
      )}
      {deal.map(k => {
        const lit = held.has(bendName(k.letter))
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
        <button className={styles.deal} onClick={redeal}>
          redeal
        </button>
      </Tip>
    </div>
  )
}
