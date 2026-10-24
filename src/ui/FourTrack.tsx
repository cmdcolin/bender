import { useEffect, useRef, useState } from 'react'

import { DEFAULT_CONTROLS } from '../controls.ts'
import { PEAK_BINS } from '../dsp/stages/sampler.ts'
import { engine } from '../engine/engine.ts'
import {
  choiceValue,
  sliderFor,
  TRACK_NUMBERS,
  type Track,
} from './controls/index.ts'
import { useBoardValue, useControlValue } from './ControlsContext.ts'
import { STRIP_KEYS } from './diagram.ts'
import { Dial } from './Dial.tsx'
import { Fold } from './Fold.tsx'
import styles from './FourTrack.module.css'
import { useOnAim } from './reveal.ts'
import { useMovedCount } from './rollBack.ts'
import { StripDiagram } from './StripDiagram.tsx'
import { Tip } from './Tip.tsx'

import type { ControlKey, Controls } from '../controls.ts'

const HEIGHT = 16
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

type StripKnob = 'Trim' | 'Send' | 'High' | 'Mid' | 'MidHz' | 'Low' | 'Pan'

const cue = (n: Track) => `four${n}Cue` as const
const fader = (n: Track) => `four${n}Fader` as const
const rec = (n: Track) => `four${n}Rec` as const
const input = (n: Track) => `four${n}In` as const

const heard = (c: Controls, n: Track) =>
  c.fourLevel > 0 && (c[cue(n)] > 0 || c[fader(n)] > 0)

// A loop with nothing on it that hears only itself has nothing to record, so the
// first arm on one also points the channel at the board: one press does
// something, where the input would otherwise have to be known about first.
function arm(track: Track, armed: boolean, listens: number) {
  engine.armStep()
  if (
    !armed &&
    listens === choiceValue(input(track), 'tape') &&
    engine.meter.get().fourLaps[track - 1]! <= 0
  )
    engine.set(input(track), choiceValue(input(track), 'board'))
  engine.set(rec(track), armed ? 0 : 1)
}

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

// One channel of the desk, top to bottom as a mixer lays it out: where it
// listens, preamp and aux send, the three EQ bands with the sweepable mid's
// frequency, pan and fader. The loop it records onto is in its lane under the
// desk.
function Strip({
  track,
  shown,
  onPick,
}: {
  track: Track
  shown: boolean
  onPick: (track: Track) => void
}) {
  const source = sliderFor(input(track))
  const listens = Math.round(useControlValue(input(track)))
  const dial = (name: StripKnob, short?: string) => (
    <Dial def={sliderFor(`four${track}${name}` as const)} short={short} />
  )
  return (
    <div
      className={styles.strip}
      role="group"
      aria-label={`track ${track} channel`}
    >
      <div className={styles.head}>
        <Tip
          text={`Open track ${track}’s signal path: trim, EQ, aux send, pan, record, erase, cue and length.`}
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
            data-control={input(track)}
            aria-label={`track ${track} input`}
            value={listens}
            onChange={e => write(input(track), Number(e.currentTarget.value))}
          >
            {source.choices!.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </Tip>
      </div>
      <div className={styles.knobs}>
        {dial('Trim')}
        {dial('Send', 'Aux')}
        {dial('High')}
        {dial('Mid')}
        {dial('MidHz', 'Freq')}
        {dial('Low')}
      </div>
      <div className={styles.out}>
        {dial('Pan')}
        <Dial def={sliderFor(fader(track))} fader />
      </div>
    </div>
  )
}

// A channel's lane: the loop it records onto, the arm that lays the channel on
// it, and the tape drawn between.
function Lane({ track }: { track: Track }) {
  const armed = useControlValue(rec(track)) > 0
  const listens = Math.round(useControlValue(input(track)))
  return (
    <div className={styles.lane}>
      <span className={styles.laneNumber}>{track}</span>
      <Tip
        text={`Lay the channel onto loop ${track}. The first press threads a blank loop as long as its Length, and on an empty loop that hears only itself it points the channel at the board. What goes under the head stays there, so a loop is recorded over by every pass it takes.`}
      >
        <button
          className={armed ? styles.recOn : styles.rec}
          data-control={rec(track)}
          aria-pressed={armed}
          aria-label={`record track ${track}`}
          onClick={() => arm(track, armed, listens)}
        >
          ● rec
        </button>
      </Tip>
      <Reel track={track} />
    </div>
  )
}

// A choice that is two or three words wide, on the one row of the deck rather
// than a row of its own.
function Choice({ name }: { name: 'fourSpeed' | 'fourSide' | 'fourDbx' }) {
  const def = sliderFor(name)
  const value = Math.round(useControlValue(name))
  return (
    <span className={styles.choice} data-control={name}>
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

const STRIP_OPENERS = STRIP_KEYS.filter(k => /(Erase|Cue|Len)$/.test(k))

const firstMoved = (c: Controls): Track | undefined =>
  TRACK_NUMBERS.find(n =>
    STRIP_OPENERS.some(
      k => k.startsWith(`four${n}`) && c[k] !== DEFAULT_CONTROLS[k],
    ),
  )

// The four loops, each in a lane of its own, the deck's switches on one row and
// the channel strip under them. A four-track is four of the same strip, so the
// lanes are the part you reach for and the strip's knobs are the part you open.
export function FourTrack() {
  const [track, setTrack] = useState<Track>(
    () => firstMoved(engine.controls.get()) ?? 1,
  )
  const [open, setOpen] = useState(
    () => firstMoved(engine.controls.get()) !== undefined,
  )
  const moved = useMovedCount(STRIP_KEYS)
  // A strip knob going off stock from somewhere the strip is not — a setting, a
  // roll, a link — opens the strip on the channel it moved, so what a press just
  // did is on screen. The record arm is left out: it is a lane control and
  // pressing it is not a reason to open anything.
  const hidden = useBoardValue(
    c => STRIP_OPENERS.filter(k => c[k] !== DEFAULT_CONTROLS[k]).length,
  )
  useOnAim(key => {
    const n = TRACK_NUMBERS.find(t => key.startsWith(`four${t}`))
    if (n === undefined || !STRIP_KEYS.some(k => k === key)) return
    setTrack(n)
    setOpen(true)
  })
  const [seen, setSeen] = useState(hidden)
  if (hidden !== seen) {
    setSeen(hidden)
    if (seen === 0 && hidden > 0) {
      setOpen(true)
      setTrack(firstMoved(engine.controls.get()) ?? track)
    }
  }
  return (
    <div className={styles.wrap}>
      <div className={styles.desk}>
        {TRACK_NUMBERS.map(n => (
          <Strip
            key={n}
            track={n}
            shown={n === track && open}
            onPick={t => {
              setTrack(t)
              setOpen(true)
            }}
          />
        ))}
      </div>
      <div className={styles.lanes}>
        {TRACK_NUMBERS.map(n => (
          <Lane key={n} track={n} />
        ))}
      </div>
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
        badge={moved > 0 ? `${moved} moved` : undefined}
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
