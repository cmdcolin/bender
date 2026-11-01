import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { engine } from '../engine/engine.ts'
import { isPedal } from '../pedals.ts'
import { bench } from './bench.ts'
import { BendFace } from './BendFaces.tsx'
import { follow, pressIsClick } from './cableDrag.ts'
import { Socket } from './CableParts.tsx'
import { laid, type Point } from './cablePaths.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import {
  canLand,
  cordsFor,
  effectChain,
  inSays,
  landed,
  landingOf,
  outSays,
  type Cord,
  type Landing,
} from './effectCords.ts'
import styles from './EffectShelf.module.css'
import cables from './GateCables.module.css'
import { PedalFace } from './Pedals.tsx'
import { Tip } from './Tip.tsx'

const CORD_COLOUR = '#8b929c'
const DROP = 13
const ORDER_PANEL = 'Signal order'

interface Box {
  stage: string
  x: number
  top: number
  bottom: number
  left: number
  right: number
}

function useEffectFaces() {
  const { pedals, bends } = useStoreValue(bench)
  const shown = [...bends, ...pedals]
  const chain = useBoardValue(c => effectChain(c).join('|')).split('|')
  const placed = chain.filter(stage => shown.includes(stage))
  const loose = bends.filter(stage => !chain.includes(stage))
  return { placed, loose, cords: cordsFor(chain, placed) }
}

function measure(root: HTMLElement): Box[] {
  const origin = root.getBoundingClientRect()
  return [...root.querySelectorAll<HTMLElement>('[data-face]')].map(el => {
    const r = el.getBoundingClientRect()
    return {
      stage: el.dataset.face ?? '',
      x: Math.round(r.left + r.width / 2 - origin.left),
      top: Math.round(r.top - origin.top),
      bottom: Math.round(r.bottom - origin.top),
      left: Math.round(r.left - origin.left),
      right: Math.round(r.right - origin.left),
    }
  })
}

function route(a: Box, b: Box): Point[] {
  const out = { x: a.x, y: a.bottom }
  const into = { x: b.x, y: b.top }
  const gapX = b.left > a.right ? (a.right + b.left) / 2 : a.right + 8
  return Math.abs(out.x - into.x) < 2 && into.y > out.y
    ? [out, into]
    : [
        out,
        { x: out.x, y: out.y + DROP },
        { x: gapX, y: out.y + DROP },
        { x: gapX, y: into.y - DROP },
        { x: into.x, y: into.y - DROP },
        into,
      ]
}

type Side = Landing['side']

interface Held {
  stage: string
  side: Side
  at: Point
}

type Grab = (e: ReactPointerEvent, stage: string, side: Side) => void

const jackAt = (box: Box, side: Side) => ({
  x: box.x,
  y: side === 'in' ? box.top : box.bottom,
})

function CordJack({
  side,
  cord,
  at,
  held,
  onGrab,
  onOpen,
}: {
  side: Side
  cord: Cord
  at: Point
  held: Held | null
  onGrab: Grab
  onOpen: (stage: string) => void
}) {
  const stage = side === 'in' ? cord.to : cord.from
  const says = side === 'in' ? inSays(cord) : outSays(cord)
  return (
    <Tip
      text={`${says} Drag it onto an IN jack to move ${stage} just before that pedal, or onto an OUT jack for just after. Press to open the signal order.`}
    >
      <button
        type="button"
        className={styles.jack}
        style={{ left: at.x, top: at.y }}
        data-cord={`${side}:${stage}`}
        aria-label={`${stage} ${side}. ${says}`}
        onPointerDown={e => onGrab(e, stage, side)}
        onClick={() => {
          if (pressIsClick()) onOpen(ORDER_PANEL)
        }}
      >
        <Socket
          colour={CORD_COLOUR}
          target={held !== null && canLand(held.stage, stage)}
        />
      </button>
    </Tip>
  )
}

function HeldCord({ from, to }: { from: Point; to: Point }) {
  const d = `M${from.x} ${from.y} L${to.x} ${to.y}`
  return (
    <g className={cables.cable} style={{ ['--cable' as string]: CORD_COLOUR }}>
      <path className={cables.sheath} d={d} />
      <path className={cables.core} d={d} />
      <circle className={styles.plug} cx={to.x} cy={to.y} r="5.6" />
    </g>
  )
}

