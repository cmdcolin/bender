import { useRef, useState } from 'react'
import { sameControls, type Controls } from '../controls'
import { engine } from '../engine/engine'
import type { Glide } from '../engine/glide'
import { useBoardValue } from './ControlsContext'
import type { MorphSeconds } from './morph'
import { PRESETS, presetPath, type PresetDef } from './presets'
import styles from './PresetRow.module.css'
import { Tip } from './Tip'

// Far enough that an ordinary click can wobble without scrubbing the board.
const DRAG_SLOP = 4
// Sideways travel for the whole trip, in pixels. A fixed distance rather than
// the chip's own width, so a narrow chip ("pinned") and a wide one ("squeezed
// screamer") scrub at the same rate — and the pointer is captured, so the drag
// carries on past either edge.
const DRAG_FULL = 140

// How many chips the row shows before you ask for the rest. Enough to browse
// without the panel's first screen being nothing but presets.
const COLLAPSED = 12

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

// How far along one preset's road the board is standing, and which road that
// was. `produced` is the exact board the last step wrote: while the live
// controls still equal it, the fill is telling the truth, and the moment a
// slider, a roll or a morph moves anything it stops — a board that has been
// touched since is not "40% of this preset" any more, and nothing can work out
// what it is instead.
interface Scrub {
  name: string
  from: Controls
  path: Glide
  t: number
  produced: Controls
}

function PresetChip(props: {
  def: PresetDef
  scrub: Scrub | null
  morphSeconds: MorphSeconds
  onScrub: (s: Scrub) => void
}) {
  // Gesture bookkeeping only — nothing in here should cause a render. The
  // position is integrated one pointer step at a time rather than read off the
  // pointer's place on the chip: absolute reading makes the result depend on
  // where in the chip the press landed, so a wobble during an ordinary click
  // would teleport the board halfway to the preset with nothing to say why.
  // Integrating also means a clamp at either end cannot bank travel the board
  // never made — run past the far end, turn around, and the fill turns with the
  // drag instead of after paying the overshoot back.
  //
  // `lastX` stays null until the press has travelled far enough to be a drag,
  // which is also what tells pointerup which of the two gestures it was.
  const drag = useRef<{
    pressX: number
    lastX: number | null
    t: number
    from: Controls
    path: Glide
  } | null>(null)

  // Re-grabbing a chip whose fill is still good continues along the road it is
  // already standing on, so dragging back down retraces to where the board was
  // before you touched it. Anything else starts a fresh road from here.
  const road = () => {
    const from = props.scrub?.from ?? engine.controls.get()
    return { from, path: props.scrub?.path ?? presetPath(props.def, from) }
  }

  const apply = () => {
    const { from, path } = road()
    const target = path.at(from, 1)
    engine.morphTo(target, props.morphSeconds)
    props.onScrub({ name: props.def.name, from, path, t: 1, produced: target })
  }

  return (
    <Tip
      text={`${props.def.blurb} — click for the whole board, or drag sideways to stop part way there`}
    >
      <button
        className={props.scrub === null ? styles.preset : styles.presetOn}
        // A drag is one gesture and wants one entry in the walk: arm here, and
        // the first write that moves anything takes the board as it stood before
        // the hand landed. A click banks its own step through morphTo instead,
        // which clears this one.
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          engine.armStep()
          drag.current = {
            pressX: e.clientX,
            lastX: null,
            t: props.scrub?.t ?? 0,
            ...road(),
          }
        }}
        onPointerMove={e => {
          const d = drag.current
          if (d === null) return
          // The slop is spent getting here, so the trip starts from this point
          // rather than jumping by however far the press had already drifted.
          const anchor =
            d.lastX === null && Math.abs(e.clientX - d.pressX) > DRAG_SLOP
              ? e.clientX
              : d.lastX
          if (anchor === null) return
          d.t = clamp01(d.t + (e.clientX - anchor) / DRAG_FULL)
          d.lastX = e.clientX
          // Over the live controls, as the morph does, so whatever a second hand
          // is holding — the body pad, the output level — survives the drag.
          const produced = d.path.at(engine.controls.get(), d.t)
          engine.writeBoard(produced)
          props.onScrub({
            name: props.def.name,
            from: d.from,
            path: d.path,
            t: d.t,
            produced,
          })
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (d !== null && d.lastX === null) apply()
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        // Pointerup is what applies a press, so the click trailing a mouse release
        // must not apply it twice. Keyboard activation fires a bare click with no
        // pointer events at all, and detail === 0 is what tells the two apart.
        onClick={e => {
          if (e.detail === 0) apply()
        }}
      >
        {props.scrub === null ? null : (
          <span
            className={styles.fill}
            style={{ transform: `scaleX(${props.scrub.t})` }}
          />
        )}
        <span className={styles.label}>{props.def.name}</span>
      </button>
    </Tip>
  )
}

// The row subscribes to the board itself rather than taking it as a prop: the
// fill is the only thing here that reads it, and holding it a level up would
// redraw the panel every frame a morph is in flight.
//
// One flag off the board rather than the board, for the same reason: what the
// row asks is whether the last step's board is still the one playing, and that
// answer changes once a gesture. Taking the whole board instead put every chip
// and its tip back through React on every frame of a thirty-second morph, to
// arrive at the same row.
export function Presets(props: { morphSeconds: MorphSeconds }) {
  const [scrub, setScrub] = useState<Scrub | null>(null)
  const [open, setOpen] = useState(false)
  const standing = useBoardValue(c =>
    scrub === null ? false : sameControls(c, scrub.produced),
  )
  const held = standing ? scrub : null

  const shown = open ? PRESETS : PRESETS.slice(0, COLLAPSED)
  // The chip you are standing on stays on the row even when it lives past the
  // fold: its fill is the only thing saying which board this is, and folding it
  // away would leave the row claiming you are on none of them.
  const stray =
    held !== null && !shown.some(p => p.name === held.name)
      ? PRESETS.find(p => p.name === held.name)
      : undefined
  const rest = PRESETS.length - shown.length - (stray ? 1 : 0)

  return (
    <div className={styles.presets}>
      {[...shown, ...(stray ? [stray] : [])].map(p => (
        <PresetChip
          key={p.name}
          def={p}
          scrub={held?.name === p.name ? held : null}
          morphSeconds={props.morphSeconds}
          onScrub={setScrub}
        />
      ))}
      <button
        className={styles.more}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? 'hide' : `show ${rest} more`}
      </button>
    </div>
  )
}
