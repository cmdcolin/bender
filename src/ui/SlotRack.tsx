import { useState } from 'react'
import type { Controls } from '../controls'
import { engine } from '../engine/engine'
import { useBoardValue } from './ControlsContext'
import { BENDS, BEND_SLOT_KEYS, bendAt, sliderFor } from './controls'
import { ControlSlider } from './Slider'
import styles from './SlotRack.module.css'

/** Dropped on the shelf rather than on a position: the bend comes out of the
    chain, which is the one move the six selects make you go looking for. */
const OFF = -1

const slotsOf = (c: Controls) => BEND_SLOT_KEYS.map(k => Math.round(c[k]))

// One gesture, one step in the walk: dragging a box moves one bend and shuffles
// whatever it landed on, and ctrl+z puts the whole chain back rather than
// unpicking it a position at a time.
function writeSlots(next: number[]) {
  const board = engine.controls.get()
  engine.armStep()
  engine.writeBoard({
    ...board,
    ...Object.fromEntries(BEND_SLOT_KEYS.map((k, i) => [k, next[i]!])),
  })
}

// Insertion, not a swap. A chain is a list, and the move you mean when you drag
// the filter above the crusher is "put it here and let the rest close up" —
// swapping would move a second stage you never touched, which on a signal path
// is two edits for one gesture.
function move(slots: number[], from: number, to: number): number[] {
  const next = [...slots]
  const [taken] = next.splice(from, 1)
  next.splice(to, 0, taken!)
  return next
}

export function SlotRack() {
  const raw = useBoardValue(c => slotsOf(c).join(','))
  const slots = raw.split(',').map(Number)
  const mixRaw = useBoardValue(c => BENDS.map(b => c[b.mix]).join(','))
  const mixOf = mixRaw.split(',').map(Number)
  // Which box is under the hand and which row it is over, so the rack shows
  // where a drop would land while the hand is still moving. Not on the board:
  // a drag that never finishes has to leave the chain exactly as it was.
  const [held, setHeld] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const seen = new Set<number>()
  const rows = slots.map((id, i) => {
    const bend = bendAt(id)
    const dupe = bend !== undefined && seen.has(id)
    if (bend !== undefined) seen.add(id)
    return { i, id, bend, dupe, mix: bend ? mixOf[id - 1]! : 0 }
  })
  const loose = BENDS.map((b, i) => ({ bend: b, id: i + 1 })).filter(
    b => !seen.has(b.id),
  )

  const drop = (to: number) => {
    const from = held
    setHeld(null)
    setOver(null)
    if (from === null) return
    if (from === OFF) return
    if (to === OFF) {
      const next = [...slots]
      next[from] = 0
      writeSlots(next)
      return
    }
    if (from !== to) writeSlots(move(slots, from, to))
  }

  // A bend riding off the board, dragged into a position: it lands there and
  // whatever was in that position is what rides loose now. Seven bends, six
  // positions — bringing one in is always trading one out.
  const dropLoose = (id: number, to: number) => {
    setHeld(null)
    setOver(null)
    const next = [...slots]
    next[to] = id
    writeSlots(next)
  }

  return (
    <div className={styles.rack}>
      <div className={styles.caption}>from the mix bus ↓</div>
      <ol className={styles.slots}>
        {rows.map(row => {
          const off = row.bend === undefined
          const quiet = off || row.dupe || row.mix === 0
          const title = off
            ? `Position ${row.i + 1} is empty — nothing runs here.`
            : row.dupe
              ? `${row.bend!.group} already sits earlier in the chain, so this position does nothing — a bend only runs at its first one.`
              : row.mix === 0
                ? `${row.bend!.group} — its mix is at 0, so it sits in the chain playing silent.`
                : `${row.bend!.group}, position ${row.i + 1} of ${rows.length}. Drag it to move it.`
          return (
            <li
              key={row.i}
              className={[
                styles.slot,
                off ? styles.empty : '',
                quiet && !off ? styles.quiet : '',
                over === row.i ? styles.target : '',
                held === row.i ? styles.held : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={title}
              draggable={!off}
              onDragStart={() => setHeld(row.i)}
              onDragEnd={() => {
                setHeld(null)
                setOver(null)
              }}
              onDragOver={e => {
                e.preventDefault()
                setOver(row.i)
              }}
              onDrop={e => {
                e.preventDefault()
                const id = Number(e.dataTransfer.getData('text/bend'))
                if (id > 0) dropLoose(id, row.i)
                else drop(row.i)
              }}
            >
              <span className={styles.num}>{row.i + 1}</span>
              <span className={styles.name}>
                {off ? 'empty' : row.bend!.group}
              </span>
            </li>
          )
        })}
      </ol>
      <div className={styles.caption}>to the pedals →</div>

      <div
        className={
          over === OFF ? `${styles.shelf} ${styles.target}` : styles.shelf
        }
        onDragOver={e => {
          e.preventDefault()
          setOver(OFF)
        }}
        onDrop={e => {
          e.preventDefault()
          drop(OFF)
        }}
      >
        <span className={styles.shelfLabel}>off the board</span>
        {loose.map(({ bend, id }) => (
          <span
            key={bend.group}
            className={styles.loose}
            title={`${bend.group} is in no position, so the signal never reaches it. Drag it onto one to bring it into the chain.`}
            draggable
            onDragStart={e => {
              // Both types: the private one is what the rack reads, and a
              // plain-text payload is what some browsers want to see before
              // they will let a drop happen at all.
              e.dataTransfer.setData('text/bend', String(id))
              e.dataTransfer.setData('text/plain', bend.group)
              setHeld(OFF)
            }}
            onDragEnd={() => {
              setHeld(null)
              setOver(null)
            }}
          >
            {bend.group}
          </span>
        ))}
        {loose.length === 0 && (
          <span className={styles.shelfEmpty}>everything is in the chain</span>
        )}
      </div>
    </div>
  )
}

// The other half of the chain: a dry/wet per bend that is actually in a
// position, in the order the signal meets them. The rack above says what the
// path is, and these say how much of the board goes down it — a stage at a mix
// of zero is in the chain and silent, which is the commonest reason a position
// you just filled changed nothing.
//
// Each fader is called the bend it belongs to rather than *Mix*, the way the
// desk calls six faders called *Level* by their machines. It is the same
// control as the one on that bend's own panel, and only one panel is ever open.
export function SlotMixes() {
  const raw = useBoardValue(c => slotsOf(c).join(','))
  const seen = new Set<number>()
  const rows = raw
    .split(',')
    .map(Number)
    .flatMap(id => {
      const bend = bendAt(id)
      if (!bend || seen.has(id)) return []
      seen.add(id)
      return [bend]
    })
  if (rows.length === 0) return null
  return (
    <div className={styles.mixes}>
      <span className={styles.mixHead}>how wet each one is</span>
      {rows.map(bend => (
        <ControlSlider
          key={bend.mix}
          def={sliderFor(bend.mix)}
          label={bend.group}
        />
      ))}
    </div>
  )
}
