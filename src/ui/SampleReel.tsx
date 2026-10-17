import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { PEAK_BINS } from '../dsp/stages/sampler.ts'
import { engine } from '../engine/engine.ts'
import { useBoardValue } from './ControlsContext.ts'
import styles from './SampleReel.module.css'
import { Tip } from './Tip.tsx'

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

const WHEELS = 4

function wheels(secs: number): string {
  return String(
    Math.min(Math.floor(Math.max(secs, 0)), 10 ** WHEELS - 1),
  ).padStart(WHEELS, '0')
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

const fractionAcross = (e: PointerEvent<HTMLCanvasElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  return clamp01((e.clientX - r.left) / r.width)
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
export function SampleReel({ children }: { children?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const digits = useRef<(HTMLSpanElement | null)[]>([])
  const heading = useRef<HTMLSpanElement>(null)
  const secs = useReelSeconds()
  const level = useBoardValue(c => c.sampleLevel)
  const rec = useBoardValue(c => c.loopRec)
  const trimmed = useBoardValue(c => c.loopIn > 0 || c.loopOut < 1)
  const grab = useRef<Grab | null>(null)
  const threaded = secs > 0

  useEffect(() => {
    const el = canvas.current
    if (!el) return undefined
    const g = el.getContext('2d')
    if (!g) return undefined
    let raf = 0
    let painted = ''
    // What the last frame drew from. The meter posts sixty times a second
    // whether or not the tape moved, and a reel standing still redraws nothing.
    const drawn = new Float64Array(10).fill(Number.NaN)
    const drawnPeaks = new Float32Array(PEAK_BINS)
    const unchanged = (now: Float64Array, peaks: Float32Array) => {
      let same = true
      for (let i = 0; i < now.length; i++) {
        if (drawn[i] !== now[i]) same = false
        drawn[i] = now[i]!
      }
      for (let i = 0; i < PEAK_BINS; i++) {
        const v = peaks[i] ?? 0
        if (drawnPeaks[i] !== v) same = false
        drawnPeaks[i] = v
      }
      return same
    }
    const inputs = new Float64Array(10)
    const draw = () => {
      raf = 0
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(Math.round(el.clientWidth * dpr), 1)
      const h = Math.max(Math.round(el.clientHeight * dpr), 1)
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
        drawn.fill(Number.NaN)
      }
      const m = engine.meter.get()
      const c = engine.controls.get()
      inputs[0] = w
      inputs[1] = h
      inputs[2] = m.samplePos
      inputs[3] = m.sampleIn
      inputs[4] = m.sampleOut
      inputs[5] = c.loopIn
      inputs[6] = c.loopOut
      inputs[7] = c.sampleSpeed
      inputs[8] = m.samplePlaying ? 1 : 0
      inputs[9] = m.sampleSecs
      if (unchanged(inputs, m.samplePeaks)) return
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
      //
      // Two passes and two fills rather than two hundred and fifty-six: the
      // envelope is only ever drawn in the two colours, and a rect laid into a
      // path costs a fraction of one handed over as its own draw.
      const bars = (lit: boolean, colour: string) => {
        g.beginPath()
        for (let i = 0; i < PEAK_BINS; i++) {
          const at = (i + 0.5) / PEAK_BINS
          if ((at >= from && at < to) === lit) {
            const v = Math.min(m.samplePeaks[i] ?? 0, 1)
            const bar = Math.max(v * (mid - 2 * dpr), 0.5 * dpr)
            g.rect(Math.round((i / PEAK_BINS) * w), mid - bar, bw, bar * 2)
          }
        }
        g.fillStyle = colour
        g.fill()
      }
      bars(false, '#3a3a40')
      bars(true, '#ff5d3b')
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

      // The counter reads whole seconds into the reel, the way a deck's
      // wheels count turns; the direction under it uses the Speed knob's two
      // colours, because it is the part read at a glance.
      const stopped = (level <= 0 && rec <= 0) || speed === 0
      const way = stopped
        ? '■'
        : `${speed < 0 ? '◀' : '▶'}${Math.abs(speed) === 1 ? '' : ` ${Math.abs(speed).toFixed(2)}×`}`
      const says = wheels(m.samplePos * m.sampleSecs)
      if (painted !== says + way) {
        painted = says + way
        for (const [i, wheel] of digits.current.entries()) {
          if (wheel) wheel.textContent = says[i] ?? '0'
        }
        if (heading.current) {
          heading.current.textContent = way
          heading.current.style.color = stopped
            ? 'var(--fg4)'
            : speed < 0
              ? 'var(--cool)'
              : 'var(--accent)'
        }
      }
    }
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(draw)
    }
    const offMeter = engine.meter.subscribe(schedule)
    const offControls = engine.controls.subscribe(schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    schedule()
    return () => {
      offMeter()
      offControls()
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the canvas only mounts once a tape is threaded, so the effect has to rerun then
  }, [threaded, level, rec])

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

  const foot =
    children || trimmed ? (
      <div className={styles.foot}>
        {children}
        {trimmed && (
          <Tip text="Put both markers back at the ends of the reel, so the whole of what you dropped goes round again.">
            <button
              className={styles.whole}
              onClick={() => engine.patch({ loopIn: 0, loopOut: 1 })}
            >
              whole reel
            </button>
          </Tip>
        )}
      </div>
    ) : null

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <Tip text="The reel: what is on the tape, where the play head stands, and the two markers saying which stretch goes round. Drag a marker to trim the loop — cross them and they swap — or drag the tape to move the head.">
          <canvas
            ref={canvas}
            className={styles.reel}
            onPointerDown={e => {
              const c = engine.controls.get()
              const where = fractionAcross(e)
              grab.current = grabbed(
                where,
                Math.min(c.loopIn, c.loopOut),
                Math.max(c.loopIn, c.loopOut),
              )
              e.currentTarget.setPointerCapture(e.pointerId)
              track(where)
            }}
            onPointerMove={e => grab.current && track(fractionAcross(e))}
            onPointerUp={() => (grab.current = null)}
            onPointerCancel={() => (grab.current = null)}
          />
        </Tip>
        <Tip text="Tape counter: whole seconds into the reel. Below it, the direction and speed.">
          <div className={styles.counter}>
            <div className={styles.wheels}>
              {Array.from({ length: WHEELS }, (_, i) => (
                <span
                  key={i}
                  className={styles.wheel}
                  ref={el => {
                    digits.current[i] = el
                  }}
                >
                  0
                </span>
              ))}
            </div>
            <span ref={heading} className={styles.way} />
          </div>
        </Tip>
      </div>
      {foot}
    </div>
  )
}
