// Phase and interval arithmetic — the two things the board does to numbers
// before they are frequencies.

// Bring an advanced phase back into [0, 1).
//
// No increment on this board reaches a whole cycle — every one of them is a
// frequency divided by the sample rate, and the fastest is clamped under
// Nyquist — so one subtraction is the modulo. The `% 1` is what a phase moving
// faster than that would need, and it costs a compare that never fires to keep
// this the same function `% 1` is.
//
// Worth less than it looks. Ten phases a sample go through here and `% 1` is
// fmod, which costs 16.5 ns on a chain where each turn waits for the last one;
// but these ten are independent, the hardware overlaps them, and measured that
// way the compare saves 0.65 ns a turn. Six nanoseconds a sample against two
// thousand is inside the noise of a shared machine. It stays because it is
// exact and it reads no worse, not because it showed up.
export const wrap1 = (phase: number) =>
  phase < 1 ? phase : phase < 2 ? phase - 1 : phase % 1

// Shift by a number of octaves, which is what every mod lane on this board does
// to a frequency.
//
// `Math.pow(2, x)` is the way to write it and the most expensive call the audio
// thread makes: 35 ns, where the exp it is built on is 21. Twelve of these sit
// inside sample loops — every wired destination that moves a pitch, a cutoff, a
// delay time or a clock — so a patched-up board pays several of them a sample.
//
// The two do not agree to the last bit. They agree to 8e-16 relative, which is
// 1.5e-12 cents: the disagreement is where doubles round, not where the maths
// differs, and nothing downstream of a pitch bend can carry it.
export const octaves = (x: number) => Math.exp(x * Math.LN2)

// What the chip's semitone zero is worth in hertz. The divider counts up from
// A3 and the key line carries the same numbering, so anything that has to agree
// with the toy about the pitch of a note — the toy itself, and now the ring
// mod's carrier — starts here. Two copies of this number are two chips that
// slowly stop being in tune with each other.
export const A3_HZ = 220
