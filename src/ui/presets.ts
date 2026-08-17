import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { ALL_SLIDERS, snapToStep } from './controls'

export interface PresetDef {
  name: string
  blurb: string
  patch: Partial<Controls>
}

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
    name: 'yell into it',
    blurb: 'Mic soldered into the delay feedback path',
    patch: {
      chipLevel: 0,
      micLevel: 1.2,
      micPatch: 3,
      dlyMix: 0.7,
      dlyFb: 0.95,
      delayMs: 220,
      distMix: 0.6,
      driveDb: 28,
    },
  },
]

// Never randomized: output volume and mic gain stay where the user put them.
const HANDS_OFF = new Set<ControlKey>(['outGain', 'micLevel'])

export function applyPreset(preset: PresetDef): Controls {
  return { ...DEFAULT_CONTROLS, ...preset.patch }
}

export function mutate(controls: Controls, amount: number, rand: () => number): Controls {
  const next = { ...controls }
  for (const def of ALL_SLIDERS) {
    if (HANDS_OFF.has(def.key)) continue
    if (def.choices) {
      if (rand() < amount * 0.5) {
        next[def.key] = def.min + Math.floor(rand() * def.choices.length)
      }
      continue
    }
    const jitter = (rand() * 2 - 1) * amount * (def.max - def.min)
    next[def.key] = snapToStep(def, controls[def.key] + jitter)
  }
  return next
}

export function randomLook(rand: () => number): Controls {
  const preset = PRESETS[Math.floor(rand() * PRESETS.length)]!
  return mutate(applyPreset(preset), 0.08, rand)
}
