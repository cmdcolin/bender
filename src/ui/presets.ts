import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { Glide } from '../engine/glide'
import {
  ALL_SLIDERS,
  HOLD_KEYS,
  type SliderDef,
  sliderFor,
  snapToStep,
} from './controls'
import { DRUM_ROMS, GRID_ROWS } from './drums'
import { fromPos, toPos } from './slider-scale'

export interface PresetDef {
  name: string
  blurb: string
  patch: Partial<Controls>
}

const romMasks = (name: string) => DRUM_ROMS.find(r => r.name === name)!.masks

export const PRESETS: PresetDef[] = [
  {
    name: 'dying toy',
    blurb: 'Starved rail, sagging pitch, watchdog reboots mid-tune',
    patch: {
      chipLevel: 0.85,
      chipStarve: 0.85,
      chipClockX: 0.6,
      brownAmt: 0.35,
      dlyMix: 0.3,
      delayMs: 300,
      dlyFb: 0.5,
    },
  },
  {
    name: 'melody scrambler',
    blurb: 'Pot soldered on the program counter',
    patch: {
      chipLevel: 0.9,
      chipClockX: 2.5,
      chipBendSpot: 2,
      chipBendPot: 0.8,
      glitchMix: 0.5,
      glitchProb: 0.45,
      glitchSliceMs: 90,
    },
  },
  {
    name: 'machine gun',
    blurb: 'Drum machine retriggered into rolls',
    patch: {
      chipLevel: 0,
      drumLevel: 0.9,
      drumBpm: 170,
      drumRetrigHz: 24,
      distMix: 0.6,
      driveDb: 24,
      distMode: 2,
      dlyMix: 0.2,
      delayMs: 140,
    },
  },
  {
    name: 'drum scream',
    blurb: 'Retrigger past audio rate — the kit becomes a pitch',
    patch: {
      chipLevel: 0,
      drumLevel: 0.95,
      drumBpm: 45,
      drumRetrigHz: 700,
      crushMix: 0.5,
      bits: 6,
      revMix: 0.3,
      revDecayS: 3,
    },
  },
  {
    name: 'crushed chip',
    blurb: 'Overclocked tune through a dying DAC',
    patch: {
      chipLevel: 0.85,
      chipClockX: 2,
      bits: 3,
      srHz: 2600,
      srJitter: 0.6,
      crushMix: 0.9,
    },
  },
  {
    name: 'tape scream',
    blurb: 'Runaway delay feedback, warped transport',
    patch: {
      chipLevel: 0.5,
      dlyMix: 0.7,
      dlyFb: 1.4,
      delayMs: 120,
      dlyToneHz: 3000,
      wowDepthMs: 4,
      wowHz: 2,
      flutter: 0.5,
    },
  },
  {
    name: 'no-input squeal',
    blurb: 'The mixer patched into itself, nothing at the input',
    patch: {
      chipLevel: 0,
      fbAmt: 1.35,
      fbDelayMs: 0.6,
      fbTone: 0.4,
      distMix: 0.4,
      driveDb: 26,
      distMode: 1,
    },
  },
  {
    name: 'runaway howl',
    blurb: 'Long global loop through the whole board',
    patch: {
      chipLevel: 0.3,
      fbAmt: 1.5,
      fbDelayMs: 90,
      fbTone: -0.4,
      dlyMix: 0.5,
      dlyFb: 1.15,
      delayMs: 420,
      glitchMix: 0.3,
    },
  },
  {
    name: 'haunted spring',
    blurb: 'Slow chip through a huge dispersive tank',
    patch: {
      chipLevel: 0.45,
      chipClockX: 0.5,
      revMix: 0.75,
      revDecayS: 6,
      revBoing: 0.9,
      ringMix: 0.35,
      ringHz: 3.5,
      noiseLevel: 0.08,
      noiseColor: -0.5,
    },
  },
  {
    name: 'contact crackle',
    blurb: 'Dirty pot sparks ringing a screaming comb',
    patch: {
      chipLevel: 0,
      crackleAmp: 0.9,
      crackleRate: 55,
      combMix: 0.8,
      combFb: 1.15,
      combHz: 220,
      revMix: 0.4,
    },
  },
  {
    name: 'siren chaos',
    blurb: 'Cross-modulated oscillators starving themselves',
    patch: {
      chipLevel: 0,
      oscLevel: 0.85,
      oscXmod: 900,
      oscBHz: 2.2,
      oscStarve: 0.5,
      ringMix: 0.3,
      ringHz: 40,
    },
  },
  {
    name: 'acid screech',
    blurb: 'Self-oscillating filter pinged by contact sparks',
    patch: {
      chipLevel: 0,
      crackleAmp: 0.7,
      crackleRate: 22,
      bendSlot0: 6,
      filtMix: 0.9,
      filtRes: 1.15,
      filtHz: 320,
      filtMode: 0,
      filtDriveDb: 8,
      dlyMix: 0.3,
      delayMs: 500,
      dlyFb: 0.55,
    },
  },
  {
    name: 'ground loop',
    blurb: 'Bad power: hum, sag and a straining supply',
    patch: {
      chipLevel: 0.55,
      chipStarve: 0.5,
      humLevel: 0.8,
      brownAmt: 0.5,
      brownCrackle: 0.4,
      revMix: 0.3,
      revDecayS: 3,
    },
  },
  {
    name: 'possessed osc',
    blurb: 'The feedback bus soldered onto the FM input',
    patch: {
      chipLevel: 0,
      oscLevel: 0.7,
      oscAHz: 110,
      fbAmt: 1.2,
      fbDelayMs: 40,
      fbDest: 1,
      dlyMix: 0.4,
      delayMs: 260,
      dlyFb: 0.6,
    },
  },
  {
    name: 'sub stomp',
    blurb: 'Octave-divider fuzz under the tune',
    patch: {
      chipLevel: 0.75,
      distMix: 0.8,
      subLevel: 0.9,
      driveDb: 18,
      distMode: 2,
      distToneHz: 4000,
    },
  },
  {
    name: 'wall of muff',
    blurb: 'Two clipping stages that never let the note decay',
    patch: {
      chipLevel: 0.7,
      stompCircuit: 2,
      stompDrive: 34,
      stompTone: 0.35,
      stompLevel: -6,
      stompMix: 1,
      revMix: 0.3,
      revDecayS: 3,
    },
  },
  {
    name: 'dying fuzz face',
    blurb: 'Germanium on a flat battery, spluttering as each note goes',
    patch: {
      chipLevel: 0.8,
      stompCircuit: 3,
      stompDrive: 30,
      stompTone: 0.4,
      stompBias: -0.25,
      stompSag: 0.85,
      stompMix: 1,
      dlyMix: 0.25,
      delayMs: 280,
      dlyFb: 0.45,
    },
  },
  {
    name: 'octave up',
    blurb:
      'Rectified into a ringing transformer — an octave on one note, gargle on two',
    patch: {
      chipLevel: 0.75,
      stompCircuit: 4,
      stompDrive: 26,
      stompTone: 0.6,
      stompMix: 0.9,
      revMix: 0.35,
      revBoing: 0.7,
    },
  },
  {
    name: 'velcro',
    blurb:
      'Starved to the edge of cutoff: it gates, sputters and howls between notes',
    patch: {
      chipLevel: 0.7,
      stompCircuit: 5,
      stompDrive: 40,
      stompTone: 0.3,
      stompBias: 0.35,
      stompSag: 0.8,
      stompLevel: -6,
      stompMix: 1,
    },
  },
  {
    name: 'squeezed screamer',
    blurb:
      'The bay envelope wired onto the drive, so it digs in as it gets loud',
    patch: {
      chipLevel: 0.8,
      stompCircuit: 0,
      stompDrive: 16,
      stompTone: 0.55,
      stompMix: 1,
      mod0Src: 3,
      mod0Dest: 9,
      mod0Depth: 0.7,
      dlyMix: 0.3,
      delayMs: 320,
    },
  },
  {
    name: 'grief machine',
    blurb: 'Half clock, browning out into a long tank',
    patch: {
      chipLevel: 0.8,
      chipClockX: 0.55,
      chipStarve: 0.45,
      brownAmt: 0.3,
      humLevel: 0.25,
      dlyMix: 0.35,
      delayMs: 380,
      dlyFb: 0.5,
      revMix: 0.6,
      revDecayS: 5,
      revBoing: 0.5,
    },
  },
  {
    name: 'séance',
    blurb: 'A soldered DAC bias into a ringing comb, slowed right down',
    patch: {
      chipLevel: 0.7,
      chipClockX: 0.7,
      chipBendSpot: 3,
      chipBendPot: 0.25,
      ringMix: 0.3,
      ringHz: 6,
      combMix: 0.4,
      combHz: 180,
      combFb: 0.8,
      dlyMix: 0.3,
      delayMs: 300,
      flutter: 0.3,
      revMix: 0.5,
      revDecayS: 4,
    },
  },
  {
    name: 'dying walkman',
    blurb: 'A chewed tape running into a failing DAC',
    patch: {
      chipLevel: 0.75,
      chipClockX: 0.8,
      bits: 7,
      srHz: 9000,
      crushMix: 0.5,
      dlyMix: 0.5,
      delayMs: 260,
      dlyFb: 0.45,
      wowDepthMs: 5,
      wowHz: 0.8,
      flutter: 0.45,
      dlyToneHz: 3500,
      revMix: 0.35,
    },
  },
  {
    name: 'wrong voices',
    blurb: 'Envelope pins bridged — the kit fires the wrong drums',
    patch: {
      chipLevel: 0,
      drumLevel: 0.9,
      ...romMasks('disco'),
      drumBpm: 128,
      drumCross: 4,
      drumCrossAmt: 0.85,
      distMix: 0.35,
      driveDb: 12,
      revMix: 0.25,
    },
  },
  {
    name: 'yell into it',
    blurb:
      'Mic soldered into the delay feedback path — bring your mic level up',
    patch: {
      chipLevel: 0,
      micPatch: 3,
      dlyMix: 0.7,
      dlyFb: 0.95,
      delayMs: 220,
      distMix: 0.6,
      driveDb: 28,
    },
  },
  {
    name: 'dying transport',
    blurb: 'Tape motor wired to the same failing supply as the toy',
    patch: {
      chipLevel: 0.7,
      dlyMix: 0.6,
      delayMs: 320,
      dlyFb: 0.8,
      dlyToneHz: 3200,
      tapeMotorRail: 1,
      brownAmt: 0.85,
      brownRate: 3,
    },
  },
  {
    name: 'barber pole',
    blurb: 'Every lap through the shifter climbs again, so nothing lands',
    patch: {
      chipLevel: 0.5,
      bendSlot0: 7,
      shiftMix: 0.85,
      shiftHz: 3,
      shiftFb: 0.92,
      revMix: 0.35,
      revDecayS: 4,
    },
  },
  {
    name: 'clangour',
    blurb: 'Shifted far enough that the harmonics stop being harmonics',
    patch: {
      chipLevel: 0.8,
      bendSlot0: 7,
      shiftMix: 1,
      shiftHz: 380,
      dlyMix: 0.3,
      delayMs: 180,
      dlyFb: 0.45,
    },
  },
  {
    name: 'touch the contacts',
    blurb: 'Body pad on the filter, and leaning on it opens the feedback',
    patch: {
      chipLevel: 0,
      crackleAmp: 0.5,
      crackleRate: 30,
      bendSlot0: 6,
      filtMix: 1,
      filtRes: 1.2,
      filtHz: 180,
      mod0Src: 5,
      mod0Dest: 0,
      mod0Depth: 0.9,
      mod1Src: 6,
      mod1Dest: 8,
      mod1Depth: 0.6,
      fbDelayMs: 3,
    },
  },
  {
    name: 'clock wobble',
    blurb: 'The bay LFO dragging the chip crystal around',
    patch: {
      chipLevel: 0.85,
      modLfoHz: 0.5,
      mod0Src: 1,
      mod0Dest: 4,
      mod0Depth: 0.55,
      dlyMix: 0.25,
      delayMs: 240,
    },
  },
  {
    name: 'clap at it',
    blurb:
      'Mic on the drum trigger line: clap and it fires your pattern — bring your mic level up',
    patch: {
      chipLevel: 0,
      drumLevel: 0.9,
      micPatch: 5,
      distMix: 0.45,
      driveDb: 16,
      revMix: 0.3,
    },
  },
  {
    name: 'clap along',
    blurb: 'Backbeat claps, shuffled hard, through four bits of DAC',
    patch: {
      chipLevel: 0,
      drumLevel: 0.9,
      drumBpm: 104,
      drumSwing: 0.5,
      drumDecay: 1.4,
      drumBits: 4,
      ...romMasks('clap'),
      revMix: 0.3,
      revDecayS: 2.5,
    },
  },
  {
    name: 'found tape',
    blurb:
      'The toy, printed clean to 7½ ips — hiss, a little wow, nothing broken',
    patch: {
      chipLevel: 0.7,
      tapeMix: 1,
      tapeSpeed: 1,
      tapeDrive: 4,
      tapeHiss: 0.55,
      tapeWow: 0.3,
      tapeFlutter: 0.25,
      revMix: 0.18,
      revDecayS: 1.6,
    },
  },
  {
    name: 'shed oxide',
    blurb:
      'Slow tape gone soft: dropouts, print-through, the pitch never settling',
    patch: {
      chipLevel: 0.7,
      tapeMix: 1,
      tapeSpeed: 0,
      tapeDrive: 10,
      tapeBias: 0.55,
      tapeHiss: 0.8,
      tapeWow: 0.8,
      tapeFlutter: 0.7,
      tapeDrop: 0.6,
      tapePrint: 0.7,
      tapeAzimuth: 0.35,
      chipStarve: 0.2,
    },
  },
  {
    name: 'pinned to the oxide',
    blurb: 'Underbiased and slammed — the machine as the distortion',
    patch: {
      chipLevel: 0.8,
      drumLevel: 0.5,
      drumBpm: 96,
      tapeMix: 1,
      tapeSpeed: 2,
      tapeDrive: 15,
      tapeBias: -0.85,
      tapeHiss: 0.4,
      tapeWow: 0.15,
      tapeFlutter: 0.2,
      dlyMix: 0.25,
      delayMs: 180,
    },
  },
]

