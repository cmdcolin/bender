import { engine } from '../engine/engine.ts'
import {
  isNote,
  MONO_SEQ_STEP_KEYS,
  NOTE_HI,
  NOTE_LO,
  TUNE_ALL_STEP_KEYS,
  TUNE_LANE_KEYS,
  TUNE_STEPS,
} from '../tune.ts'
import {
  useBoardValue,
  useMeterValue,
  useStoreValue,
} from './ControlsContext.ts'
import styles from './TuneRoll.module.css'

// Where each memory's counter is standing. It only moves when a step does, so a
// roll redraws at the tune's rate rather than at the meter's.
export const useTunePos = () => useMeterValue(m => m.tunePos)
export const useSeqPos = () => useMeterValue(m => m.monoSeqPos)

/** Whether the second melody's counter is running: the kit's run line when it
    is synced to the kit, the song's otherwise. */
export function useLinePlaying() {
  const synced = useBoardValue(c => c.monoSeqSync !== 0)
  const song = useStoreValue(engine.songPlaying)
  const drums = useStoreValue(engine.drumsPlaying)
  return synced ? drums : song
}

// Ninety-six numbers read through one subscription rather than ninety-six. What
// the board hands back has to be comparable with Object.is or every write to any
// control redraws the roll, so the steps travel as a string and come back as
// numbers.
export function useLanes(): number[][] {
  const packed = useBoardValue(c => TUNE_ALL_STEP_KEYS.map(k => c[k]).join(','))
  const flat = packed.split(',').map(Number)
  return TUNE_LANE_KEYS.map((_, lane) =>
    flat.slice(lane * TUNE_STEPS, (lane + 1) * TUNE_STEPS),
  )
}

export function useSteps(): number[] {
  const packed = useBoardValue(c => MONO_SEQ_STEP_KEYS.map(k => c[k]).join(','))
  return packed.split(',').map(Number)
}

// How much of the keyboard the roll shows at once. Two octaves is what a toy
// melody stays inside of and what fits the panel without the grid becoming the
// whole of it; the rest of the memory's reach is a press away on the octave
// buttons, and the window opens on what you played.
export const ROWS = 24
const TOP_BASE = Math.max(NOTE_HI - ROWS + 1, NOTE_LO)

// C, in the chip's counting — its zero note is A, so a C is three semitones up.
export const isC = (note: number) => ((note % 12) + 12) % 12 === 3

// The window's bottom, snapped to a C so the rows read as octaves rather than
// as wherever the lowest note you played happened to land.
const octaveFloor = (note: number) => Math.floor((note - 3) / 12) * 12 + 3

export const clampBase = (note: number) =>
  Math.min(Math.max(note, NOTE_LO), TOP_BASE)

export const baseFor = (lanes: number[][]) => {
  const notes = lanes.flat().filter(isNote)
  return clampBase(octaveFloor(notes.length === 0 ? -9 : Math.min(...notes)))
}

export function cellClass(s: {
  on: boolean
  head: boolean
  ghost: boolean
  sharp: boolean
  beat: boolean
  under: boolean
  past: boolean
  wrap: boolean
}): string {
  return [
    s.on ? (s.head ? styles.headOn : styles.holdOn) : styles.cell,
    s.ghost && styles.ghost,
    s.sharp && styles.sharp,
    s.beat && styles.beat,
    s.under && styles.under,
    s.past && styles.past,
    s.wrap && styles.wrapLine,
  ]
    .filter(Boolean)
    .join(' ')
}
