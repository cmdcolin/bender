import { DRUM_VOICES } from '../drums.ts'

import type { ControlKey } from '../controls.ts'

// The knobs each box of a die drawing opens. The pot solders onto the clock,
// the counter, the bias or the gate, so each of those boxes opens it.

export const POT: readonly ControlKey[] = ['chipBendSpot', 'chipBendPot']

export const NODE_KEYS: Record<string, readonly ControlKey[]> = {
  'key matrix': [
    'chipGhost',
    'chipOutKeys',
    'chipKeyScan',
    'sfxWire',
    'sfxPick',
  ],
  'tune ROM': [
    'chipOutAddr',
    'chipOutData',
    'chipKitAddr',
    'chipStepTap',
    'chipCrash',
    ...POT,
  ],
  clock: [
    'chipClockX',
    'chipDrift',
    'chipCrosstalk',
    'chipFmClock',
    'chipHardSync',
    'chipPump',
    ...POT,
  ],
  voices: ['chipShort', 'chipPwmTap', 'chipXor', 'chipDutyEnv', 'chipLfsr'],
  envelope: [
    'chipEnvCap',
    'chipEnvRelax',
    'chipEnvDiv',
    'chipPwm',
    'chipEnvBits',
    ...POT,
  ],
  'output pin': ['chipScan', 'chipHold', 'chipBodge', 'chipBodgeR', ...POT],
}

export const VOICE_BOXES = {
  'one-shots': [
    'drumPulse',
    'drumPulseShare',
    'drumTrigLoad',
    ...DRUM_VOICES.map(v => v.decay),
  ],
  tanks: [
    'drumRing',
    'drumMotor',
    'drumSweep',
    'drumSwoopCap',
    'drumLeak',
    'drumTomSweep',
    'drumTomSwoop',
    'drumSnareSweep',
    'drumSnareSwoop',
    'drumTankCouple',
    'drumHissKick',
    'drumKickFeed',
    'drumKickFeedFrom',
    'drumTankTap',
    'drumBankSync',
    'drumTankBank',
    'drumTankHiss',
    'drumTankFold',
  ],
  'metal bank': [
    'drumCymTone',
    'drumSpread',
    'drumSquare',
    'drumBankStarve',
    'drumBankGate',
    'drumBankFm',
    'drumKickBank',
  ],
  noise: [
    'drumSnappy',
    'drumNoiseBias',
    'drumKickBias',
    'drumClapGap',
    'drumClapCount',
    'drumDice',
    'drumMetal',
    'drumSnareMetal',
    'drumHissLatch',
  ],
} as const satisfies Record<string, readonly ControlKey[]>
