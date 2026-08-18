import {
  createElement,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import type { Controls } from '../controls'
import { engine } from '../engine/engine'
import { buildMap, drawMap } from './chain-map'
import { useStoreValue } from './ControlsContext'
import { GROUPS } from './controls'
import { resetGroup } from './presets'
import { Shelf } from './Section'
import type { El } from './svg'
import styles from './ChainMap.module.css'

const GROUP_BY_NAME = new Map(GROUPS.map(g => [g.name, g]))

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
  seconds,
}: {
  open: string | null
  onOpen: (name: string) => void
  seconds: number
}) {
  const controls = useSettledControls()
  // The lamps on the two toys, which is the one thing on the map that isn't in
  // the board: what is running comes off the switches under the keys.
  const playing: string[] = []
  if (useStoreValue(engine.songPlaying)) playing.push('Toy keyboard')
  if (useStoreValue(engine.drumsPlaying)) playing.push('Toy drums')
  const map = buildMap(controls, {
    wrap: true,
    open: open ?? undefined,
    playing,
  })

  // The number on a box is how far off stock that stage is sitting, and it is
  // also the way back: pressing it puts the stage where it booted, travelling
  // and landing in the walk like every other verb, so a mis-aimed click is one
  // ctrl+z away. Checked before the door, because it sits over one.
  const click = (e: MouseEvent) => {
    const target = e.target as Element
    const back = target.closest('[data-reset]')?.getAttribute('data-reset')
    const group = GROUP_BY_NAME.get(
      back ?? target.closest('[data-door]')?.getAttribute('data-door') ?? '',
    )
    if (!group) return
    e.preventDefault()
    if (back) engine.morphTo(resetGroup(group, engine.controls.get()), seconds)
    else onOpen(group.name)
  }

  return (
    <div className={open ? `${styles.map} ${styles.mapOpen}` : styles.map}>
      <div className={styles.graph} onClick={click}>
        {mount(drawMap(map), 0)}
      </div>
      <Shelf
        groups={GROUPS.filter(g => !map.doors.has(g.name))}
        open={open}
        onOpen={onOpen}
        seconds={seconds}
      />
    </div>
  )
}
