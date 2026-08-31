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
  ['chipArp', 'step'],
  ['chipArpHz', 'slew'],
  ['chipArpOct', 'step'],
  ['keyScale', 'step'],
  ['keyRoot', 'step'],
  ['chipClockX', 'slew'],
  ['chipSync', 'step'],
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

  // The memory's steps are notes rather than amounts: there is nothing between
  // two of them, exactly as there is nothing between two step masks.
  ['tuneStep0', 'step'],
  ['tuneStep1', 'step'],
  ['tuneStep2', 'step'],
  ['tuneStep3', 'step'],
  ['tuneStep4', 'step'],
  ['tuneStep5', 'step'],
  ['tuneStep6', 'step'],
  ['tuneStep7', 'step'],
  ['tuneStep8', 'step'],
  ['tuneStep9', 'step'],
  ['tuneStep10', 'step'],
  ['tuneStep11', 'step'],
  ['tuneStep12', 'step'],
  ['tuneStep13', 'step'],
  ['tuneStep14', 'step'],
  ['tuneStep15', 'step'],
  ['tuneStep16', 'step'],
  ['tuneStep17', 'step'],
  ['tuneStep18', 'step'],
  ['tuneStep19', 'step'],
  ['tuneStep20', 'step'],
  ['tuneStep21', 'step'],
  ['tuneStep22', 'step'],
  ['tuneStep23', 'step'],
  ['tuneStep24', 'step'],
  ['tuneStep25', 'step'],
  ['tuneStep26', 'step'],
  ['tuneStep27', 'step'],
  ['tuneStep28', 'step'],
  ['tuneStep29', 'step'],
  ['tuneStep30', 'step'],
  ['tuneStep31', 'step'],
  ['tuneStackA0', 'step'],
  ['tuneStackA1', 'step'],
  ['tuneStackA2', 'step'],
  ['tuneStackA3', 'step'],
  ['tuneStackA4', 'step'],
  ['tuneStackA5', 'step'],
  ['tuneStackA6', 'step'],
  ['tuneStackA7', 'step'],
  ['tuneStackA8', 'step'],
  ['tuneStackA9', 'step'],
  ['tuneStackA10', 'step'],
  ['tuneStackA11', 'step'],
  ['tuneStackA12', 'step'],
  ['tuneStackA13', 'step'],
  ['tuneStackA14', 'step'],
  ['tuneStackA15', 'step'],
  ['tuneStackA16', 'step'],
  ['tuneStackA17', 'step'],
  ['tuneStackA18', 'step'],
  ['tuneStackA19', 'step'],
  ['tuneStackA20', 'step'],
  ['tuneStackA21', 'step'],
  ['tuneStackA22', 'step'],
  ['tuneStackA23', 'step'],
  ['tuneStackA24', 'step'],
  ['tuneStackA25', 'step'],
  ['tuneStackA26', 'step'],
  ['tuneStackA27', 'step'],
  ['tuneStackA28', 'step'],
  ['tuneStackA29', 'step'],
  ['tuneStackA30', 'step'],
  ['tuneStackA31', 'step'],
  ['tuneStackB0', 'step'],
  ['tuneStackB1', 'step'],
  ['tuneStackB2', 'step'],
  ['tuneStackB3', 'step'],
  ['tuneStackB4', 'step'],
  ['tuneStackB5', 'step'],
  ['tuneStackB6', 'step'],
  ['tuneStackB7', 'step'],
  ['tuneStackB8', 'step'],
  ['tuneStackB9', 'step'],
  ['tuneStackB10', 'step'],
  ['tuneStackB11', 'step'],
  ['tuneStackB12', 'step'],
  ['tuneStackB13', 'step'],
  ['tuneStackB14', 'step'],
  ['tuneStackB15', 'step'],
  ['tuneStackB16', 'step'],
  ['tuneStackB17', 'step'],
  ['tuneStackB18', 'step'],
  ['tuneStackB19', 'step'],
  ['tuneStackB20', 'step'],
  ['tuneStackB21', 'step'],
  ['tuneStackB22', 'step'],
  ['tuneStackB23', 'step'],
  ['tuneStackB24', 'step'],
  ['tuneStackB25', 'step'],
  ['tuneStackB26', 'step'],
  ['tuneStackB27', 'step'],
  ['tuneStackB28', 'step'],
  ['tuneStackB29', 'step'],
  ['tuneStackB30', 'step'],
  ['tuneStackB31', 'step'],
  ['tuneLen', 'step'],
  ['tuneRate', 'slew'],
  ['tunePoly', 'step'],

  ['drumLevel', 'slew'],
  ['drumBpm', 'slew'],
  ['drumSwing', 'slew'],
  ['drumTune', 'slew'],
  ['drumDecay', 'slew'],
  ['drumRing', 'slew'],
  ['drumPulse', 'slew'],
  ['drumSnappy', 'slew'],
  ['drumNoiseBias', 'slew'],
  ['drumMetal', 'slew'],
  ['drumCymTone', 'slew'],
  ['drumSpread', 'slew'],
  ['drumSquare', 'slew'],
  ['drumBits', 'step'],
  ['drumSlot', 'slew'],
  ['drumLadder', 'slew'],
  ['drumLadderTol', 'slew'],
  ['drumOverflow', 'step'],
  ['drumRetrigHz', 'slew'],
  ['drumTrigFloor', 'slew'],
  ['drumAccentAmt', 'slew'],
  ['drumAccentSag', 'slew'],
  ['drumChoke', 'step'],
  ['drumCross', 'step'],
  ['drumCrossAmt', 'slew'],
  ['drumAddrLine', 'step'],
  ['drumAddrFault', 'step'],
  ['drumDataLine', 'step'],
  ['drumDataFault', 'step'],
  ['drumBusCut', 'slew'],
  ['drumChance', 'slew'],

  ['drumKick', 'step'],
  ['drumSnare', 'step'],
  ['drumHat', 'step'],
  ['drumClap', 'step'],
  ['drumTom', 'step'],
  ['drumBell', 'step'],
  ['drumOpen', 'step'],
  ['drumCym', 'step'],
  ['drumAccent', 'step'],

  ['drumKickMaybe', 'step'],
  ['drumSnareMaybe', 'step'],
  ['drumHatMaybe', 'step'],
  ['drumClapMaybe', 'step'],
  ['drumTomMaybe', 'step'],
  ['drumBellMaybe', 'step'],
  ['drumOpenMaybe', 'step'],
  ['drumCymMaybe', 'step'],

  ['drumKickLen', 'step'],
  ['drumSnareLen', 'step'],
  ['drumHatLen', 'step'],
  ['drumClapLen', 'step'],
  ['drumTomLen', 'step'],
  ['drumBellLen', 'step'],
  ['drumOpenLen', 'step'],
  ['drumCymLen', 'step'],
  ['drumAccentLen', 'step'],

  ['fmLevel', 'slew'],
  ['fmVoice', 'step'],
  ['fmBright', 'slew'],
  ['fmFeedback', 'step'],
  ['fmLfo', 'step'],
  ['fmModRatio', 'step'],
  ['fmCarRatio', 'step'],
  ['fmModDecay', 'step'],
  ['fmLength', 'slew'],
  ['fmStruck', 'step'],
  ['fmKeyGate', 'step'],
  ['fmEffect', 'step'],
  ['fmRhythm', 'step'],
  ['fmDataLine', 'step'],
  ['fmDataFault', 'step'],
  ['fmAddrLine', 'step'],
  ['fmAddrFault', 'step'],
  ['fmBusCut', 'slew'],
  ['fmStrobe', 'slew'],
  ['fmWaveLine', 'step'],
  ['fmWaveFault', 'step'],

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
  ['loopRec', 'slew'],
  ['loopErase', 'slew'],
  ['loopSecs', 'step'],
  ['loopIn', 'slew'],
  ['loopOut', 'slew'],

  ['mixDrive', 'ramp'],

  ['bendSlot0', 'step'],
  ['bendSlot1', 'step'],
  ['bendSlot2', 'step'],
  ['bendSlot3', 'step'],
  ['bendSlot4', 'step'],
  ['bendSlot5', 'step'],

  ['pedalOrder', 'step'],

  ['ringHz', 'slew'],
  ['ringShape', 'step'],
  ['ringTrack', 'step'],
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

  ['echoMode', 'step'],
  ['echoMs', 'step'],
  ['echoFb', 'ramp'],
  ['echoToneHz', 'slew'],
  ['echoMod', 'slew'],
  ['echoLevel', 'slew'],

  ['revDecayS', 'slew'],
  ['revToneHz', 'slew'],
  ['revBoing', 'slew'],
  ['revMix', 'slew'],
  ['revDryCut', 'slew'],

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
  ['fb2Amt', 'ramp'],
  ['fb2Ms', 'slew'],
  ['fb2Tone', 'slew'],
  ['fb3Amt', 'ramp'],
  ['fb3Ms', 'slew'],
  ['fb3Tone', 'slew'],
  ['fbCross', 'slew'],
  ['fbRails', 'slew'],
  ['fbAsym', 'slew'],
  ['fbSlew', 'slew'],
  ['fbBlock', 'slew'],
  ['fbSag', 'slew'],

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
  ['tapeHyst', 'slew'],
  ['tapeBump', 'slew'],
  ['tapeSqueal', 'slew'],

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

