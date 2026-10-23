import { STEPS } from '../drums.ts'

/** Bars a whole-board change waits for: it lands on the next downbeat of a run
    this long. 0 lands it at once. */
export const PHRASE_LOCKS = [0, 1, 4, 8, 16] as const
export type PhraseLock = (typeof PHRASE_LOCKS)[number]

export interface CounterReport {
  tick: number
  clock: number
  stepMs: number
  ageMs: number
}

/** Milliseconds until the kit's counter reaches `tick`. The counter runs ahead
    of the ear, so this is when the change has to reach the worklet. */
export const msUntilTick = (tick: number, r: CounterReport) =>
  (tick - r.tick - r.clock) * r.stepMs - r.ageMs

/** The first downbeat of a run of `bars` that a change taking `seconds` can
    still reach in full, or null while the counter has no tempo to go by. */
export function landingTick(
  r: CounterReport,
  bars: number,
  seconds: number,
): number | null {
  if (r.stepMs <= 0 || bars <= 0) return null
  const run = bars * STEPS
  let at = (Math.floor(r.tick / run) + 1) * run
  while (msUntilTick(at, r) < seconds * 1000) at += run
  return at
}
