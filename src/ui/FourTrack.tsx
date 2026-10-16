import { useEffect, useRef, useState } from 'react'

import { DEFAULT_CONTROLS } from '../controls'
import { PEAK_BINS } from '../dsp/stages/sampler'
import { engine } from '../engine/engine'
import { sliderFor, TRACK_NUMBERS, type Track } from './controls'
import { useBoardValue, useControlValue } from './ControlsContext'
import { STRIP_KEYS } from './diagram'
import { Fold } from './Fold'
import styles from './FourTrack.module.css'
import { ControlSlider } from './Slider'
import { StripDiagram } from './StripDiagram'
import { Tip } from './Tip'

import type { ControlKey, Controls } from '../controls'

const HEIGHT = 22
const MID = HEIGHT / 2

// The tape lit while that loop is somewhere you can hear it, grey while it is
// not; shed oxide in rust under it; the head white, and red while it records.
const LIT = '#ff5d3b'
const DIM = '#3a3a40'
const RUST = '#9a4a2a'
const HEAD = '#e8e8ea'
const HEAD_REC = '#ff3355'
const BG = '#0a0a0c'
const EMPTY = '#55555c'
const READOUT = '#a0a0a8'

const cue = (n: Track) => `four${n}Cue` as const
const fader = (n: Track) => `four${n}Fader` as const
const rec = (n: Track) => `four${n}Rec` as const
const input = (n: Track) => `four${n}In` as const

const heard = (c: Controls, n: Track) =>
  c.fourLevel > 0 && (c[cue(n)] > 0 || c[fader(n)] > 0)

function write(key: ControlKey, value: number) {
  engine.armStep()
  engine.set(key, value)
}

