import {
  createElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'

import { engine } from '../engine/engine.ts'
import { MAX_SOURCES } from '../engine/params.ts'
import { bench } from './bench.ts'
import { buildMap, drawMap } from './chain-map.ts'
import styles from './ChainMap.module.css'
import { CHANNELS, GROUPS } from './controls/index.ts'
import { useStoreValue } from './ControlsContext.ts'
import { useCoarse } from './measure.ts'
import { watchRail } from './railWatch.ts'
import { Shelf } from './Section.tsx'

import type { Controls } from '../controls.ts'
import type { El } from './svg.ts'

const GROUP_BY_NAME = new Map(GROUPS.map(g => [g.name, g]))

// The channels the bus meters, by the name the map draws them under. The mic is
// a wire rather than a machine and has no box of its own, so it is not here.
const SOUNDING = CHANNELS.filter(c => c.tap < MAX_SOURCES)

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

// Below this share of a fresh rail the supply bar on the map turns amber.
const SAGGING = 0.85

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
// keeps it and the stage it opens on screen together. The drawing has somewhere
// for every part of the board now, wired or not, so the shelf under it is the
// backstop rather than a list: what lands there is a group the drawing forgot.
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
  const coarse = useCoarse()
  // Which sources are sounding, which is the one thing on the map that isn't in
  // the board: it comes off the meters on the bus rather than off any control.
  // The run switches used to answer it and could only answer it for two of the
  // six — the FM chip has no switch, the sampler's lies when nothing is
  // threaded, and a switch says nothing about the fader in front of it.
  const lit = useStoreValue(engine.sounding)
  const playing = SOUNDING.filter(c => lit & (1 << c.tap)).map(c => c.name)
  const { pedals: benched } = useStoreValue(bench)
  const graph = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let shown = ''
    return watchRail((rail, rebooting) => {
      const state = rebooting ? 'reboot' : rail < SAGGING ? 'low' : ''
      if (!graph.current || state === shown) return
      shown = state
      if (state) graph.current.dataset.rail = state
      else delete graph.current.dataset.rail
    })
  }, [])
  const map = buildMap(controls, {
    wrap: true,
    loop: true,
    open: open ?? undefined,
    playing,
    benched,
  })

  // Clicking a stage's door opens its panel. The touched dot beside a box is
  // signage rather than a control, so it takes no click of its own.
  const press = (target: Element): boolean => {
    const door = target.closest('[data-door]')?.getAttribute('data-door')
    const group = GROUP_BY_NAME.get(door ?? '')
    if (!group) return false
    onOpen(group.name)
    return true
  }

  const click = (e: MouseEvent) => {
    if (e.target instanceof Element && press(e.target)) e.preventDefault()
  }

  return (
    <div className={styles.map}>
      {/* Every stage as a chip a finger can land on. The drawing is six boxes
          across and scales to the width it is given, which on a phone puts
          its doors at twenty pixels; nothing about the drawing can grow them
          without a sideways pan, so the doors are laid out again here, at
          the height every other press on a phone gets. */}
      {coarse && (
        <Shelf
          groups={GROUPS}
          label="stages"
          open={open}
          onOpen={onOpen}
          seconds={seconds}
        />
      )}
      <div ref={graph} className={styles.graph} onClick={click}>
        {mount(drawMap(map), 0)}
      </div>
      {!coarse && (
        <Shelf
          groups={GROUPS.filter(g => !map.doors.has(g.name))}
          label="off the board"
          open={open}
          onOpen={onOpen}
          seconds={seconds}
        />
      )}
    </div>
  )
}
