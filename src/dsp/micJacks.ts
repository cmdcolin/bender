import { IDX } from '../engine/params.ts'

import type { Ctx } from './stage.ts'

// Where the mic wire can be soldered, by the micPatch value that picks it.
// Saved boards store the number, so new jacks go on the end.
export const MIC = {
  mix: 0,
  toyRail: 1,
  oscFm: 2,
  delayFb: 3,
  ringCarrier: 4,
  drumTrig: 5,
  glitchTrig: 6,
  toyClock: 7,
  toyAddr: 8,
  toyData: 9,
  oscSync: 10,
  tapeMotor: 11,
  growlerIn: 12,
  glintBus: 13,
  crushClock: 14,
  clipBypass: 15,
  howlerIn: 16,
} as const

/** micPatch2 counts from "off", so its jack is one less than its value. */
export const secondJack = (p: Float32Array) => Math.round(p[IDX.micPatch2]!) - 1

/** The mic as the jack hears it: the first wire's signal, the second's, or
    null with no wire on the jack. The first wire wins a jack both are on. */
export function micInto(
  p: Float32Array,
  ctx: Pick<Ctx, 'mic' | 'mic2'>,
  jack: number,
) {
  return Math.round(p[IDX.micPatch]!) === jack
    ? ctx.mic
    : secondJack(p) === jack
      ? ctx.mic2
      : null
}