// What a morph holds is yours during the trip; this is what is yours over the
// whole gesture. On top of the levels and contacts you have your hands on, what
// is playing is yours too — the demo song you picked and the pattern you wrote.
// Neither random nor mutate moves any of them, and a preset moves one only if
// it names it.
//
// The demo song is the one nothing may name: a preset is a statement about the
// circuit, so swapping the tune under it changes the one thing you were using to
// judge the change. Several used to, and auditioning a row of them meant losing
// the song you were listening to as well as the board. A test holds the line.
const YOURS = new Set<ControlKey>([
  ...HOLD_KEYS,
  'sampleLevel',
  'chipTune',
  ...GRID_ROWS.map(r => r.key),
])

const keepYours = (
  next: Controls,
  current: Controls,
  named: Partial<Controls> = {},
) => {
  for (const k of YOURS) if (!(k in named)) next[k] = current[k]
  return next
}

export function applyPreset(preset: PresetDef, current: Controls): Controls {
  return keepYours(
    { ...DEFAULT_CONTROLS, ...preset.patch },
    current,
    preset.patch,
  )
}

// The road from the board you are on to the one a preset names. Clicking the
// chip flies it on the clock; dragging the chip is the same road under your
// finger, one pointer step at a time, so the far end of the drag is exactly what
// the click gives you and everywhere short of it is a board neither the preset
// nor you would have written down.
//
// The same Glide the morph travels, deliberately: modes cut at the midpoint and
// your levels and contacts are held, so a half-dragged preset is a board that
// can actually be played rather than half a distortion circuit.
export function presetPath(preset: PresetDef, from: Controls): Glide {
  return new Glide(from, applyPreset(preset, from))
}

