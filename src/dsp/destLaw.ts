import { isControlKey, type ControlKey } from '../controls.ts'
import { DEST } from './modbus.ts'

export type DestKey = keyof typeof DEST
export type LiveDest = Exclude<DestKey, `gone${number}`>

interface Shared {
  knob?: ControlKey
  note?: string
}

export type Law = Shared &
  (
    | { law: 'add'; scale?: number; lo?: number; hi?: number }
    | { law: 'oct'; span: number }
    | { law: 'hop'; choices: number }
    | { law: 'gain' }
    | { law: 'custom'; note: string }
  )

export const DEST_LAW = {
  filtHz: { law: 'oct', span: 4 },
  ringHz: {
    law: 'oct',
    span: 4,
    note: 'Ignored while the carrier comes from the mic, another machine or the step bus.',
  },
  combHz: { law: 'oct', span: 2 },
  crushHz: { law: 'oct', span: 4, knob: 'srHz' },
  chipClock: { law: 'oct', span: 3, knob: 'chipClockX' },
  retrig: {
    law: 'oct',
    span: 4,
    knob: 'drumRetrigHz',
    note: 'Scales the retrig rate, so it does nothing while that rate is 0.',
  },
  tapeSpeed: {
    law: 'oct',
    span: 1.5,
    note: 'Multiplies the capstan’s target speed; the motor follows with 0.3 s of inertia, so the repeats dive in pitch.',
  },
  glitch: { law: 'add', lo: 0, hi: 1, knob: 'glitchProb' },
  fbAmt: {
    law: 'add',
    scale: 1.5,
    lo: 0,
    hi: 1.5,
    note: 'A wire here also switches the first desk strip on with its fader at 0.',
  },
  stompDrive: {
    law: 'oct',
    span: 4,
    note: 'About 24 dB of drive per unit of depth.',
  },
  shiftHz: { law: 'oct', span: 4 },
  bits: { law: 'add', scale: 8, lo: 1, hi: 16 },
  drumCross: {
    law: 'add',
    lo: 0,
    hi: 1,
    knob: 'drumCrossAmt',
    note: 'Heard only while the cross wiring is set.',
  },
  starve: { law: 'add', lo: 0, hi: 1, knob: 'chipStarve' },
  drumTune: { law: 'oct', span: 2 },
  revDecay: { law: 'oct', span: 2, knob: 'revDecayS' },
  delayMs: {
    law: 'oct',
    span: 2,
    note: 'Scales the head spacing, also while the delay is synced to the tempo.',
  },
  wDepth0: {
    law: 'add',
    lo: -2,
    hi: 2,
    knob: 'mod0Depth',
    note: 'Adds to wire 1’s depth before that wire lands.',
  },
  wDepth1: {
    law: 'add',
    lo: -2,
    hi: 2,
    knob: 'mod1Depth',
    note: 'Adds to wire 2’s depth before that wire lands.',
  },
  wDepth2: {
    law: 'add',
    lo: -2,
    hi: 2,
    knob: 'mod2Depth',
    note: 'Adds to wire 3’s depth before that wire lands.',
  },
  wDepth3: {
    law: 'add',
    lo: -2,
    hi: 2,
    knob: 'mod3Depth',
    note: 'Adds to wire 4’s depth before that wire lands.',
  },
  echoMs: {
    law: 'oct',
    span: 2,
    note: 'In hold mode it sets how fast the held window goes round.',
  },
  sampleSpeed: {
    law: 'oct',
    span: 2,
    note: 'Multiplies the signed speed, so the direction stays and a stopped reel stays stopped.',
  },
  loopSlide: {
    law: 'add',
    note: 'Slides the loop window along the reel by the wire, in fractions of the reel.',
  },
  loopSpan: {
    law: 'oct',
    span: 2,
    note: 'Scales the loop window’s width from its start.',
  },
  oscStarve: { law: 'add', lo: 0, hi: 1 },
  oscHz: { law: 'oct', span: 4, knob: 'oscAHz', note: 'Moves oscillator A.' },
  chipLevel: { law: 'gain' },
  drumLevel: { law: 'gain' },
  fmLevel: { law: 'gain' },
  oscLevel: { law: 'gain' },
  noiseLevel: { law: 'gain' },
  sampleLevel: { law: 'gain' },
  filtRes: { law: 'add', scale: 1.3, lo: 0 },
  fmBright: { law: 'add', lo: 0 },
  fbMs: {
    law: 'oct',
    span: 2,
    knob: 'fbDelayMs',
    note: 'Moves the first desk strip’s delay, which runs only while its amount is up or wired.',
  },
  chipDataLine: { law: 'hop', choices: 7 },
  chipDataFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  chipAddrLine: { law: 'hop', choices: 6 },
  chipAddrFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  drumDataLine: { law: 'hop', choices: 10 },
  drumDataFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  drumAddrLine: { law: 'hop', choices: 5 },
  drumAddrFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmDataLine: { law: 'hop', choices: 9 },
  fmDataFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmAddrLine: { law: 'hop', choices: 7 },
  fmAddrFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmWaveLine: { law: 'hop', choices: 11 },
  fmWaveFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmWaveDataLine: { law: 'hop', choices: 9 },
  fmWaveDataFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmBusCut: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only while a line is picked.',
  },
  fmNoiseBlob: { law: 'add', lo: 0, hi: 1 },
  ringMix: { law: 'add' },
  drumBpm: {
    law: 'oct',
    span: 1,
    note: 'Ignored while the step tap is up; the melody clock sets the tempo then.',
  },
  drumSwing: { law: 'add', scale: 0.9, lo: 0, hi: 0.9 },
  drumChance: { law: 'add', lo: 0, hi: 1 },
  drumDecay: { law: 'oct', span: 2 },
  drumRing: { law: 'add', lo: 0, hi: 1 },
  dlyLoopHz: {
    law: 'oct',
    span: 3,
    note: 'Heard only while a filter is in the loop.',
  },
  deckSpeed: {
    law: 'oct',
    span: 2,
    note: 'With the knob at 0 a wire does nothing.',
  },
  ensRate: { law: 'oct', span: 2 },
  pcmLevel: { law: 'gain' },
  pcmAddrLine: { law: 'hop', choices: 15 },
  pcmAddrFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  pcmDataLine: { law: 'hop', choices: 9 },
  pcmDataFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  monoLevel: { law: 'gain' },
  monoCutoff: { law: 'oct', span: 4 },
  monoEmph: { law: 'add', scale: 1.1, lo: 0, hi: 1.1 },
  monoPitch: { law: 'oct', span: 1, note: 'Adds octaves to the played key.' },
  chipCrosstalk: { law: 'add', lo: 0, hi: 1 },
  chipScan: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'While the scan runs, Short and XOR do nothing.',
  },
  chipPwm: { law: 'add', lo: 0, hi: 1 },
  chipShort: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Does nothing while Scan is above 0.',
  },
  chipEnvCap: { law: 'hop', choices: 3 },
  chipGhost: { law: 'hop', choices: 4 },
  chipLoopFrom: { law: 'hop', choices: 7 },
  chipLoopTo: {
    law: 'hop',
    choices: 6,
    note: 'Does nothing while Loop from is on its first setting.',
  },
  chipBankLine: { law: 'hop', choices: 6 },
  chipBankFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  chipDivLine: { law: 'hop', choices: 13 },
  chipDivFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmPatchLine: { law: 'hop', choices: 8 },
  fmPatchFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmPatchDataLine: { law: 'hop', choices: 9 },
  fmPatchDataFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmClock: {
    law: 'oct',
    span: 3,
    knob: 'fmClockX',
    note: 'The wire is held within ±2, so it moves the clock at most six octaves.',
  },
  fmCpuClock: {
    law: 'oct',
    span: 3,
    knob: 'fmCpuClockX',
    note: 'The wire is held within ±2, so it moves the clock at most six octaves.',
  },
  revWarble: { law: 'add', lo: 0, hi: 1 },
  drumRefDepth: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only while the kit’s DAC reference comes from somewhere.',
  },
  fmDacSlot: { law: 'hop', choices: 5 },
  fmDacSlip: { law: 'add', lo: 0, hi: 1 },
  fmAlloc: { law: 'hop', choices: 6 },
  fmColdBoot: {
    law: 'custom',
    note: 'Switch plus wire above 0.5 power-cycles the chip with random registers, and it stays in cold boot while the sum stays above 0.5.',
  },
  fmAdder: { law: 'hop', choices: 6 },
  fourLevel: { law: 'gain' },
  fourPitch: {
    law: 'oct',
    span: 1,
    note: 'Changes the pitch and time of all four loops together.',
  },
  fourAux: {
    law: 'add',
    lo: 0,
    note: 'Heard only while some strip’s aux send is up.',
  },
  four1MidHz: { law: 'oct', span: 2, note: 'Moves strip 1’s mid EQ only.' },
  chipStepTap: { law: 'add', lo: 0, hi: 1 },
  chipEnvRelax: { law: 'add', lo: 0, hi: 1 },
  chipEnvDiv: { law: 'add', lo: 0, hi: 1 },
  chipOutAddr: { law: 'hop', choices: 6 },
  chipOutData: { law: 'hop', choices: 7 },
  chipPwmTap: { law: 'add', lo: 0, hi: 1 },
  fmToyBus: { law: 'hop', choices: 9 },
  chipFmClock: { law: 'add', lo: 0, hi: 1 },
  chipHold: { law: 'add', lo: 0, hi: 1 },
  chipHardSync: { law: 'add', lo: 0, hi: 1 },
  chipXor: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Does nothing while Scan is above 0.',
  },
  chipEnvBits: { law: 'add', lo: 0, hi: 1 },
  chipDutyEnv: { law: 'add', lo: 0, hi: 1 },
  pcmRunOn: { law: 'add', lo: 0, hi: 1 },
  pcmWrite: { law: 'add', lo: 0, hi: 1 },
  pcmSignDir: { law: 'add', lo: 0, hi: 1 },
  pcmLatch: { law: 'add', lo: 0, hi: 1 },
  crushDataLine: {
    law: 'hop',
    choices: 17,
    note: 'The first setting is no line; any line puts the crusher on its circuit path.',
  },
  crushDataFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  crushBusCut: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only while a line is picked.',
  },
  crushLadder: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'A wire here also puts the crusher on its circuit path.',
  },
  crushRefDepth: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only while the reference comes from somewhere other than fixed.',
  },
  starve2: { law: 'add', lo: 0, hi: 1, knob: 'cell2Starve' },
  distDraw: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'A wire here also puts the clipper on its amp circuit.',
  },
  distPinGain: {
    law: 'oct',
    span: 4,
    note: 'A wire here also puts the clipper on its amp circuit.',
  },
  octRate: {
    law: 'oct',
    span: 4,
    note: 'Heard only with the clock on free and bounce on.',
  },
  octChaos: {
    law: 'add',
    scale: -1,
    lo: 0,
    hi: 1,
    knob: 'octTrack',
    note: 'Subtracts from tracking, so a rising wire makes the divider catch more wrong edges.',
  },
  drumWander: { law: 'add' },
  drumStepTap: { law: 'add', lo: 0, hi: 1 },
  chipKitAddr: { law: 'hop', choices: 6 },
  gndBounce: { law: 'add' },
  pcmGlint: {
    law: 'hop',
    choices: 9,
    note: 'The setting is how many top data bits take the FM chip’s register.',
  },
  chipOutKeys: { law: 'hop', choices: 9 },
  codecRate: { law: 'oct', span: 3 },
  codecErrors: { law: 'add', lo: 0, hi: 1 },
  rackClock: { law: 'oct', span: 2 },
  rackDecay: {
    law: 'add',
    scale: 0.5,
    note: 'Ignored while the tank is frozen.',
  },
  monoLoopPitch: { law: 'add' },
  monoChoke: { law: 'add', lo: 0, hi: 1 },
  drumMotor: { law: 'add', lo: 0, hi: 1 },
  drumRush: { law: 'add', lo: -1, hi: 1 },
  chipPump: { law: 'add', lo: 0, hi: 1 },
  chipCrash: { law: 'add', lo: 0, hi: 1 },
  fmRot: { law: 'add', lo: 0, hi: 1 },
  fmHeat: { law: 'add', lo: 0, hi: 1 },
  fmRing: { law: 'add', lo: 0, hi: 1 },
  pcmRunaway: { law: 'add', lo: 0, hi: 1 },
  pcmCpuBus: { law: 'add', lo: 0, hi: 1 },
  drumRot: { law: 'add', lo: 0, hi: 1 },
  drumOutAddr: { law: 'add', lo: 0, hi: 1 },
  monoRegTrip: { law: 'add', lo: 0, hi: 1 },
  chipLfsr: { law: 'add', lo: 0, hi: 1 },
  chopWobble: {
    law: 'add',
    lo: 0,
    hi: 1,
    knob: 'ringWobble',
    note: 'Heard only on the chop shape.',
  },
  chopDepth: {
    law: 'add',
    lo: 0,
    hi: 1,
    knob: 'ringDepth',
    note: 'Heard only on the chop shape.',
  },
  chopWidth: {
    law: 'add',
    lo: 0.02,
    hi: 0.98,
    knob: 'ringDuty',
    note: 'Heard only on the chop shape.',
  },
  combPump: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only with a bucket chip picked.',
  },
  combRail: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only with a bucket chip picked.',
  },
  combPluck: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only with a bucket chip picked.',
  },
  combWhistle: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only with a bucket chip picked.',
  },
  combSag: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only with a bucket chip picked.',
  },
  combPull: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'Heard only with a bucket chip picked.',
  },
  shiftDrift: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'A wire here also puts the shifter on its circuit path.',
  },
  shiftQuad: {
    law: 'add',
    lo: 0,
    hi: 1,
    note: 'A wire here also puts the shifter on its circuit path.',
  },
  fmExpLine: { law: 'hop', choices: 13 },
  fmExpFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  sheetLevel: { law: 'gain' },
  bottleLevel: { law: 'gain' },
  leadLevel: { law: 'gain' },
  leadCutoff: { law: 'oct', span: 4 },
  leadEmph: { law: 'add', scale: 1.1, lo: 0, hi: 1.1 },
  leadPitch: { law: 'oct', span: 1, note: 'Adds octaves to the played key.' },
  leadLoopPitch: { law: 'add', lo: 0, hi: 1 },
  leadChoke: { law: 'add', lo: 0, hi: 1 },
  leadRegTrip: { law: 'add', lo: 0, hi: 1 },
  talkLevel: { law: 'gain' },
  pcmSlot: { law: 'add', lo: 0, hi: 1 },
  pcmWordRate: { law: 'add', lo: 0, hi: 1 },
  pcmRot: { law: 'add', lo: 0, hi: 1 },
  fmIncLine: { law: 'hop', choices: 20 },
  fmIncFault: {
    law: 'hop',
    choices: 8,
    note: 'Heard only while its line is picked.',
  },
  fmCarry: { law: 'hop', choices: 19 },
  fmSkew: { law: 'add', lo: 0, hi: 1 },
  fmPitchWire: { law: 'add', lo: 0, hi: 1 },
  drumTouch: { law: 'add', lo: 0, hi: 1 },
  echoPull: { law: 'add', lo: 0, hi: 1, note: 'Heard only in analog mode.' },
  echoSag: { law: 'add', lo: 0, hi: 1, note: 'Heard only in analog mode.' },
  drumLeak: { law: 'add', lo: -1, hi: 1 },
  drumSelfFire: { law: 'add', lo: 0, hi: 1 },
  fmBodge: { law: 'hop', choices: 5 },
  chipBodge: { law: 'hop', choices: 3 },
  revHowl: { law: 'add', lo: 0, hi: 1 },
  fmBodgeR: { law: 'hop', choices: 5 },
  chipBodgeR: { law: 'hop', choices: 3 },
  drumTrigBias: {
    law: 'custom',
    note: 'Knob plus wire is a trigger line: rising past 0.5 fires the current step once, and it rearms below 0.4.',
  },
  drumKickLevel: { law: 'add', lo: 0, hi: 2 },
  drumSnareLevel: { law: 'add', lo: 0, hi: 2 },
  drumHatLevel: { law: 'add', lo: 0, hi: 2 },
  drumClapLevel: { law: 'add', lo: 0, hi: 2 },
  drumTomLevel: { law: 'add', lo: 0, hi: 2 },
  drumBellLevel: { law: 'add', lo: 0, hi: 2 },
  drumOpenLevel: { law: 'add', lo: 0, hi: 2 },
  drumCymLevel: { law: 'add', lo: 0, hi: 2 },
  drumKickDecay: { law: 'oct', span: 2 },
  drumSnareDecay: { law: 'oct', span: 2 },
  drumHatDecay: { law: 'oct', span: 2 },
  drumClapDecay: { law: 'oct', span: 2 },
  drumTomDecay: { law: 'oct', span: 2 },
  drumBellDecay: { law: 'oct', span: 2 },
  drumOpenDecay: { law: 'oct', span: 2 },
  drumCymDecay: { law: 'oct', span: 2 },
  monoToyIn: { law: 'add' },
  leadToyIn: { law: 'add', lo: 0, hi: 2 },
  drumKickFeed: { law: 'add', lo: 0, hi: 1 },
  drumKickVca: { law: 'add', lo: 0, hi: 1 },
  drumMixDrive: { law: 'add', lo: 0, hi: 1 },
  drumSnareMetal: { law: 'add', lo: 0, hi: 1 },
  drumTankBank: { law: 'add', lo: 0, hi: 1 },
  drumTankHiss: { law: 'add', lo: 0, hi: 1 },
  drumTankFold: { law: 'add', lo: 0, hi: 1 },
  drumHissLatch: { law: 'add', lo: 0, hi: 1 },
  drumKickBank: { law: 'add', lo: 0, hi: 1 },
  monoToyDiv: {
    law: 'hop',
    choices: 4,
    note: 'Heard only while the toy-in cord is up.',
  },
  leadToyDiv: {
    law: 'hop',
    choices: 4,
    note: 'Heard only while the toy-in cord is up.',
  },
  monoCordFrom: {
    law: 'hop',
    choices: 6,
    note: 'Heard only while the toy-in cord is up.',
  },
  leadCordFrom: {
    law: 'hop',
    choices: 6,
    note: 'Heard only while the toy-in cord is up.',
  },
  fmSign: { law: 'hop', choices: 7 },
  fmGroundLoop: { law: 'add', lo: 0, hi: 1 },
  fmSelfBus: { law: 'hop', choices: 9 },
  fmLatch: { law: 'hop', choices: 5 },
  machineLevel: {
    law: 'add',
    scale: 12,
    lo: -12,
    hi: 15,
    knob: 'tapeDrive',
    note: 'Moves the tape machine’s record level in dB and glides there as the knob does, so a stepped wire does not click.',
  },
  machineBias: {
    law: 'add',
    lo: -1,
    hi: 1,
    knob: 'tapeBias',
    note: 'Glides as the knob does, so a kick on it dulls and squashes each hit without a click.',
  },
  machineDrop: {
    law: 'add',
    lo: 0,
    hi: 1,
    knob: 'tapeDrop',
    note: 'Sets how often a patch of shed oxide arrives. A dropout already passing the head plays out when the wire falls back.',
  },
  machineSqueal: { law: 'add', lo: 0, hi: 1, knob: 'tapeSqueal' },
  machineAzimuth: {
    law: 'add',
    lo: 0,
    hi: 1,
    knob: 'tapeAzimuth',
    note: 'Glides as the knob does, so the right head’s lag moves without a click.',
  },
} as const satisfies Record<LiveDest, Law>

