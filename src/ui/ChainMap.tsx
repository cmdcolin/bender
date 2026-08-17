import { createElement, type ReactNode } from 'react'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { buildMap, drawMap } from './chain-map'
import { GROUPS } from './controls'
import { Shelf } from './Section'
import type { El } from './svg'
import styles from './ChainMap.module.css'

const DOORS = new Set(GROUPS.map(g => g.name))

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
  const controls = useStoreValue(engine.controls)
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
