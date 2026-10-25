import type { ControlKey } from '../controls.ts'
import type { Track } from './controls/index.ts'
import type { Opens, Wiring } from './diagram.ts'

// What each box of a drawing opens, and for a box that opens only a row or
// two, the boxes it is wired to, whose rows its card shows under its own.

export const CLIPPER_OPENS: Opens = {
  supply: ['distSupply', 'distDraw'],
  LM386: ['distPinGain'],
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
  envelope: ['pcmEnv', 'pcmRelease'],
  tone: ['pcmTone'],
  mix: ['pcmLevel', 'pcmMute', 'pcmSupply'],
  vibrato: ['pcmVibrato'],
  'addr bus': ['pcmAddrLine', 'pcmAddrFault', 'pcmBusCut'],
  'data bus': ['pcmDataLine', 'pcmDataFault', 'pcmBusCut'],
} as const satisfies Opens

export const PARLOR_WIRED: Wiring = {
  envelope: ['tone'],
  tone: ['envelope', 'mix'],
  vibrato: ['counter'],
  'addr bus': ['data bus', 'counter'],
  'data bus': ['addr bus', 'ROM'],
}

// Time, Feedback and the echo level are rows of their own, since they are what
// the pedal is turned with.
export const WRAITH_OPENS = {
  send: ['dlySend'],
  heads: ['dlyHeads'],
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

// The machines with no sequencer of their own: each takes the toy keyboard's
// notes through one jumper and the kit's hits through one strike selector.
export const TRIGGER_CHIPS = [
  { name: 'Glint', struck: 'fmStruck', gate: 'fmKeyGate' },
  { name: 'Parlor', struck: 'pcmStruck', gate: 'pcmKeyGate' },
  { name: 'Growler', struck: 'monoStruck', gate: 'monoKeyGate' },
] as const satisfies readonly {
  name: string
  struck: ControlKey
  gate: ControlKey
}[]

export const TRIGGER_OPENS: Opens = Object.fromEntries([
  ['kit → keys', ['trigToKeys', 'trigKeysNote']],
  ['keys → kit', ['trigToDrum']],
  ...TRIGGER_CHIPS.flatMap(c => [
    [`kit → ${c.name}`, [c.struck]],
    [`keys → ${c.name}`, [c.gate]],
    [c.name, [c.struck, c.gate]],
  ]),
])

export const TRIGGER_WIRED: Wiring = Object.fromEntries([
  ['kit → keys', ['keys → kit']],
  ['keys → kit', ['kit → keys']],
  ...TRIGGER_CHIPS.flatMap(c => [
    [`kit → ${c.name}`, [c.name, 'keys → kit']],
    [`keys → ${c.name}`, [c.name, 'kit → keys']],
    [c.name, ['kit → keys', 'keys → kit']],
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
}

export const SUPPLY_WIRED: Wiring = { 'second cells': ['cells'] }
