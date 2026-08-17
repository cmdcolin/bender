import { useEffect, useRef, useState } from 'react'
import type { instance } from '@viz-js/viz'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { buildMap, groupAnchor } from './chain-dot'
import { GROUPS } from './controls'
import { Shelf } from './Section'
import styles from './ChainMap.module.css'

// A megabyte of wasm graphviz, kept out of the boot path.
let viz: Promise<Awaited<ReturnType<typeof instance>>> | undefined

const BY_ANCHOR = new Map(GROUPS.map(g => [groupAnchor(g.name), g.name]))

// Graphviz paints a wire as a hairline, and a dashed one only takes a click on
// the dashes themselves. Each wire that is a door gets a transparent twin laid
// under it — transparent rather than absent, so it still takes the pointer, and
// 8 wide so the band stays inside the gap to whatever it runs past. The width
// is inline because the hover rule that thickens the visible stroke would
// otherwise shrink the target out from under the pointer.
function widenWires(svg: SVGSVGElement) {
  for (const path of svg.querySelectorAll('g.edge a path')) {
    const hit = path.cloneNode() as SVGPathElement
    hit.style.stroke = 'transparent'
    hit.style.strokeWidth = '8'
    hit.removeAttribute('stroke-dasharray')
    path.before(hit)
  }
}

// The signal path drawn by graphviz: live bend order, the feedback wire, and
// each stage a door into its controls. The map is the panel's index — clicking
// a box is what puts a stage's knobs on screen — so it draws folded into two
// columns, which is what keeps it and the stage it opens on screen together.
// Whatever the drawing found no door for goes on the shelf underneath, which is
// why the index is complete: every group is either on the path or on the shelf.
export function ChainMap({
  open,
  onOpen,
}: {
  open: string | null
  onOpen: (name: string) => void
}) {
  const controls = useStoreValue(engine.controls)
  const host = useRef<HTMLDivElement>(null)
  const lastDot = useRef<string>('')
  const [error, setError] = useState<string>()

  const { dot, doors } = buildMap(controls, {
    wrap: true,
    open: open ?? undefined,
  })
  useEffect(() => {
    if (dot === lastDot.current) return
    lastDot.current = dot
    let stale = false
    viz ??= import('@viz-js/viz').then(m => m.instance())
    viz
      .then(v => {
        if (stale || !host.current) return
        const svg = v.renderSVGElement(dot)
        widenWires(svg)
        host.current.replaceChildren(svg)
      })
      .catch((e: unknown) => setError(String(e)))
    return () => {
      stale = true
    }
  }, [dot])

  return (
    <div className={styles.map}>
      <div
        className={styles.graph}
        ref={host}
        onClick={e => {
          const link = (e.target as Element).closest('a')
          const href =
            link?.getAttribute('href') ?? link?.getAttribute('xlink:href')
          const name = href?.startsWith('#') && BY_ANCHOR.get(href.slice(1))
          if (!name) return
          e.preventDefault()
          onOpen(name)
        }}
      />
      {error && <span className={styles.error}>{error}</span>}
      <Shelf
        groups={GROUPS.filter(g => !doors.has(g.name))}
        open={open}
        onOpen={onOpen}
      />
    </div>
  )
}
