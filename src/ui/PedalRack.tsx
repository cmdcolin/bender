import { useEffect, useRef, useState } from 'react'
import { engine } from '../engine/engine'
import { PEDALS, PEDAL_ORDERS, pedalOrderAt } from '../pedals'
import { useBoardValue } from './ControlsContext'
import { move } from './reorder'
import styles from './SlotRack.module.css'

// The board's own drawing, in the grammar the bend rack already uses: a row per
// pedal in the order the signal meets them, dragged or arrow-keyed to move one.
//
// No shelf under it and no empty rows, because there is nothing to put on a
// shelf — all four pedals are always on the board, and the one that is not in
// the path is the one whose own mix is down. That is the whole of what makes
// this rack a shorter thing than the one upstream.
const indexOf = (order: readonly number[]) =>
  PEDAL_ORDERS.findIndex(o => o.every((v, i) => v === order[i]))

function writeOrder(order: readonly number[]) {
  const at = indexOf(order)
  if (at < 0) return
  engine.armStep()
  engine.writeBoard({ ...engine.controls.get(), pedalOrder: at })
}

export function PedalRack() {
  const at = useBoardValue(c => Math.round(c.pedalOrder))
  const order = pedalOrderAt(at)
  const [held, setHeld] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  // The same trick the bend rack plays: the row you are carrying is rewritten
  // out from under itself, so the focus has to be put back on the pedal rather
  // than on the position it used to be at.
  const list = useRef<HTMLOListElement>(null)
  const [land, setLand] = useState<number | null>(null)
  useEffect(() => {
    if (land === null) return
    setLand(null)
    const row = list.current?.children[land]
    if (row instanceof HTMLElement) row.focus()
  }, [land])

  const drop = (to: number) => {
    const from = held
    setHeld(null)
    setOver(null)
    if (from === null || from === to) return
    writeOrder(move(order, from, to))
  }

  const nudge = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return
    writeOrder(move(order, from, to))
    setLand(to)
  }

  return (
    <div className={styles.rack}>
      <div className={styles.caption}>from the signal chain ↓</div>
      <ol className={styles.slots} ref={list}>
        {order.map((pedal, i) => {
          const name = PEDALS[pedal]!.group
          const title = `${name}, ${i + 1} of ${order.length} — drag it, or take it with the arrow keys. Its own mix is what takes it out of the path.`
          return (
            <li
              key={pedal}
              className={[
                styles.slot,
                over === i ? styles.target : '',
                held === i ? styles.held : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={title}
              aria-label={title}
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'ArrowUp') nudge(i, i - 1)
                else if (e.key === 'ArrowDown') nudge(i, i + 1)
                else return
                e.preventDefault()
              }}
              draggable
              onDragStart={() => setHeld(i)}
              onDragEnd={() => {
                setHeld(null)
                setOver(null)
              }}
              onDragOver={e => {
                e.preventDefault()
                setOver(i)
              }}
              onDrop={e => {
                e.preventDefault()
                drop(i)
              }}
            >
              <span className={styles.num}>{i + 1}</span>
              <span className={styles.name}>{name}</span>
            </li>
          )
        })}
      </ol>
      <div className={styles.caption}>to the tape →</div>
    </div>
  )
}
