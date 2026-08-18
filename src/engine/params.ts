// The wire format between main thread and worklet: PARAM_DEFS order IS the
// layout of the packed Float32Array. Shared by both sides; keep dependency-free
// beyond controls.ts (pure data).

import type { ControlKey, Controls } from '../controls'

// slew: one-pole toward target (~10 ms) — knob moves smear musically.
// ramp: per-sample linear across the block — gains where zipper is audible.
// step: snap instantly — hard steps are the circuit-bent aesthetic.
export type Smooth = 'slew' | 'ramp' | 'step'

export const PARAM_DEFS = [
  ['chipLevel', 'slew'],
  ['chipTune', 'step'],
  ['chipTone', 'step'],
  ['chipAccomp', 'slew'],
  ['chipClockX', 'slew'],
  ['chipStarve', 'slew'],
  ['chipBattery', 'slew'],
  ['chipCap', 'slew'],
  ['chipClipHz', 'slew'],
  ['chipClipClock', 'slew'],
  ['chipDataLine', 'step'],
  ['chipDataFault', 'step'],
  ['chipAddrLine', 'step'],
  ['chipAddrFault', 'step'],
  ['chipBusCut', 'slew'],
  ['chipBendSpot', 'step'],
  ['chipBendPot', 'slew'],
  ['chipDrift', 'slew'],
  ['chipLatch', 'slew'],

  ['chipLeadR', 'slew'],
  ['chipDecouple', 'slew'],
  ['chipWatchdog', 'slew'],
  ['chipLatchHold', 'slew'],
  ['chipClipBite', 'slew'],
  ['chipClipHold', 'slew'],
  ['chipClipCharge', 'slew'],
  ['chipClipRelease', 'slew'],
  ['chipDragOct', 'slew'],
  ['chipSpread', 'slew'],
  ['chipMixDrive', 'slew'],

  ['drumLevel', 'slew'],
  ['drumBpm', 'slew'],
  ['drumSwing', 'slew'],
  ['drumTune', 'slew'],
  ['drumDecay', 'slew'],
  ['drumBits', 'step'],
  ['drumLadder', 'slew'],
  ['drumLadderTol', 'slew'],
  ['drumRetrigHz', 'slew'],
  ['drumCross', 'step'],
  ['drumCrossAmt', 'slew'],

  ['drumKick', 'step'],
  ['drumSnare', 'step'],
  ['drumHat', 'step'],
  ['drumClap', 'step'],
  ['drumTom', 'step'],
  ['drumBell', 'step'],
  ['drumAccent', 'step'],

  ['drumKickLen', 'step'],
  ['drumSnareLen', 'step'],
  ['drumHatLen', 'step'],
  ['drumClapLen', 'step'],
  ['drumTomLen', 'step'],
  ['drumBellLen', 'step'],
  ['drumAccentLen', 'step'],

  ['fmLevel', 'slew'],
  ['fmVoice', 'step'],
  ['fmBright', 'slew'],
  ['fmFeedback', 'step'],
  ['fmLength', 'slew'],
  ['fmEffect', 'step'],
  ['fmDataLine', 'step'],
  ['fmDataFault', 'step'],
  ['fmAddrLine', 'step'],
  ['fmAddrFault', 'step'],
  ['fmBusCut', 'slew'],
  ['fmStrobe', 'slew'],

  ['oscLevel', 'slew'],
  ['oscAHz', 'slew'],
  ['oscBHz', 'slew'],
  ['oscXmod', 'slew'],
  ['oscShape', 'step'],
  ['oscStarve', 'slew'],

  ['noiseLevel', 'slew'],
  ['noiseColor', 'slew'],
  ['crackleAmp', 'slew'],
  ['crackleRate', 'slew'],

  ['micLevel', 'slew'],
  ['micPatch', 'step'],
  ['sampleLevel', 'slew'],
  ['sampleSpeed', 'slew'],
  ['sampleTrig', 'step'],
  ['sampleMode', 'step'],

  ['bendSlot0', 'step'],
  ['bendSlot1', 'step'],
  ['bendSlot2', 'step'],
  ['bendSlot3', 'step'],
  ['bendSlot4', 'step'],
  ['bendSlot5', 'step'],

  ['ringHz', 'slew'],
  ['ringShape', 'step'],
  ['ringMix', 'slew'],

  ['bits', 'step'],
  ['srHz', 'step'],
  ['srJitter', 'step'],
  ['crushMix', 'slew'],

  ['driveDb', 'ramp'],
  ['distBias', 'slew'],
  ['distMode', 'step'],
  ['distToneHz', 'slew'],
  ['subLevel', 'slew'],
  ['distMix', 'slew'],

  ['filtHz', 'slew'],
  ['filtRes', 'ramp'],
  ['filtMode', 'step'],
  ['filtDriveDb', 'ramp'],
  ['filtMix', 'slew'],

  ['combHz', 'slew'],
  ['combFb', 'ramp'],
  ['combDampHz', 'slew'],
  ['combMix', 'slew'],

  ['glitchProb', 'step'],
  ['glitchSliceMs', 'step'],
  ['glitchRepeat', 'step'],
  ['glitchRevProb', 'step'],
  ['glitchPitch', 'step'],
  ['glitchFreeze', 'step'],
  ['glitchMix', 'slew'],

  ['shiftHz', 'slew'],
  ['shiftDir', 'step'],
  ['shiftFb', 'ramp'],
  ['shiftMix', 'slew'],

  ['stompCircuit', 'step'],
  ['stompDrive', 'ramp'],
  ['stompTone', 'slew'],
  ['stompBias', 'slew'],
  ['stompSag', 'slew'],
  ['stompLevel', 'ramp'],
  ['stompMix', 'slew'],

  ['delayMs', 'slew'],
  ['dlyFb', 'ramp'],
  ['wowDepthMs', 'slew'],
  ['wowHz', 'slew'],
  ['flutter', 'slew'],
  ['dlyToneHz', 'slew'],
  ['tapeBrake', 'slew'],
  ['tapeMotorRail', 'slew'],
  ['dlyMix', 'slew'],

  ['revDecayS', 'slew'],
  ['revToneHz', 'slew'],
  ['revBoing', 'slew'],
  ['revMix', 'slew'],

  ['modLfoHz', 'slew'],
  ['modLfoShape', 'step'],
  ['mod0Src', 'step'],
  ['mod0Dest', 'step'],
  ['mod0Depth', 'slew'],
  ['mod1Src', 'step'],
  ['mod1Dest', 'step'],
  ['mod1Depth', 'slew'],
  ['mod2Src', 'step'],
  ['mod2Dest', 'step'],
  ['mod2Depth', 'slew'],
  ['mod3Src', 'step'],
  ['mod3Dest', 'step'],
  ['mod3Depth', 'slew'],
  ['bodyX', 'slew'],
  ['bodyY', 'slew'],

  ['trigToKeys', 'step'],
  ['trigKeysNote', 'step'],
  ['trigToDrum', 'step'],

  ['fbAmt', 'ramp'],
  ['fbDelayMs', 'slew'],
  ['fbTone', 'slew'],
  ['fbDest', 'step'],

  ['brownAmt', 'slew'],
  ['brownRate', 'slew'],
  ['brownCrackle', 'slew'],
  ['humLevel', 'slew'],
  ['humHz', 'step'],

  ['tapeMix', 'slew'],
  ['tapeSpeed', 'step'],
  ['tapeDrive', 'ramp'],
  ['tapeBias', 'slew'],
  ['tapeHiss', 'slew'],
  ['tapeWow', 'slew'],
  ['tapeFlutter', 'slew'],
  ['tapeDrop', 'slew'],
  ['tapePrint', 'slew'],
  ['tapeAzimuth', 'slew'],

  ['heatAmt', 'slew'],
  ['faultCluster', 'slew'],
  ['jointChatter', 'slew'],
  ['relayRate', 'slew'],
  ['couple', 'slew'],

  ['outGain', 'ramp'],
] as const satisfies readonly (readonly [ControlKey, Smooth])[]

export type ParamName = (typeof PARAM_DEFS)[number][0]
export const N_PARAMS = PARAM_DEFS.length

export const IDX = Object.fromEntries(
  PARAM_DEFS.map(([n], i) => [n, i]),
) as Record<ParamName, number>

// The smoothing class per param, as a rate the worklet can multiply by rather
// than a name it has to compare: 0 snaps, anything else is the time constant.
// The smoother walks all of these every block, and a string switch there is
// a hundred and seventy comparisons 375 times a second.
export const SMOOTH_SEC: Float32Array = Float32Array.from(
  PARAM_DEFS.map(([, s]) => (s === 'step' ? 0 : s === 'slew' ? 0.01 : 0.003)),
)

export function packParams(values: Controls): Float32Array {
  const out = new Float32Array(N_PARAMS)
  PARAM_DEFS.forEach(([n], i) => (out[i] = values[n]))
  return out
}
