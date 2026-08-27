import { useEffect, useRef, useState } from 'react'
import type { Controls } from '../controls'
import { engine } from '../engine/engine'
import { useBoardValue, useMeterValue } from './ControlsContext'
import { BENDS, BEND_SLOT_KEYS, bendAt } from './controls'
import { move } from './reorder'
import styles from './SlotRack.module.css'

/** Dropped on the shelf rather than on a position: the bend comes out of the
    chain. */
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
  // Where the keyboard left the bend it just moved. A row is focused and then
  // rewritten out from under itself — the board comes back as six fresh rows —
  // so the rack has to put the focus back on the box you were carrying rather
  // than on the position it used to be in.
  const list = useRef<HTMLOListElement>(null)
  const [land, setLand] = useState<number | null>(null)
  useEffect(() => {
    if (land === null) return
    setLand(null)
    const row = list.current?.children[land]
    if (row instanceof HTMLElement) row.focus()
  }, [land])

  // What the chain is running, as against what it is set to. Solder rewrites the
  // path from inside the audio thread — the relay swaps two positions, a dry
  // joint drops one out mid-note — and it writes to no control, so the rack has
  // to be told. Read as one string, so a board with the solder cold hears about
  // none of it: the walk stands still and nothing here renders again.
  const live = useMeterValue(m => `${m.walk.join('')}:${m.dropped}`)
  const [order, openMask] = live.split(':')
  const walk = order!.split('').map(Number)
  const dropped = Number(openMask)

  // Which step of the walk each position is being read at, and which positions
  // are the ones actually heard — a bend named twice runs only where the signal
  // meets it first, and *where it meets it first* is the walk's order, not the
  // rack's. At rest the two are the same and this is the plain reading.
  const stepOf = walk.reduce<number[]>((at, slot, k) => {
    at[slot] = k
    return at
  }, [])
  const seen = new Set<number>()
  const runs = new Set<number>()
  for (const slot of walk) {
    const id = slots[slot]!
    if (id > 0 && !seen.has(id)) {
      seen.add(id)
      runs.add(slot)
    }
  }

  const rows = slots.map((id, i) => {
    const bend = bendAt(id)
    const step = stepOf[i] ?? i
    return {
      i,
      id,
      bend,
      dupe: bend !== undefined && !runs.has(i),
      open: (dropped & (1 << step)) !== 0,
      step,
      mix: bend ? mixOf[id - 1]! : 0,
    }
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

  // The drag, done with the arrow keys. Same insertion and the same one step in
  // the walk — a rack you can only work with a mouse is a chain a keyboard
  // cannot reorder at all, and the order is most of what the board sounds like.
  const nudge = (from: number, to: number) => {
    if (to < 0 || to >= slots.length) return
    writeSlots(move(slots, from, to))
    setLand(to)
  }

  const lift = (at: number) => {
    const next = [...slots]
    next[at] = 0
    writeSlots(next)
    setLand(at)
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

  // Pressing a loose bend instead of dragging it. Somewhere empty if there is
  // anywhere empty, and the last position if there is not, because the trade a
  // full rack makes has to be one you can see: the bend that leaves is the one
  // the signal was about to stop at anyway.
  const takeLoose = (id: number) => {
    const empty = slots.findIndex(v => v === 0)
    const to = empty === -1 ? slots.length - 1 : empty
    dropLoose(id, to)
    setLand(to)
  }

  return (
    <div className={styles.rack}>
      <div className={styles.caption}>from the mix bus ↓</div>
      <ol className={styles.slots} ref={list}>
        {rows.map(row => {
          const off = row.bend === undefined
          // Where the board has this position right now, which is its own
          // place until the relay moves it.
          const moved = !off && row.step !== row.i
          const quiet = off || row.open || row.dupe || row.mix === 0
          const title = off
            ? `Position ${row.i + 1} is empty — nothing runs here.`
            : row.open
              ? `${row.bend!.group} — the joint under it is open, so it is out of the path altogether until the solder comes back.`
              : row.dupe
                ? `${row.bend!.group} already sits earlier in the chain, so this position does nothing — a bend only runs at its first one.`
                : row.mix === 0
                  ? `${row.bend!.group} — its mix is at 0, so it sits in the chain playing silent.`
                  : moved
                    ? `${row.bend!.group} is set to position ${row.i + 1}, and the board has re-soldered it to ${row.step + 1}. Re-solder is what moves it; the settings are still yours.`
                    : `${row.bend!.group}, position ${row.i + 1} of ${rows.length}. Drag it, or take it with the arrow keys.`
          // What the row of dry/wet faders under the rack used to be for, and
          // what no control on the board can say. A stage can be in the path
          // and inaudible, or somewhere other than where you put it, and both
          // are why a rack you have read carefully is not what you can hear.
          // Whichever is true of it now, said on the row it is about.
          const tag = off
            ? ''
            : row.open
              ? 'dropped'
              : row.dupe
                ? 'already above'
                : row.mix === 0
                  ? 'silent'
                  : moved
                    ? `now ${row.step + 1}`
                    : ''
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
              tabIndex={0}
              aria-label={title}
              onKeyDown={e => {
                if (off) return
                if (e.key === 'ArrowUp') nudge(row.i, row.i - 1)
                else if (e.key === 'ArrowDown') nudge(row.i, row.i + 1)
                else if (e.key === 'Delete' || e.key === 'Backspace')
                  lift(row.i)
                else return
                e.preventDefault()
              }}
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
              {tag && <span className={styles.tag}>{tag}</span>}
            </li>
          )
        })}
      </ol>
      <div className={styles.caption}>to the pedal board →</div>

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
          <button
            key={bend.group}
            type="button"
            className={styles.loose}
            title={`${bend.group} is in no position, so the signal never reaches it. Drag it onto one, or press it, to bring it into the chain.`}
            onClick={() => takeLoose(id)}
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
          </button>
        ))}
        {loose.length === 0 && (
          <span className={styles.shelfEmpty}>everything is in the chain</span>
        )}
      </div>
    </div>
  )
}
