import { useState } from 'react'

import { YOURS } from '../dsp/stages/roms.ts'
import { engine } from '../engine/engine.ts'
import { SEQ_DESTS } from '../engine/messages.ts'
import { asTuneLen, isNote, TUNE_STEPS, voicing } from '../tune.ts'
import { bench, setBench } from './bench.ts'
import {
  useBoardValue,
  useControlValue,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './MiniRoll.module.css'
import { Tip } from './Tip.tsx'
import {
  useLanes,
  useLinePlaying,
  useSeqPos,
  useSteps,
  useTunePos,
} from './tuneRoll.ts'

import type { NoteDest, SeqDest } from '../engine/messages.ts'

// An octave, so one note reads as a dash rather than as a bar the full height.
const MIN_ROWS = 13

const BEATS = Array.from({ length: TUNE_STEPS / 4 - 1 }, (_, i) => (i + 1) * 4)

interface Span {
  note: number
  from: number
  to: number
}

// Each held note as one bar across the steps it sounds for.
function spans(steps: readonly number[]): Span[] {
  const out: Span[] = []
  voicing(steps).forEach(({ note, head }, s) => {
    if (!isNote(note)) return
    const last = out.at(-1)
    if (!head && last && last.note === note && last.to === s) last.to = s + 1
    else out.push({ note, from: s, to: s + 1 })
  })
  return out
}

interface Props {
  dest: NoteDest
  onOpen?: (stage: string) => void
}

// The melody memory a bed records into, in miniature on its deck: the notes as
// they land and the step the counter is on, so a press of rec shows it working.
export function MiniRoll({ dest, onOpen }: Props) {
  return dest === 'toy' ? (
    <TuneMini onOpen={onOpen} />
  ) : (
    <SeqMini dest={dest} onOpen={onOpen} />
  )
}

function TuneMini({ onOpen }: Omit<Props, 'dest'>) {
  const mine = useBoardValue(c => Math.round(c.chipTune) === YOURS)
  const lanes = useLanes()
  const len = asTuneLen(useControlValue('tuneLen'))
  const pos = useTunePos()
  const playing = useStoreValue(engine.songPlaying)
  const armed = useStoreValue(engine.tuneRecord)
  if (!mine && !armed) return null
  return (
    <Strip
      lanes={lanes}
      len={len}
      pos={pos}
      playing={playing}
      armed={armed}
      memory="tune"
      stage="Plinky"
      onOpen={onOpen}
    />
  )
}

function SeqMini({ dest, onOpen }: Props & { dest: SeqDest }) {
  const here = useBoardValue(
    c =>
      Math.round(c.monoSeqOn) === 1 &&
      SEQ_DESTS[Math.round(c.monoSeqTo)] === dest,
  )
  const steps = useSteps()
  const len = asTuneLen(useControlValue('monoSeqLen'))
  const pos = useSeqPos()
  const playing = useLinePlaying()
  const armed = useStoreValue(engine.seqRecord)
  if (!here) return null
  return (
    <Strip
      lanes={[steps]}
      len={len}
      pos={pos}
      playing={playing}
      armed={armed}
      memory="seq"
      stage="Growler"
      onOpen={onOpen}
    />
  )
}

function Strip({
  lanes,
  len,
  pos,
  playing,
  armed,
  memory,
  stage,
  onOpen,
}: {
  lanes: number[][]
  len: number
  pos: number
  playing: boolean
  armed: boolean
  memory: 'tune' | 'seq'
  stage: string
  onOpen?: (stage: string) => void
}) {
  const recording = armed && playing
  const taken = useStoreValue(engine.noteTaken)
  // A note taken before the strip mounted is old news, not one to flash.
  const [old] = useState(taken)
  const fresh = taken !== old && taken?.memory === memory ? taken : null
  const under = playing ? pos % len : -1
  const bars = lanes.flatMap(spans)
  const notes = bars.map(b => b.note)
  const lo = Math.min(...notes, Infinity)
  const hi = Math.max(...notes, -Infinity)
  const span = notes.length === 0 ? 0 : hi - lo + 1
  const rows = Math.max(span, MIN_ROWS)
  const top = notes.length === 0 ? 0 : hi + Math.floor((rows - span) / 2)

  const drawing = (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${TUNE_STEPS} ${rows}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {BEATS.map(x => (
        <line key={x} className={styles.beat} x1={x} x2={x} y1={0} y2={rows} />
      ))}
      {len < TUNE_STEPS && (
        <rect
          className={styles.past}
          x={len}
          width={TUNE_STEPS - len}
          height={rows}
        />
      )}
      {under >= 0 && (
        <rect
          className={recording ? styles.headRec : styles.head}
          x={under}
          width={1}
          height={rows}
        />
      )}
      {fresh && (
        <rect
          key={fresh.at}
          className={styles.taken}
          x={fresh.step}
          width={1}
          height={rows}
        />
      )}
      {bars.map(b => (
        <line
          key={`${b.note}@${b.from}`}
          className={
            under >= b.from && under < b.to ? styles.noteOn : styles.note
          }
          x1={b.from + 0.1}
          x2={b.to - 0.1}
          y1={top - b.note + 0.5}
          y2={top - b.note + 0.5}
        />
      ))}
    </svg>
  )
  const frame = recording ? styles.rec : armed ? styles.recIdle : styles.roll

  if (!onOpen)
    return (
      <span className={frame} aria-hidden="true">
        {drawing}
      </span>
    )
  return (
    <Tip
      text={
        recording
          ? 'Recording: every key you press lands on the step under the playhead. Opens the piano roll.'
          : armed
            ? 'Armed, but the memory is stopped, so nothing is written. Opens the piano roll.'
            : 'The melody memory in miniature. Opens the piano roll.'
      }
    >
      <button
        className={frame}
        aria-label="open the piano roll"
        onClick={() => {
          setBench({ ...bench.get(), roll: true })
          onOpen(stage)
        }}
      >
        {drawing}
      </button>
    </Tip>
  )
}