export const WIRE_IS_KNOB = new Set<LiveDest>([
  'fmBright',
  'fmNoiseBlob',
  'ringMix',
  'drumRing',
  'chipCrosstalk',
  'chipPwm',
  'fmDacSlip',
  'chipStepTap',
  'chipEnvRelax',
  'chipEnvDiv',
  'chipPwmTap',
  'chipFmClock',
  'chipHold',
  'chipHardSync',
  'chipEnvBits',
  'chipDutyEnv',
  'pcmRunOn',
  'pcmWrite',
  'pcmSignDir',
  'pcmLatch',
  'drumWander',
  'drumStepTap',
  'gndBounce',
  'monoLoopPitch',
  'drumMotor',
  'drumRush',
  'chipPump',
  'chipCrash',
  'fmRot',
  'fmRing',
  'pcmCpuBus',
  'drumRot',
  'drumOutAddr',
  'chipLfsr',
  'pcmSlot',
  'pcmWordRate',
  'pcmRot',
  'fmSkew',
  'fmPitchWire',
  'fmGroundLoop',
  'drumTouch',
  'drumLeak',
  'drumSelfFire',
  'drumKickLevel',
  'drumSnareLevel',
  'drumHatLevel',
  'monoToyIn',
  'drumKickFeed',
  'drumKickVca',
  'drumMixDrive',
  'drumSnareMetal',
  'drumTankBank',
  'drumTankHiss',
  'drumTankFold',
  'drumHissLatch',
  'drumKickBank',
])