// One loop, drawn: what is on it, where its head stands and where its oxide has
// come away. A canvas written off the meter, as the sampler's reel is, so the
// head can move every frame without a React render.
function Reel({ track }: { track: Track }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const k = track - 1

  useEffect(() => {
    const el = canvas.current
    if (!el) return undefined
    const g = el.getContext('2d')
    if (!g) return undefined
    let raf = 0
    const draw = () => {
      raf = 0
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(Math.round(el.clientWidth * dpr), 1)
      const h = Math.max(Math.round(el.clientHeight * dpr), 1)
      if (el.width !== w || el.height !== h) {
        el.width = w
        el.height = h
      }
      const m = engine.meter.get()
      const c = engine.controls.get()
      g.fillStyle = BG
      g.fillRect(0, 0, w, h)
      g.font = `${10 * dpr}px ui-monospace, monospace`
      g.textBaseline = 'middle'
      const seconds = m.fourLaps[k]!
      if (seconds <= 0) {
        g.fillStyle = EMPTY
        const hint = 'empty · press rec to thread a loop'
        const fits = g.measureText(hint).width < w - 12 * dpr
        g.fillText(fits ? hint : 'empty', 6 * dpr, h / 2)
        return
      }
      const row = MID * dpr
      const bw = Math.max(w / PEAK_BINS, 1)
      const base = k * PEAK_BINS
      g.beginPath()
      for (let i = 0; i < PEAK_BINS; i++) {
        const v = Math.min(m.fourPeaks[base + i] ?? 0, 1)
        const bar = Math.max(v * (row - dpr), 0.5 * dpr)
        g.rect(i * bw, row - bar, bw, bar * 2)
      }
      g.fillStyle = heard(c, track) ? LIT : DIM
      g.fill()
      g.fillStyle = RUST
      for (let i = 0; i < PEAK_BINS; i++) {
        const d = m.fourShed[base + i] ?? 0
        if (d <= 0) continue
        g.globalAlpha = Math.min(0.25 + d, 1)
        g.fillRect(i * bw, h - 3 * dpr, bw, 3 * dpr)
      }
      g.globalAlpha = 1
      g.fillStyle = c[rec(track)] > 0 ? HEAD_REC : HEAD
      g.fillRect(m.fourHeads[k]! * w - dpr, 0, 2 * dpr, h)
      const says = `${seconds.toFixed(2)} s`
      const box = g.measureText(says).width + 8 * dpr
      g.fillStyle = BG
      g.globalAlpha = 0.75
      g.fillRect(w - box, 0, box, h)
      g.globalAlpha = 1
      g.fillStyle = READOUT
      g.textAlign = 'right'
      g.fillText(says, w - 4 * dpr, h / 2)
      g.textAlign = 'left'
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
  }, [k, track])

  return (
    <Tip text="The loop: what is on it, where its head stands, and in rust where the oxide has come away. Lit while you can hear it, through its fader or its cue.">
      <canvas ref={canvas} className={styles.reel} style={{ height: HEIGHT }} />
    </Tip>
  )
}

// A channel's lane: where it listens, whether it records, the loop it records
// onto and the fader that brings it to the bus. Everything else on the channel
// is behind its fold under the lanes, with a diagram of where it sits.
function Lane({
  track,
  shown,
  onPick,
}: {
  track: Track
  shown: boolean
  onPick: (track: Track) => void
}) {
  const source = sliderFor(input(track))
  const armed = useControlValue(rec(track)) > 0
  const listens = Math.round(useControlValue(input(track)))
  return (
    <div className={styles.lane}>
      <div className={styles.head}>
        <Tip
          text={`Open track ${track}’s channel strip: trim, EQ, aux send, pan, record, erase, cue and length.`}
        >
          <button
            className={shown ? styles.numberOn : styles.number}
            aria-label={`track ${track} strip`}
            onClick={() => onPick(track)}
          >
            {track}
          </button>
        </Tip>
        <Tip text={source.help}>
          <select
            className={styles.select}
            aria-label={`track ${track} input`}
            value={listens}
            onChange={e => write(input(track), Number(e.currentTarget.value))}
          >
            {source.choices!.map((name, i) => (
              <option key={name} value={i}>
                {`in: ${name}`}
              </option>
            ))}
          </select>
        </Tip>
        <Tip
          text={`Lay the channel onto loop ${track}. The first press threads a blank loop as long as its Length. What goes under the head stays there, so a loop is recorded over by every pass it takes.`}
        >
          <button
            className={armed ? styles.recOn : styles.rec}
            aria-pressed={armed}
            aria-label={`record track ${track}`}
            onClick={() => write(rec(track), armed ? 0 : 1)}
          >
            ● rec
          </button>
        </Tip>
        <Reel track={track} />
      </div>
      <ControlSlider def={sliderFor(fader(track))} label="Fader" />
    </div>
  )
}

// A choice that is two or three words wide, on the one row of the deck rather
// than a row of its own.
function Choice({ name }: { name: 'fourSpeed' | 'fourSide' | 'fourDbx' }) {
  const def = sliderFor(name)
  const value = Math.round(useControlValue(name))
  return (
    <span className={styles.choice}>
      <Tip text={def.help}>
        <span className={styles.choiceName}>{def.label}</span>
      </Tip>
      {def.choices!.map((c, i) => (
        <button
          key={c}
          className={value === i ? styles.pickOn : styles.pick}
          aria-pressed={value === i}
          onClick={() => write(name, i)}
        >
          {c}
        </button>
      ))}
    </span>
  )
}

// The four loops, each in a lane of its own, the deck's switches on one row and
// the channel strip under them. A four-track is four of the same strip, so the
// lanes are the part you reach for and the strip's knobs are the part you open.
export function FourTrack() {
  const [track, setTrack] = useState<Track>(
    () =>
      TRACK_NUMBERS.find(n =>
        STRIP_KEYS.some(
          k =>
            k.startsWith(`four${n}`) &&
            engine.controls.get()[k] !== DEFAULT_CONTROLS[k],
        ),
      ) ?? 1,
  )
  const [open, setOpen] = useState(() =>
    STRIP_KEYS.some(k => engine.controls.get()[k] !== DEFAULT_CONTROLS[k]),
  )
  const moved = useBoardValue(
    c => STRIP_KEYS.filter(k => c[k] !== DEFAULT_CONTROLS[k]).length,
  )
  return (
    <div className={styles.wrap}>
      {TRACK_NUMBERS.map(n => (
        <Lane
          key={n}
          track={n}
          shown={n === track && open}
          onPick={t => {
            setTrack(t)
            setOpen(true)
          }}
        />
      ))}
      <div className={styles.deck}>
        <Choice name="fourSpeed" />
        <Choice name="fourSide" />
        <Choice name="fourDbx" />
        <Tip text="Wipe all four loops and their wear, as a fresh cassette would be: the loops stay cut to the lengths they were.">
          <button
            className={styles.blank}
            onClick={() => engine.blankFourTrack()}
          >
            blank cassette
          </button>
        </Tip>
      </div>
      <Fold
        name="channel strip"
        badge={moved > 0 ? `${moved} moved` : `${STRIP_KEYS.length}`}
        moved={moved > 0}
        startOpen={false}
        open={open}
        onToggle={setOpen}
      >
        <div className={styles.tabs}>
          {TRACK_NUMBERS.map(n => (
            <button
              key={n}
              className={n === track ? styles.pickOn : styles.pick}
              aria-pressed={n === track}
              onClick={() => setTrack(n)}
            >
              track {n}
            </button>
          ))}
        </div>
        <StripDiagram key={track} track={track} />
      </Fold>
    </div>
  )
}
