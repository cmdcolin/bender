import { snapToStep } from './controls'

import type { SliderDef } from './controls'

// A speed you can hear but cannot name. The tempo, the delay time and the bay's
// oscillator are all the same question asked in three units — how long between
// one of these and the next — and a hand knows the answer before a number does.
// Tapping is how every machine on the board's shelf asks it, and this is that,
// in the row rather than in a box of its own.
//
// The arithmetic is the MIDI clock's, which has taken a tempo off arrival times
// since the panel could read one (midi.ts › bpmFromPulses): the run's span over
// its gaps, so a late press in the middle is worth no more than its share.

/** Longer than this between presses, and the new one starts a count of its own
    rather than joining the last. Two seconds is a beat at 30 bpm, which is
    slower than anything anybody taps; past it, a press is somebody coming back
    to the row rather than keeping time. */
export const TAP_GAP_MS = 2500

/** How many gaps the reading is averaged over. Enough that one clumsy press is
    outvoted, few enough that the row still follows you when you change your
    mind about the speed halfway through. */
export const TAP_GAPS = 4

/** The run a press belongs to: the one that was going, or this press alone. */
export function tapRun(times: readonly number[], now: number): number[] {
  const last = times[times.length - 1]
  return last === undefined || now - last > TAP_GAP_MS
    ? [now]
    : [...times, now].slice(-(TAP_GAPS + 1))
}

// What one gap is worth on the row being tapped, which is the whole of what
// this has to know about the control. A tempo is beats a minute, a rate is
// cycles a second, and a delay time is the gap itself.
const perGap = (unit: string, gap: number) =>
  unit === 'bpm' ? 60000 / gap : unit === 'Hz' ? 1000 / gap : gap

/** What the run says the control should be, or nothing while one press is not
    yet a speed: two presses are a gap, and a gap is the answer. Clamped to the
    row's own travel, so tapping slower than the knob goes parks it at the end
    of its travel rather than somewhere off it. */
export function tapValue(
  def: SliderDef,
  times: readonly number[],
): number | undefined {
  const first = times[0]
  const last = times[times.length - 1]
  return first === undefined || last === undefined || times.length < 2
    ? undefined
    : snapToStep(def, perGap(def.unit, (last - first) / (times.length - 1)))
}