export const isLive = (key: string): key is keyof typeof DEST_LAW =>
  Object.hasOwn(DEST_LAW, key)

export const LIVE_DESTS = Object.keys(DEST_LAW).filter(isLive)

const knobOf = (dest: keyof typeof DEST_LAW): string => {
  const law: Law = DEST_LAW[dest]
  return law.knob ?? dest
}

const DEST_OF_KNOB = new Map(LIVE_DESTS.map(d => [knobOf(d), d]))

export const destOfKnob = (key: string) => DEST_OF_KNOB.get(key)

const short = (x: number) => String(Math.round(x * 1000) / 1000)

const held = (lo?: number, hi?: number) =>
  lo !== undefined && hi !== undefined
    ? `, held between ${short(lo)} and ${short(hi)}`
    : lo !== undefined
      ? `, held at ${short(lo)} or above`
      : hi !== undefined
        ? `, held at ${short(hi)} or below`
        : ''

function sentence(dest: keyof typeof DEST_LAW) {
  const law: Law = DEST_LAW[dest]
  return WIRE_IS_KNOB.has(dest)
    ? 'A bay wire at depth d moves it as the knob turned by d would.'
    : law.law === 'add'
      ? `A bay wire at depth d adds ${law.scale === undefined ? 'd' : `${short(law.scale)}·d`} to the knob${held(law.lo, law.hi)}.`
      : law.law === 'oct'
        ? `A bay wire at depth d multiplies it by 2^(${short(law.span)}·d), so depth ${short(1 / law.span)} is an octave up.`
        : law.law === 'hop'
          ? `A bay wire steps it round its ${law.choices} settings, and depth ${short(1 / law.choices)} moves it one setting.`
          : law.law === 'gain'
            ? 'A bay wire scales the machine’s output up to double, and does nothing while this level is at 0.'
            : ''
}

const DEST_AT = new Map<number, keyof typeof DEST_LAW>(
  LIVE_DESTS.map(d => [DEST[d], d]),
)

export const destAt = (id: number) => DEST_AT.get(id)

export const destFor = (key: string) =>
  isControlKey(key) && destOfKnob(key)
    ? destOfKnob(key)
    : isLive(key)
      ? key
      : undefined

export function lawText(dest: keyof typeof DEST_LAW) {
  const law: Law = DEST_LAW[dest]
  return [sentence(dest), law.note].filter(Boolean).join(' ')
}

export function wireLaw(key: string) {
  const dest = isControlKey(key) ? destOfKnob(key) : undefined
  return dest ? lawText(dest) : undefined
}
