import type { ControlKey } from '../controls.ts'

// The knobs each box of a die drawing opens. The pot solders onto the clock,
// the counter, the bias or the gate, so each of those boxes opens it.

const POT: readonly ControlKey[] = ['chipBendSpot', 'chipBendPot']

export const NODE_KEYS: Record<string, readonly ControlKey[]> = {
  'key matrix': ['chipGhost'],
  'tune ROM': ['chipOutAddr', 'chipOutData', 'chipStepTap', ...POT],
  clock: [
    'chipClockX',
    'chipDrift',
    'chipCrosstalk',
    'chipFmClock',
    'chipHardSync',
    ...POT,
  ],
  voices: ['chipShort', 'chipPwmTap', 'chipXor', 'chipDutyEnv'],
  envelope: [
    'chipEnvCap',
    'chipEnvRelax',
    'chipEnvDiv',
    'chipPwm',
    'chipEnvBits',
    ...POT,
  ],
  'output pin': ['chipScan', 'chipHold', ...POT],
}

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
