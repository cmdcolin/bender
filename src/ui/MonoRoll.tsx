import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { engine } from '../engine/engine.ts'
import { isSharp, semitoneName } from '../notes.ts'
import {
  asTuneLen,
  HOLD,
  isNote,
  MONO_SEQ_STEP_KEYS,
  REST,
  TUNE_STEPS,
  voicing,
} from '../tune.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import { Tip } from './Tip.tsx'
import styles from './TuneRoll.module.css'
import { baseFor, cellClass, clampBase, isC, ROWS } from './tuneRoll.ts'

import type { RefObject } from 'react'

function useSeqPos(): number {
  return useSyncExternalStore(
    engine.meter.subscribe,
    () => engine.meter.get().monoSeqPos,
  )
}

function useSteps(): number[] {
  const packed = useBoardValue(c => MONO_SEQ_STEP_KEYS.map(k => c[k]).join(','))
  return packed.split(',').map(Number)
}

const wipe = () => {
  engine.armStep()
  engine.writeBoard({
    ...engine.controls.get(),
    ...Object.fromEntries(MONO_SEQ_STEP_KEYS.map(k => [k, REST])),
  })
}

// The mono synth's melody memory: one lane of the toy roll's grid, a row per
// pitch and a column per step. Drawing on it turns the memory on, so what the
// roll shows is what comes out of the synth.
export function MonoRoll() {
  const steps = useSteps()
  const len = asTuneLen(useControlValue('monoSeqLen'))
  const on = Math.round(useControlValue('monoSeqOn')) === 1
  const playing = useStoreValue(engine.songPlaying)
  const armed = useStoreValue(engine.seqRecord)
  const pos = useSeqPos()
  const [base, setBase] = useState(() => baseFor([steps]))
  const paint = useRef(false)
  const bars = voicing(steps)
  const under = playing && on ? pos % len : -1

  useEffect(() => {
    const done = () => {
      paint.current = false
    }
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
  }, [])

  const shift = (by: number) => setBase(b => clampBase(b + by))
  const written = bars.map(b => b.note).filter(isNote)
  const above = written.some(n => n > base + ROWS - 1)
  const below = written.some(n => n < base)
  const notes = Array.from({ length: ROWS }, (_, i) => base + ROWS - 1 - i)

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Tip text={playing ? 'Stop the song.' : 'Run the song.'}>
          <button
            className={playing ? styles.playOn : styles.play}
            aria-pressed={playing}
            onClick={() => engine.setSongPlaying(!playing)}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </Tip>
        <Tip
          text={
            on
              ? 'The memory plays through the mono synth while the song runs. Press to silence it; the steps stay.'
              : 'The memory is off. Press to play it through the mono synth while the song runs. Drawing a note turns it on too.'
          }
        >
          <button
            className={on ? styles.playOn : styles.play}
            aria-pressed={on}
            onClick={() => engine.set('monoSeqOn', on ? 0 : 1)}
          >
            {on ? 'on' : 'off'}
          </button>
        </Tip>
        <Tip
          text={
            !armed
              ? 'play the melody in: arm this and every key you press on the machine the memory plays — on screen, on the letter keys, on a controller — writes the step the counter is standing on. Arming puts the memory on and runs the song'
              : playing
                ? 'every key you press on that machine is going into the memory, and a key held across steps comes out as one long note. Press to stop'
                : 'armed, but the song is stopped — the keys sound and nothing is written. Run the song and they land on the step they arrive in'
          }
        >
          <button
            className={
              !armed ? styles.rec : playing ? styles.recOn : styles.recIdle
            }
            aria-pressed={armed}
            onClick={() => engine.armSeqRecord(!armed)}
          >
            record
          </button>
        </Tip>
        <Tip text="Wipe every step of the memory. One entry in the walk, so ctrl+z brings it back.">
          <button className={styles.verb} onClick={() => wipe()}>
            clear
          </button>
        </Tip>
        <span className={styles.spacer} />
        <Tip
          text={
            below
              ? 'Move the window down an octave. Lit because there are notes down there.'
              : 'Move the window down an octave.'
          }
        >
          <button
            className={below ? styles.octaveMore : styles.octave}
            onClick={() => shift(-12)}
            aria-label="window down an octave"
          >
            ▾
          </button>
        </Tip>
        <Tip
          text={
            above
              ? 'Move the window up an octave. Lit because there are notes up there.'
              : 'Move the window up an octave.'
          }
        >
          <button
            className={above ? styles.octaveMore : styles.octave}
            onClick={() => shift(12)}
            aria-label="window up an octave"
          >
            ▴
          </button>
        </Tip>
        <Tip
          text={
            len === TUNE_STEPS
              ? 'How many steps the memory plays before it comes round. All thirty-two is the whole of it.'
              : `The memory comes round every ${len} steps. The rest stay written, past the end.`
          }
        >
          <label className={styles.loop}>
            <span className={styles.loopLabel}>loop</span>
            <span className={styles.field}>
              <select
                className={len === TUNE_STEPS ? styles.len : styles.lenShort}
                value={len}
                onChange={e =>
                  engine.set('monoSeqLen', Number(e.currentTarget.value))
                }
                aria-label="loop length in steps"
              >
                {Array.from({ length: TUNE_STEPS }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1} {i === 0 ? 'step' : 'steps'}
                  </option>
                ))}
              </select>
              <span className={styles.chevron} aria-hidden="true">
                ▾
              </span>
            </span>
          </label>
        </Tip>
      </div>

      <Tip text="Click a cell to put that note on that step, and drag across to draw a line. Click a note again to take it off, and shift-click a step to hold the note before it.">
        <div className={styles.grid}>
          {notes.map(note => (
            <div key={note} className={styles.row}>
              <span className={styles.name}>
                {isC(note) ? semitoneName(note) : ''}
              </span>
              <div className={styles.cells}>
                {Array.from({ length: TUNE_STEPS }, (_, s) => {
                  const lit = bars[s]!.note === note
                  const head = lit && bars[s]!.head
                  return (
                    <Cell
                      key={s}
                      step={s}
                      note={note}
                      paint={paint}
                      on={lit}
                      head={head}
                      className={cellClass({
                        on: lit,
                        head,
                        ghost: false,
                        sharp: isSharp(note),
                        beat: s % 4 === 0,
                        under: s === under,
                        past: s >= len,
                        wrap: s === len,
                      })}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Tip>
    </div>
  )
}

const Cell = memo(function Cell(props: {
  step: number
  note: number
  on: boolean
  head: boolean
  className: string
  paint: RefObject<boolean>
}) {
  const { step, note, paint } = props
  const write = (value: number) => {
    if (engine.controls.get().monoSeqOn < 1) engine.set('monoSeqOn', 1)
    engine.set(MONO_SEQ_STEP_KEYS[step]!, value)
  }
  const put = (shift: boolean) => write(shift ? HOLD : props.head ? REST : note)
  return (
    <button
      className={props.className}
      aria-label={`${semitoneName(note)} step ${step + 1}`}
      aria-pressed={props.on}
      onPointerDown={e => {
        if (e.button === 0) {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
          engine.armStep()
          // oxlint-disable-next-line react/immutability -- paint is a ref the roll shares with every step
          paint.current = true
          put(e.shiftKey)
        }
      }}
      onPointerEnter={e => {
        if ((e.buttons & 1) !== 0 && paint.current && !props.head) write(note)
      }}
      onClick={e => {
        if (e.detail === 0) {
          engine.armStep()
          put(e.shiftKey)
        }
      }}
    />
  )
})
