import { createElement, useEffect, useState, type ReactNode } from 'react'
import type { Controls } from '../controls'
import { engine } from '../engine/engine'
import { buildMap, drawMap } from './chain-map'
import { GROUPS } from './controls'
import { Shelf } from './Section'
import type { El } from './svg'
import styles from './ChainMap.module.css'

const DOORS = new Set(GROUPS.map(g => g.name))

// Graphviz used to lay the map out again for any change to the string at all,
// and it was debounced for that. Drawing it ourselves is far cheaper but not
// free: the panel still hands React a fresh tree of 179 SVG elements to diff,
// which is half a millisecond to build and at least as much again to reconcile
// — and two of the strings in it are numbers printed on wires, the feedback
// amount and each patch wire's depth, which a morph moves every frame.
//
// What the map is for is its shape, and a shape can wait a tenth of a second.
// So it draws at once when it has been still, and on the trailing edge while
// the board is moving. Which stage is open is not on this clock: that arrives
// as a prop and lights up the moment it is clicked.
const REDRAW_MS = 120

function useSettledControls(): Controls {
  const [controls, setControls] = useState(engine.controls.get)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let drawnAt = 0
    const draw = () => {
      timer = undefined
      drawnAt = performance.now()
      setControls(engine.controls.get())
    }
    const off = engine.controls.subscribe(() => {
      if (timer !== undefined) return
      const wait = REDRAW_MS - (performance.now() - drawnAt)
      if (wait <= 0) draw()
      else timer = setTimeout(draw, wait)
    })
    return () => {
      off()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])
  return controls
}

function mount(node: El | string, key: number): ReactNode {
  if (typeof node === 'string') return node
  return createElement(node.tag, { key, ...node.attrs }, node.kids?.map(mount))
}

// The signal path: live bend order, the feedback wire, and each stage a door
// into its controls. The map is the panel's index — clicking a box is what puts
// a stage's knobs on screen — so it draws folded into two columns, which is what
// keeps it and the stage it opens on screen together. Whatever the drawing found
// no door for goes on the shelf underneath, which is why the index is complete:
// every group is either on the path or on the shelf.
export function ChainMap({
  open,
  onOpen,
}: {
  open: string | null
  onOpen: (name: string) => void
}) {
  const controls = useSettledControls()
  const map = buildMap(controls, { wrap: true, open: open ?? undefined })

  return (
    <div className={open ? `${styles.map} ${styles.mapOpen}` : styles.map}>
      <div
        className={styles.graph}
        onClick={e => {
          const name = (e.target as Element)
            .closest('[data-door]')
            ?.getAttribute('data-door')
          if (!name || !DOORS.has(name)) return
          e.preventDefault()
          onOpen(name)
        }}
      >
        {mount(drawMap(map), 0)}
      </div>
      <Shelf
        groups={GROUPS.filter(g => !map.doors.has(g.name))}
        open={open}
        onOpen={onOpen}
      />
    </div>
  )
}
