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
} as const
