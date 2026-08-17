// The shared vocabulary: one flat record of physical-unit numbers, used by the
// UI, presets, randomize and the DSP engine alike. Imports nothing.

export const DEFAULT_CONTROLS = {
  chipLevel: 0.6,
  chipTune: 0,
  chipTone: 0,
  chipAccomp: 0,
  chipClockX: 1,
  chipStarve: 0,
  chipBendSpot: 0,
  chipBendPot: 0,

  drumLevel: 0,
  drumPattern: 0,
  drumBpm: 118,
  drumRetrigHz: 0,

  oscLevel: 0,
  oscAHz: 220,
  oscBHz: 55,
  oscXmod: 0,
  oscShape: 0,
  oscStarve: 0,

  noiseLevel: 0,
  noiseColor: 0,
  crackleAmp: 0,
  crackleRate: 20,

  micLevel: 0,
  micPatch: 0,
  sampleLevel: 0,
  sampleSpeed: 1,

  bendSlot0: 1,
  bendSlot1: 2,
  bendSlot2: 3,
  bendSlot3: 6,
  bendSlot4: 4,
  bendSlot5: 5,

  ringHz: 300,
  ringShape: 0,
  ringMix: 0,

  bits: 16,
  srHz: 48000,
  srJitter: 0,
  crushMix: 0,

  driveDb: 12,
  distBias: 0,
  distMode: 0,
  distToneHz: 8000,
  subLevel: 0,
  distMix: 0,

  filtHz: 800,
  filtRes: 0.7,
  filtMode: 0,
  filtDriveDb: 0,
  filtMix: 0,

  combHz: 110,
  combFb: 0.7,
  combDampHz: 6000,
  combMix: 0,

  glitchProb: 0.3,
  glitchSliceMs: 120,
  glitchRepeat: 3,
  glitchRevProb: 0.3,
  glitchPitch: 0,
  glitchFreeze: 0,
  glitchMix: 0,

  shiftHz: 200,
  shiftDir: 0,
  shiftFb: 0,
  shiftMix: 0,

  stompCircuit: 0,
  stompDrive: 18,
  stompTone: 0.5,
  stompBias: 0,
  stompSag: 0,
  stompLevel: 0,
  stompMix: 0,

  delayMs: 350,
  dlyFb: 0.35,
  wowDepthMs: 0,
  wowHz: 0.8,
  flutter: 0,
  dlyToneHz: 6000,
  tapeBrake: 0,
  tapeMotorRail: 0,
  dlyMix: 0,

  revDecayS: 2,
  revToneHz: 4000,
  revBoing: 0.5,
  revMix: 0,

  modLfoHz: 1,
  modLfoShape: 0,
  mod0Src: 0,
  mod0Dest: 0,
  mod0Depth: 0.5,
  mod1Src: 0,
  mod1Dest: 1,
  mod1Depth: 0.5,
  bodyX: 0,
  bodyY: 0,

  fbAmt: 0,
  fbDelayMs: 5,
  fbTone: 0,
  fbDest: 0,

  brownAmt: 0,
  brownRate: 6,
  brownCrackle: 0,
  humLevel: 0,
  humHz: 0,

  tapeMix: 0,
  tapeSpeed: 1,
  tapeDrive: 6,
  tapeBias: 0,
  tapeHiss: 0.35,
  tapeWow: 0.25,
  tapeFlutter: 0.25,
  tapeDrop: 0,
  tapePrint: 0,
  tapeAzimuth: 0,

  outGain: 0,
}

export type Controls = typeof DEFAULT_CONTROLS
export type ControlKey = keyof Controls
export const CONTROL_KEYS = Object.keys(DEFAULT_CONTROLS) as ControlKey[]

export const atRest = (v: number, k: ControlKey) => v === DEFAULT_CONTROLS[k]