// The meter taps that come back the other way, in one buffer so the worklet
// posts one thing: a slot per source in the order the chain sums them, then the
// mic, then the bus itself.
//
// A fader says how far it is up. It does not say whether anything is coming out
// of that machine — the FM chip is silent until something over on the toy
// strikes a note, a sampler with no file in it is a fader wired to nothing, and
// a channel at 0.8 behind a bend that has stopped passing is a fader lying
// outright. Those are the ways a level control lies, and the only cure is
// reading the bus.
//
// The order is the order the chain wires them onto the bus, named by the label
// each stage carries, so the mixer on the panel and the summing on the audio
// thread come off one list rather than two that agree for now.
export const SOURCE_TAPS = [
  'toyChip',
  'toyDrum',
  'fmChip',
  'chaosOsc',
  'noise',
  'sampler',
] as const

export type SourceTap = (typeof SOURCE_TAPS)[number]

// What each source's stem is called in the downloads folder. The tap names are
// the identifiers the audio thread is built out of; these are what somebody
// reading a folder of six files at midnight wants to see on them. Same order,
// and a test holds the two lists to the same length.
export const STEM_FILES = [
  'toy',
  'drums',
  'fm',
  'chaos',
  'noise',
  'sampler',
] as const

export const MAX_SOURCES = SOURCE_TAPS.length
export const TAP_MIC = MAX_SOURCES
export const TAP_BUS = MAX_SOURCES + 1
export const N_TAPS = MAX_SOURCES + 2

const PARAM_KEYS: readonly ParamName[] = PARAM_DEFS.map(([n]) => n)

// Fills `out` when given one. The engine packs a board per animation frame and
// per frame of a morph, and postMessage serializes on the thread that calls it,
// so the one buffer it hands over is free again the moment the post returns.
export function packParams(
  values: Controls,
  out = new Float32Array(N_PARAMS),
): Float32Array {
  for (let i = 0; i < N_PARAMS; i++) out[i] = values[PARAM_KEYS[i]!]
  return out
}
