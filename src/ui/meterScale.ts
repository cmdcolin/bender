// Where a channel doing nothing at all sits on the bar. A fader is linear and
// hearing is not: half up is six decibels down, which on a linear meter is a bar
// still half full. Forty-eight decibels of travel puts a channel you can only
// just hear at the left-hand end rather than off the scale.
const FLOOR_DB = 48
const HOT_DB = 3
export const HOT = 1 - HOT_DB / FLOOR_DB

// Where a falling bar stops, 120 dB down, so the fall ends in a finite number
// of frames.
export const SILENT = 1e-6

// How fast a bar falls. The taps come back as the peak since the last meter,
// sixteen milliseconds of it, and a kick read that way is one frame at full and
// then nothing — so the rise is instant and the fall is not, which is what every
// meter with a needle in it does for the same reason.
export const FALL = 0.86

export const position = (v: number) =>
  v <= 0 ? 0 : Math.min(Math.max(1 + (20 * Math.log10(v)) / FLOOR_DB, 0), 1)
