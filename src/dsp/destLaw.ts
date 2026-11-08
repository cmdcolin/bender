import { MACHINES } from '../machines.ts'
import { DEST } from './modbus.ts'

export type DestKey = keyof typeof DEST

export const WIRE_IS_KNOB = new Set<DestKey>([
  'fmBright',
  'fmNoiseBlob',
  'ringMix',
  'drumRing',
  'chipCrosstalk',
  'chipPwm',
  'fmDacSlip',
  'fmAlloc',
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

export const WIRE_IS_GAIN = new Set<DestKey>(MACHINES.map(m => m.levels[0]))

export const isDestKey = (key: string): key is DestKey =>
  Object.hasOwn(DEST, key)

export function wireLaw(key: string) {
  return !isDestKey(key)
    ? undefined
    : WIRE_IS_KNOB.has(key)
      ? 'a bay wire at depth d moves it as the knob turned by d would'
      : WIRE_IS_GAIN.has(key)
        ? 'a bay wire scales the machine’s output, and does nothing while this level is at 0'
        : 'a bay wire moves it on this destination’s own curve'
}