function Cords({
  boxes,
  cords,
  held,
  onGrab,
  onOpen,
}: {
  boxes: readonly Box[]
  cords: readonly Cord[]
  held: Held | null
  onGrab: Grab
  onOpen: (stage: string) => void
}) {
  const boxOf = new Map(boxes.map(b => [b.stage, b]))
  const heldBox = held && boxOf.get(held.stage)
  return (
    <div className={styles.overlay}>
      {cords.flatMap(cord => {
        const into = boxOf.get(cord.to)
        const outOf = boxOf.get(cord.from)
        return [
          ...(outOf
            ? [
                <CordJack
                  key={`out:${cord.from}`}
                  side="out"
                  cord={cord}
                  at={jackAt(outOf, 'out')}
                  held={held}
                  onGrab={onGrab}
                  onOpen={onOpen}
                />,
              ]
            : []),
          ...(into
            ? [
                <CordJack
                  key={`in:${cord.to}`}
                  side="in"
                  cord={cord}
                  at={jackAt(into, 'in')}
                  held={held}
                  onGrab={onGrab}
                  onOpen={onOpen}
                />,
              ]
            : []),
        ]
      })}
      <svg className={styles.cords} aria-hidden="true">
        {cords.map(cord => {
          const a = boxOf.get(cord.from)
          const b = boxOf.get(cord.to)
          if (a && b) {
            const path = laid(route(a, b))
            return (
              <g
                key={`${cord.from}>${cord.to}`}
                className={cables.cable}
                style={{ ['--cable' as string]: CORD_COLOUR }}
              >
                <path className={cables.sheath} d={path.d} />
                <path className={cables.core} d={path.d} />
                <path className={cables.sheen} d={path.d} />
                <polygon
                  className={cables.arrow}
                  points="-5,-4 5,0 -5,4"
                  transform={`translate(${path.arrow.x} ${path.arrow.y}) rotate(${path.arrow.angle})`}
                />
                <circle
                  className={styles.plug}
                  cx={a.x}
                  cy={a.bottom}
                  r="4.6"
                />
                <circle className={styles.plug} cx={b.x} cy={b.top} r="4.6" />
              </g>
            )
          }
          return null
        })}
        {held && heldBox && (
          <HeldCord from={jackAt(heldBox, held.side)} to={held.at} />
        )}
      </svg>
    </div>
  )
}

export function EffectShelf({
  className,
  before,
  seconds,
  onOpen,
}: {
  className?: string
  before: ReactNode
  seconds: number
  onOpen: (stage: string) => void
}) {
  const { placed, loose, cords } = useEffectFaces()
  const root = useRef<HTMLDivElement>(null)
  const [boxes, setBoxes] = useState<Box[]>([])
  useLayoutEffect(() => {
    const el = root.current
    let frame = 0
    const lay = () => {
      if (el) {
        const next = measure(el)
        setBoxes(prev =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
        )
      }
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(lay)
    }
    const sizes = new ResizeObserver(later)
    const rewatch = () => {
      sizes.disconnect()
      if (el) {
        sizes.observe(el)
        for (const face of el.querySelectorAll('[data-face]'))
          sizes.observe(face)
      }
      later()
    }
    const moves = new MutationObserver(rewatch)
    if (el) moves.observe(el, { childList: true })
    rewatch()
    lay()
    return () => {
      cancelAnimationFrame(frame)
      sizes.disconnect()
      moves.disconnect()
    }
  }, [])

  const [held, setHeld] = useState<Held | null>(null)
  const grab: Grab = (e, stage, side) =>
    follow(
      e,
      at => setHeld(at ? { stage, side, at } : null),
      over => {
        const onto = landingOf(over?.dataset.cord)
        const next = onto && landed(engine.controls.get(), stage, onto)
        if (next) {
          engine.armStep()
          engine.writeBoard(next)
        }
      },
      { frame: '[data-cabled]', target: '[data-cord]' },
    )

  const face = (stage: string) =>
    isPedal(stage) ? (
      <PedalFace key={stage} stage={stage} seconds={seconds} onOpen={onOpen} />
    ) : (
      <BendFace key={stage} stage={stage} seconds={seconds} onOpen={onOpen} />
    )

  return (
    <div
      ref={root}
      className={[className, styles.cabled].filter(Boolean).join(' ')}
      data-cabled={placed.length > 0}
    >
      {before}
      {placed.map(stage => face(stage))}
      {loose.map(stage => face(stage))}
      <Cords
        boxes={boxes.filter(b => placed.includes(b.stage))}
        cords={cords}
        held={held}
        onGrab={grab}
        onOpen={onOpen}
      />
    </div>
  )
}
