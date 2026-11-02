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
  'output pin': ['chipScan', 'chipHold', ...POT],
}

export const VOICE_BOXES = {
  'one-shots': ['drumPulse', 'drumPulseShare', 'drumTrigLoad'],
  tanks: [
    'drumRing',
    'drumMotor',
    'drumSweep',
    'drumTankCouple',
    'drumBankSync',
  ],
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
