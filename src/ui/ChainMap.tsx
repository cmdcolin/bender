import {
  createElement,
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import type { Controls } from '../controls'
import { engine } from '../engine/engine'
import { buildMap, drawMap } from './chain-map'
import { useStoreValue } from './ControlsContext'
import { useCoarse } from './measure'
import { CHANNELS, GROUPS, groupKeys } from './controls'
import { MAX_SOURCES } from '../engine/params'
import { resetGroup } from './presets'
import { Shelf } from './Section'
import type { El } from './svg'
import styles from './ChainMap.module.css'

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
  const map = buildMap(controls, {
    wrap: true,
    open: open ?? undefined,
    playing,
  })

  // The number on a box is how far off stock that stage is sitting, and it is
  // also the way back: pressing it puts the stage where it booted, travelling
  // and landing in the walk like every other verb, so a mis-aimed click is one
  // ctrl+z away. Checked before the door, because it sits over one.
  const press = (target: Element): boolean => {
    const back = target.closest('[data-reset]')?.getAttribute('data-reset')
    const group = GROUP_BY_NAME.get(
      back ?? target.closest('[data-door]')?.getAttribute('data-door') ?? '',
    )
    if (!group) return false
    if (back)
      engine.morphTo(
        resetGroup(group, engine.controls.get()),
        seconds,
        new Set(groupKeys(group)),
      )
    else onOpen(group.name)
    return true
  }

  const click = (e: MouseEvent) => {
    if (press(e.target as Element)) e.preventDefault()
  }

  // A door is a link and a keyboard already works it. A number is a verb with
  // nowhere to link to, so enter and space over one are taken here — and stopped
  // here, because a space anywhere else on the window is the run line.
  const key = (e: KeyboardEvent) => {
    const target = e.target as Element
    if (e.key !== 'Enter' && e.key !== ' ') return
    if (!target.closest('[data-reset]')) return
    e.preventDefault()
    e.stopPropagation()
    press(target)
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
      <div className={styles.graph} onClick={click} onKeyDown={key}>
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
