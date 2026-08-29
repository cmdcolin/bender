import type { ControlKey, Controls } from '../../controls'
import { type SliderDef, sliderFor, snapToStep } from '../controls'

// Note lengths as a fraction of a beat: sixteenth up to a bar, with the
// triplets and the dotted values in between.
const NOTE_BEATS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3, 4]

// Controls that count in time rather than in pitch or in level. A nudge moves
// them as freely as anything else and then puts them back down on the grid, so
// the delay lands on a dotted eighth, the slice on a sixteenth and the roll on
// a division of the step.
const BEAT_MS: ControlKey[] = ['delayMs', 'glitchSliceMs']
const BEAT_HZ: ControlKey[] = ['drumRetrigHz', 'modLfoHz', 'chipArpHz']

// Past this the sequencer is a buzz rather than a pulse, so there is no beat to
// be in time with and the timed controls go back to roaming.
const MAX_MUSICAL_BPM = 600

// The toy runs off its own crystal, so a nudge can still send it somewhere else
// entirely — but it lands on a simple ratio, where the tune still lines up with
// the kit. The same knob is the pitch, so those ratios are intervals too.
const CLOCK_RATIOS = [
  1 / 8,
  1 / 6,
  1 / 4,
  1 / 3,
  1 / 2,
  2 / 3,
  3 / 4,
  1,
  4 / 3,
  3 / 2,
  2,
  3,
  4,
  6,
  8,
]

// Swing is a feel, not a dial: straight, a hair behind, the triplet shuffle
// every drum machine of the era had, and hard dotted. 0.37 of the way to a
// shuffle is a machine that can't quite play it.
const SWING_NOTCHES = [0, 0.15, 1 / 3, 0.5, 2 / 3]

const nearest = (value: number, candidates: number[]) =>
  candidates.reduce((best, c) =>
    Math.abs(c - value) < Math.abs(best - value) ? c : best,
  )

const nearestLog = (value: number, candidates: number[]) =>
  candidates.reduce((best, c) =>
    Math.abs(Math.log(c / value)) < Math.abs(Math.log(best / value)) ? c : best,
  )

// Every note the grid implies, doubled and halved until it runs off both ends
// of the control: half a beat is on the grid, and so is a sixty-fourth of one,
// which is what lets a retrigger scream at an exact multiple of the step. A note
// the control cannot actually hold — its own resolution rounds it off by more
// than a percent — is not on the grid, because landing there would be a claim
// the knob can't keep.
function gridValues(def: SliderDef, beatS: number, unit: 'ms' | 'hz') {
  const out: number[] = []
  for (const note of NOTE_BEATS) {
    for (let oct = -10; oct <= 6; oct++) {
      const period = note * beatS * 2 ** oct
      const want = unit === 'hz' ? 1 / period : period * 1000
      if (want < def.min || want > def.max) continue
      const held = snapToStep(def, want)
      if (Math.abs(held / want - 1) < 0.01) out.push(held)
    }
  }
  return out
}

function onGrid(
  key: ControlKey,
  value: number,
  bpm: number,
  unit: 'ms' | 'hz',
) {
  // Zero is a control switched off rather than a length of time, and nothing
  // divides into it.
  if (value <= 0 || bpm > MAX_MUSICAL_BPM) return value
  const grid = gridValues(sliderFor(key), 60 / bpm, unit)
  return grid.length ? nearestLog(value, grid) : value
}

// Puts back on the grid whatever this gesture actually moved. A roll of one
// stage has no business quantising a delay time it never touched — that would
// be an edit in a panel you didn't press.
export function inTime(
  next: Controls,
  moved: (key: ControlKey) => boolean,
): Controls {
  if (moved('drumSwing')) {
    next.drumSwing = snapToStep(
      sliderFor('drumSwing'),
      nearest(next.drumSwing, SWING_NOTCHES),
    )
  }
  if (moved('chipClockX')) {
    next.chipClockX = snapToStep(
      sliderFor('chipClockX'),
      nearestLog(next.chipClockX, CLOCK_RATIOS),
    )
  }
  for (const key of BEAT_MS)
    if (moved(key)) next[key] = onGrid(key, next[key], next.drumBpm, 'ms')
  for (const key of BEAT_HZ)
    if (moved(key)) next[key] = onGrid(key, next[key], next.drumBpm, 'hz')
  return next
}
