import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { romIndex } from '../dsp/stages/roms'
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
    blurb: 'Rectified into a ringing transformer — an octave on one note, gargle on two',
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
    blurb: 'Starved to the edge of cutoff: it gates, sputters and howls between notes',
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
    blurb: 'The bay envelope wired onto the drive, so it digs in as it gets loud',
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
    blurb: 'Funeral march at half clock, browning out into a long tank',
    patch: {
      chipLevel: 0.8,
      chipTune: romIndex('funeral'),
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
    blurb: 'Satie through a soldered DAC bias and a ringing comb',
    patch: {
      chipLevel: 0.7,
      chipTune: romIndex('gnossienne'),
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
    blurb: 'Sakura on a chewed tape and a failing DAC',
    patch: {
      chipLevel: 0.75,
      chipTune: romIndex('sakura'),
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
    blurb: 'Mic soldered onto the drum machine trigger line',
    patch: {
      chipLevel: 0,
      drumLevel: 0.9,
      micLevel: 1.2,
      micPatch: 5,
      distMix: 0.45,
      driveDb: 16,
      revMix: 0.3,
    },
  },
  {
    name: 'found tape',
    blurb: 'The toy, printed clean to 7½ ips — hiss, a little wow, nothing broken',
    patch: {
      chipLevel: 0.7,
      chipTune: 12,
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
    blurb: 'Slow tape gone soft: dropouts, print-through, the pitch never settling',
    patch: {
      chipLevel: 0.7,
      chipTune: 14,
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

// Never randomized: output volume, mic gain and the pad your finger is on.
const HANDS_OFF = new Set<ControlKey>(['outGain', 'micLevel', 'bodyX', 'bodyY'])

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
