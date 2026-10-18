import type { ControlKey } from '../controls.ts'

// The knobs each box of a die drawing opens.

export const NODE_KEYS: Record<string, readonly ControlKey[]> = {
  'key matrix': ['chipGhost'],
  'tune ROM': ['chipOutAddr', 'chipOutData', 'chipStepTap'],
  clock: [
    'chipClockX',
    'chipDrift',
    'chipCrosstalk',
    'chipFmClock',
    'chipHardSync',
  ],
  voices: ['chipShort', 'chipPwmTap', 'chipXor', 'chipDutyEnv'],
  envelope: [
    'chipEnvCap',
    'chipEnvRelax',
    'chipEnvDiv',
    'chipPwm',
    'chipEnvBits',
  ],
  'output pin': ['chipScan', 'chipHold'],
}

export const BEND_KEYS: readonly ControlKey[] = ['chipBendSpot', 'chipBendPot']

export const VOICE_BOXES = {
  'one-shots': ['drumPulse', 'drumPulseShare', 'drumTrigLoad'],
  tanks: ['drumRing', 'drumSweep', 'drumTankCouple', 'drumBankSync'],
  'metal bank': [
    'drumCymTone',
    'drumSpread',
    'drumSquare',
    'drumBankStarve',
    'drumBankGate',
    'drumBankFm',
  ],
  noise: [
    'drumSnappy',
    'drumNoiseBias',
    'drumClapGap',
    'drumClapCount',
    'drumDice',
    'drumMetal',
  ],
} as const satisfies Record<string, readonly ControlKey[]>
