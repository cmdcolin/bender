import {
  connectionInto,
  KEY_LINE,
  KIT_TO_PLINKY,
  PLINKY_TO_KIT,
  wireId,
} from './connections.ts'

import type { Track } from './controls/index.ts'
import type { Opens, Wiring } from './diagram.ts'

// What each box of a drawing opens, and for a box that opens only a row or
// two, the boxes it is wired to, whose rows its card shows under its own.

export const CLIPPER_OPENS: Opens = {
  supply: ['distSupply', 'distDraw'],
  LM386: ['distPinGain', 'distPinFb'],
  'pin 7': ['distBypass'],
  'coupling cap': ['distBlock'],
  speaker: ['distSpeaker'],
}

export const CLIPPER_WIRED: Wiring = {
  supply: ['LM386'],
  LM386: ['pin 7', 'coupling cap'],
  'pin 7': ['LM386', 'supply'],
  'coupling cap': ['LM386', 'speaker'],
  speaker: ['coupling cap', 'LM386'],
}

export const PARLOR_OPENS = {
  keys: ['pcmStruck', 'pcmKeyGate', 'pcmChord'],
  counter: ['pcmClockX', 'pcmSignDir', 'pcmLatch'],
  ROM: ['pcmVoice', 'pcmRunOn', 'pcmWrite'],
  envelope: ['pcmEnv', 'pcmRelease', 'pcmLength'],
  tone: ['pcmTone'],
  mix: ['pcmLevel', 'pcmSupply'],
  vibrato: ['pcmVibrato'],
  'addr bus': ['pcmAddrLine', 'pcmAddrFault', 'pcmBusCut', 'pcmAddrCross'],
  'data bus': [
    'pcmDataLine',
    'pcmDataFault',
    'pcmBusCut',
    'pcmDataCross',
    'pcmGlint',
  ],
} as const satisfies Opens

export const PARLOR_WIRED: Wiring = {
  envelope: ['tone'],
  tone: ['envelope', 'mix'],
  mix: ['tone'],
  vibrato: ['counter'],
  'addr bus': ['data bus', 'counter'],
  'data bus': ['addr bus', 'ROM'],
}

// Time, Feedback and the echo level are rows of their own, since they are what
// the pedal is turned with.
export const WRAITH_OPENS = {
  send: ['dlySend'],
  heads: ['dlyHeads', 'dlyHeadDirt'],
  tone: [
    'dlyToneHz',
    'dlyLoopMode',
    'dlyLoopHz',
    'dlyLoopRes',
    'dlyLamp',
    'dlyLampS',
    'dlyRingHz',
    'dlyRing',
  ],
  transport: [
    'wowDepthMs',
    'wowHz',
    'flutter',
    'tapeBrake',
    'tapeMotorRail',
    'dlySplice',
    'dlyErase',
  ],
} as const satisfies Opens

export const WRAITH_WIRED: Wiring = {
  send: ['heads', 'transport'],
  heads: ['send', 'transport'],
}

export const TRIGGER_CHIPS = KEY_LINE.map(jumper => ({
  name: jumper.to,
  struck: connectionInto(jumper.to, 'hits')!,
  gate: jumper,
}))

export const TRIGGER_OPENS: Opens = Object.fromEntries([
  [wireId(KIT_TO_PLINKY), ['trigToKeys', 'trigKeysNote']],
  [wireId(PLINKY_TO_KIT), ['trigToDrum']],
  ...TRIGGER_CHIPS.flatMap(c => [
    [wireId(c.struck), [c.struck.key]],
    [wireId(c.gate), [c.gate.key]],
    [c.name, [c.struck.key, c.gate.key]],
  ]),
])

export const TRIGGER_WIRED: Wiring = Object.fromEntries([
  [wireId(KIT_TO_PLINKY), [wireId(PLINKY_TO_KIT)]],
  [wireId(PLINKY_TO_KIT), [wireId(KIT_TO_PLINKY)]],
  ...TRIGGER_CHIPS.flatMap(c => [
    [wireId(c.struck), [c.name, wireId(PLINKY_TO_KIT)]],
    [wireId(c.gate), [c.name, wireId(KIT_TO_PLINKY)]],
    [c.name, [wireId(KIT_TO_PLINKY), wireId(PLINKY_TO_KIT)]],
  ]),
])

export const stripOpens = (t: Track) =>
  ({
    trim: [`four${t}Trim`],
    eq: [`four${t}Low`, `four${t}MidHz`, `four${t}Mid`, `four${t}High`],
    pan: [`four${t}Pan`],
    rec: [`four${t}Rec`],
    loop: [`four${t}Erase`, `four${t}Len`],
    cue: [`four${t}Cue`],
    send: [`four${t}Send`],
  }) as const satisfies Opens

export const STRIP_WIRED: Wiring = {
  trim: ['eq'],
  pan: ['send', 'cue'],
  send: ['pan', 'cue'],
  rec: ['loop'],
  loop: ['rec', 'cue'],
  cue: ['loop', 'pan'],
}

export const EMBER_WIRED: Wiring = { speaker: ['power amp'] }

export const FEEDBACK_WIRED: Wiring = { 'patched into': ['return amps'] }

export const TAPE_WIRED: Wiring = {
  'NR in': ['rec head'],
  'rec head': ['NR in'],
  'replay head': ['NR out'],
  'NR out': ['replay head'],
}

export const PLINKY_WIRED: Wiring = { 'key matrix': ['voices'] }

export const CLATTER_WIRED: Wiring = { 'sample ROM': ['DAC'] }

export const GLINT_WIRED: Wiring = { clocks: ['modulator', 'carrier'] }

export const GROWLER_WIRED: Wiring = {
  sync: ['oscillators'],
  FM: ['oscillators'],
  out: ['loudness'],
}

export const SUPPLY_WIRED: Wiring = { 'second cells': ['cells'] }
