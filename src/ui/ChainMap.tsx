import { useEffect, useRef, useState } from 'react'
import type { instance } from '@viz-js/viz'
import { engine } from '../engine/engine'
import { useStoreValue } from './ControlsContext'
import { buildDot } from './chain-dot'
import { revealGroup } from './reveal'
import styles from './ChainMap.module.css'

// A megabyte of wasm graphviz, kept out of the boot path.
let viz: Promise<Awaited<ReturnType<typeof instance>>> | undefined

// The signal path drawn by graphviz: live bend order, the feedback wire, and
// each stage clickable through to its controls.
export function ChainMap() {
  const controls = useStoreValue(engine.controls)
  const host = useRef<HTMLDivElement>(null)
  const lastDot = useRef<string>('')
  const [error, setError] = useState<string>()

  const dot = buildDot(controls)
  useEffect(() => {
    if (dot === lastDot.current) return
    lastDot.current = dot
    let stale = false
    viz ??= import('@viz-js/viz').then(m => m.instance())
    viz
      .then(v => {
        if (stale || !host.current) return
        const svg = v.renderSVGElement(dot)
        svg.removeAttribute('width')
        svg.removeAttribute('height')
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
          const href = link?.getAttribute('href') ?? link?.getAttribute('xlink:href')
          if (!href?.startsWith('#')) return
          e.preventDefault()
          revealGroup(href.slice(1))
        }}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
