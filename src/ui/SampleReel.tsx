import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
} from 'react'
import { engine } from '../engine/engine'
import { PEAK_BINS } from '../dsp/stages/sampler'
import { useBoardValue, useStoreValue } from './ControlsContext'
import styles from './SampleReel.module.css'
import { Tip } from './Tip'

// How near a marker the pointer has to land for the drag to be that marker
// rather than a seek, as a fraction of the reel's width. A marker is a
// hairline, and a hairline is not something a finger can hit.
const GRAB = 0.02
// The nearest the two markers may be dragged together by hand. Closer than this
// and the handles sit on top of each other, which is a window there is no way
// back out of with a pointer. The knobs in the panel go all the way.
const MIN_SPAN = 0.002

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

// Backwards, in the cold the Speed knob paints its bottom half. Forwards the
// head stays white: the tape under it is already lit in the accent, and a head
// the colour of the tape is a head you have to look for. One direction is the
// ordinary one and only the other needs saying.
const COLD = '#49b6ff'

function clock(secs: number): string {
  const s = Math.max(secs, 0)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

type Grab = 'in' | 'out' | 'head'

// What the pointer landed on: whichever marker it came down near, or the tape
// itself, which is a seek. The nearer marker wins, so two markers pinched
// together can still be told apart by the side you approach from.
function grabbed(at: number, from: number, to: number): Grab {
  const dIn = Math.abs(at - from)
  const dOut = Math.abs(at - to)
  if (Math.min(dIn, dOut) > GRAB) return 'head'
  return dIn <= dOut ? 'in' : 'out'
}

/** How long the reel is, in seconds, or 0 with no tape threaded. */
const useReelSeconds = () =>
  useSyncExternalStore(
    engine.meter.subscribe,
    () => engine.meter.get().sampleSecs,
  )

// The tape, drawn: what is on the reel, where the head is standing on it, and
// the two markers saying which stretch of it goes round. All of it on one
// canvas written to off the meter, the way the scope and the desk's meters are
// — the head moves every frame, and a React render per frame to shift a
// hairline is a panel the board can feel.
//
// The envelope comes back from the audio thread rather than being kept here off
// the file that was dropped, because the record head rewrites the tape under
// the play head every lap. A drawing made once at load would still be showing
// the recording twenty laps after the board had replaced it.
export function SampleReel() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const heading = useRef<HTMLSpanElement>(null)
  const secs = useReelSeconds()
  const name = useStoreValue(engine.sampleName)
  const level = useBoardValue(c => c.sampleLevel)
  const rec = useBoardValue(c => c.loopRec)
  const grab = useRef<Grab | null>(null)
  const threaded = secs > 0

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const g = el.getContext('2d')
    if (!g) return
    let raf = 0
    let painted = ''
    const draw = () => {
      raf = requestAnimationFrame(draw)
      // Sized to the box it landed in rather than stretched into it, the same
      // as the trace: a hairline is the one thing here you read a position off.
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(Math.round(el.clientWidth * dpr), 1)
      const h = Math.max(Math.round(el.clientHeight * dpr), 1)
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
      }
      const m = engine.meter.get()
      const c = engine.controls.get()
      // Two windows, and they are the same window until a wire off the bay
      // lands on the markers. What is lit is the tape that came round last
      // block, because that is what you are hearing; the handles stay on the
      // knobs, because that is what your hand set and what it can grab. A wire
      // running is the pair coming apart, which is what a wire looks like
      // everywhere else on the board.
      const from = m.sampleIn
      const to = m.sampleOut
      const handles = [
        Math.min(c.loopIn, c.loopOut),
        Math.max(c.loopIn, c.loopOut),
      ] as const
      const mid = h / 2
      const bw = Math.max(Math.round(w / PEAK_BINS), 1)

      g.fillStyle = '#0a0a0c'
      g.fillRect(0, 0, w, h)
      // Tape outside the markers is drawn grey rather than left out: it is
      // still on the reel and simply never passes the head, which is the whole
      // difference between trimming a loop and editing a file.
      for (let i = 0; i < PEAK_BINS; i++) {
        const at = (i + 0.5) / PEAK_BINS
        const v = Math.min(m.samplePeaks[i] ?? 0, 1)
        const bar = Math.max(v * (mid - 2 * dpr), 0.5 * dpr)
        g.fillStyle = at >= from && at < to ? '#ff5d3b' : '#3a3a40'
        g.fillRect(Math.round((i / PEAK_BINS) * w), mid - bar, bw, bar * 2)
      }
      g.strokeStyle = '#222226'
      g.lineWidth = dpr
      g.beginPath()
      g.moveTo(0, mid)
      g.lineTo(w, mid)
      g.stroke()

      // The markers, each with a shoulder at top and bottom turned into the
      // window — which is what says which side of the line the loop is on.
      g.fillStyle = '#ffb03b'
      for (const [i, at] of handles.entries()) {
        const side = i === 0 ? 1 : -1
        const x = Math.round(at * w)
        g.fillRect(x - dpr, 0, 2 * dpr, h)
        g.fillRect(x - dpr, 0, side * 7 * dpr, 4 * dpr)
        g.fillRect(x - dpr, h - 4 * dpr, side * 7 * dpr, 4 * dpr)
      }

      // The head. Dimmed and bare when the reel is standing still — a one-shot
      // that has run out, a fader down far enough that the stage is skipped, or
      // Speed parked at the stop in the middle of its travel. Moving, it grows
      // an arrow and a smear behind it, because the left half of that knob is
      // reverse rather than slow and the tape is the place to see which way it
      // is going.
      const speed = c.sampleSpeed
      const turning = m.samplePlaying && (level > 0 || rec > 0) && speed !== 0
      const hx = Math.round(m.samplePos * w)
      g.fillStyle = !turning ? '#5c5c63' : speed < 0 ? COLD : '#e8e8ea'
      if (turning) {
        const tail = (Math.min(Math.abs(speed), 4) / 4) * 26 * dpr
        g.globalAlpha = 0.25
        g.fillRect(speed > 0 ? hx - tail : hx, 0, tail, h)
        g.globalAlpha = 1
        const tip = 7 * dpr
        g.beginPath()
        g.moveTo(hx + Math.sign(speed) * tip, mid)
        g.lineTo(hx, mid - tip)
        g.lineTo(hx, mid + tip)
        g.fill()
      }
      g.fillRect(hx - dpr, 0, 2 * dpr, h)

      // The direction is its own span in the two colours the Speed knob uses,
      // because it is the one part of this line you read at a glance rather
      // than off the numbers.
      const way =
        speed === 0
          ? 'frozen'
          : `${Math.abs(speed).toFixed(2)}× ${speed < 0 ? 'reverse' : 'forward'}`
      const says = `${clock(m.samplePos * m.sampleSecs)} / ${clock(m.sampleSecs)} · loop ${clock((to - from) * m.sampleSecs)} · `
      if (readout.current && painted !== says + way) {
        painted = says + way
        readout.current.textContent = says
        if (heading.current) {
          heading.current.textContent = way
          heading.current.style.color =
            speed === 0
              ? 'var(--fg4)'
              : speed < 0
                ? 'var(--cool)'
                : 'var(--accent)'
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [threaded, level, rec])

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return clamp01((e.clientX - r.left) / r.width)
  }

  // A marker under the pointer writes the control it is; anywhere else drops
  // the head, which is a gesture rather than a control — where the tape has got
  // to is not something the board says.
  const track = (where: number) => {
    const held = grab.current
    if (held === null) return
    if (held === 'head') {
      engine.seekSample(where)
      return
    }
    const c = engine.controls.get()
    const other = held === 'in' ? c.loopOut : c.loopIn
    const pinned =
      where < other
        ? Math.min(where, other - MIN_SPAN)
        : Math.max(where, other + MIN_SPAN)
    engine.set(held === 'in' ? 'loopIn' : 'loopOut', clamp01(pinned))
  }

  if (!threaded) return null

  return (
    <div className={styles.wrap}>
      <Tip text="The reel: what is on the tape, where the play head stands, and the two markers saying which stretch goes round. Drag a marker to trim the loop — cross them and they swap — or drag the tape to move the head.">
        <canvas
          ref={canvas}
          className={styles.reel}
          onPointerDown={e => {
            const c = engine.controls.get()
            const where = at(e)
            grab.current = grabbed(
              where,
              Math.min(c.loopIn, c.loopOut),
              Math.max(c.loopIn, c.loopOut),
            )
            e.currentTarget.setPointerCapture(e.pointerId)
            track(where)
          }}
          onPointerMove={e => grab.current && track(at(e))}
          onPointerUp={() => (grab.current = null)}
          onPointerCancel={() => (grab.current = null)}
        />
      </Tip>
      <div className={styles.foot}>
        <span className={styles.name}>{name ?? 'blank tape'}</span>
        <span className={styles.time}>
          <span ref={readout} />
          <span ref={heading} />
        </span>
        {level <= 0 && rec <= 0 && (
          <span className={styles.down}>bring the sampler’s Level up</span>
        )}
        <Tip text="Put both markers back at the ends of the reel, so the whole of what you dropped goes round again.">
          <button
            className={styles.whole}
            onClick={() => engine.patch({ loopIn: 0, loopOut: 1 })}
          >
            whole reel
          </button>
        </Tip>
      </div>
    </div>
  )
}
