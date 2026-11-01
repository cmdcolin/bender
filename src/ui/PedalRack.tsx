import { useState } from 'react'

import { engine } from '../engine/engine.ts'
import { PEDALS, pedalOrderAt, pedalOrderOf } from '../pedals.ts'
import { pedalWet } from './chain-map.ts'
import { useBoardValue } from './ControlsContext.ts'
import { RackNudge } from './RackNudge.tsx'
import { move } from './reorder.ts'
import styles from './SlotRack.module.css'
import { useLanding } from './useLanding.ts'

import type { Controls } from '../controls.ts'

function writeOrder(order: readonly number[]) {
  const at = pedalOrderOf(order)
  if (at >= 0) {
    engine.armStep()
    engine.writeBoard({ ...engine.controls.get(), pedalOrder: at })
  }
}

const tagOf = (c: Controls, pedal: number) => {
  const { group, mute } = PEDALS[pedal]!
  return c[mute] > 0.5 ? 'bypassed' : !pedalWet(c, group) ? 'dry' : ''
}

const TITLE_TAIL: Record<string, string> = {
  bypassed:
    'Its footswitch has it bypassed, so the signal passes straight through.',
  dry: 'Its mix is at 0, so it adds nothing to the sound.',
  '': 'Drag it, or move it with the arrow keys.',
}

export function PedalRack() {
  const at = useBoardValue(c => Math.round(c.pedalOrder))
  const order = pedalOrderAt(at)
  const tags = useBoardValue(c =>
    pedalOrderAt(c.pedalOrder)
      .map(p => tagOf(c, p))
      .join(','),
  ).split(',')
  const [held, setHeld] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const { list, setLand } = useLanding()

  const drop = (to: number) => {
    const from = held
    setHeld(null)
    setOver(null)
    if (from !== null && from !== to) writeOrder(move(order, from, to))
  }

  const nudge = (from: number, to: number) => {
    if (to >= 0 && to < order.length) {
      writeOrder(move(order, from, to))
      setLand(to)
    }
  }

  return (
    <div className={styles.rack}>
      <div className={styles.caption}>from the signal chain ↓</div>
      <ol className={styles.slots} ref={list}>
        {order.map((pedal, i) => {
          const name = PEDALS[pedal]!.group
          const tag = tags[i]!
          const title = `${name}, ${i + 1} of ${order.length}. ${TITLE_TAIL[tag]}`
          return (
            <li
              key={pedal}
              className={[
                styles.slot,
                tag ? styles.quiet : '',
                over === i ? styles.target : '',
                held === i ? styles.held : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={title}
              aria-label={title}
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  nudge(i, e.key === 'ArrowUp' ? i - 1 : i + 1)
                }
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
              {tag && <span className={styles.tag}>{tag}</span>}
              <RackNudge
                name={name}
                at={i}
                count={order.length}
                onMove={to => nudge(i, to)}
              />
            </li>
          )
        })}
      </ol>
      <div className={styles.caption}>to the output →</div>
    </div>
  )
}
