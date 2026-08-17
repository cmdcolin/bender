import { useEffect, useRef, useState } from 'react'
import type { instance } from '@viz-js/viz'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { buildDot, groupAnchor } from './chain-dot'
import { GROUPS } from './controls'
import styles from './ChainMap.module.css'

// A megabyte of wasm graphviz, kept out of the boot path.
let viz: Promise<Awaited<ReturnType<typeof instance>>> | undefined

const BY_ANCHOR = new Map(GROUPS.map(g => [groupAnchor(g.name), g.name]))

// The signal path drawn by graphviz: live bend order, the feedback wire, and
// each stage a door into its controls. The map is the panel's index — clicking
// a box is what puts a stage's knobs on screen — so it draws folded into two
// columns, which is what keeps it and the stage it opens on screen together.
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

  const dot = buildDot(controls, { wrap: true, open: open ?? undefined })
  useEffect(() => {
    if (dot === lastDot.current) return
    lastDot.current = dot
    let stale = false
    viz ??= import('@viz-js/viz').then(m => m.instance())
    viz
      .then(v => {
        if (stale || !host.current) return
        host.current.replaceChildren(v.renderSVGElement(dot))
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
          const href = link?.getAttribute('href') ?? link?.getAttribute('xlink:href')
          const name = href?.startsWith('#') && BY_ANCHOR.get(href.slice(1))
          if (!name) return
          e.preventDefault()
          onOpen(name)
        }}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