// The tempo is the one number a nudge must not touch. Move it and every echo,
// roll and sweep that was landing with the pattern lands somewhere else instead
// — the board comes back a different circuit *and* out of time, and you can no
// longer tell which of the two you are hearing.
const CLOCK_KEYS = new Set<ControlKey>(['drumBpm'])

// Note lengths as a fraction of a beat: sixteenth up to a bar, with the
// triplets and the dotted values in between.
const NOTE_BEATS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3, 4]

// Controls that count in time rather than in pitch or in level. A nudge moves
// them as freely as anything else and then puts them back down on the grid, so
// the delay lands on a dotted eighth, the slice on a sixteenth and the roll on
// a division of the step.
const BEAT_MS: ControlKey[] = ['delayMs', 'glitchSliceMs']
const BEAT_HZ: ControlKey[] = ['drumRetrigHz', 'modLfoHz']

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

// Along the control's own travel, not across its span: a log slider moves by a
// proportion of where it sits, so a 40 ms delay comes back a few milliseconds
// away rather than halfway across the two-second range.
const nudge = (
  def: SliderDef,
  value: number,
  amount: number,
  rand: () => number,
) =>
  snapToStep(def, fromPos(def, toPos(def, value) + (rand() * 2 - 1) * amount))

export function mutate(
  controls: Controls,
  amount: number,
  rand: () => number,
): Controls {
  const next = { ...controls }
  for (const def of ALL_SLIDERS) {
    if (YOURS.has(def.key) || CLOCK_KEYS.has(def.key)) continue
    if (def.choices) {
      if (rand() < amount * 0.5) {
        next[def.key] = def.min + Math.floor(rand() * def.choices.length)
      }
      continue
    }
    next[def.key] = nudge(def, controls[def.key], amount, rand)
  }
  next.chipClockX = snapToStep(
    sliderFor('chipClockX'),
    nearestLog(next.chipClockX, CLOCK_RATIOS),
  )
  for (const key of BEAT_MS)
    next[key] = onGrid(key, next[key], next.drumBpm, 'ms')
  for (const key of BEAT_HZ)
    next[key] = onGrid(key, next[key], next.drumBpm, 'hz')
  return next
}

// A roll of the dice asks for a different circuit, not a different song: the
// preset it lands on hands over its board and nothing else.
export function randomLook(current: Controls, rand: () => number): Controls {
  const preset = PRESETS[Math.floor(rand() * PRESETS.length)]!
  return keepYours(mutate(applyPreset(preset, current), 0.08, rand), current)
}
