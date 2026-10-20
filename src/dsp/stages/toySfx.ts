// The toy's effect buttons. Each is a short program for a sweep counter that
// loads the melody's divider, plus the noise register for the two that blow
// up. A program is a curve over its own length, read at the chip's clock, so
// a flat battery or a pot on the timing pin stretches a laser zap as it lowers
// it.
export const SFX_NAMES = ['laser', 'siren', 'ufo', 'bomb', 'gun', 'bird']

const LEN_S = [0.14, 1.6, 0.9, 2.4, 0.075, 0.22]

export const sfxLength = (sfx: number) => LEN_S[sfx] ?? 0

/** One sample of a program: the square's pitch in octaves over A3 and its
    level, then the noise register's clock in octaves over A3 and its level. */
export interface SfxFrame {
  oct: number
  tone: number
  noiseOct: number
  noise: number
}

const BOMB_FALL = 0.6
const BIRD_CHIRP = 0.4
const UFO_WOBBLE_HZ = 12

/** Fills `f` with program `sfx` at `t` seconds into a pass. */
export function sfxAt(sfx: number, t: number, f: SfxFrame) {
  const u = Math.min(t / sfxLength(sfx), 1)
  f.oct = 0
  f.tone = 0
  f.noiseOct = 0
  f.noise = 0
  switch (sfx) {
    case 0:
      f.oct = 1 + 3.5 * (1 - u) ** 3
      f.tone = 1 - 0.6 * u
      return
    case 1:
      f.oct = 1 + (u < 0.5 ? 2 * u : 2 - 2 * u)
      f.tone = 1
      return
    case 2:
      f.oct = 2 + 0.6 * u + 0.3 * Math.sin(2 * Math.PI * UFO_WOBBLE_HZ * t)
      f.tone = 1
      return
    case 3:
      if (u < BOMB_FALL) {
        const v = u / BOMB_FALL
        f.oct = 3.5 - 2.5 * v ** 1.5
        f.tone = 0.25 + 0.5 * v
      } else {
        const w = (u - BOMB_FALL) / (1 - BOMB_FALL)
        f.noiseOct = 5 - 4 * w
        f.noise = (1 - w) ** 2
      }
      return
    case 4:
      f.oct = -u
      f.tone = 0.6 * (1 - u) ** 3
      f.noiseOct = 5
      f.noise = (1 - u) ** 2
      return
    case 5:
      if (u < BIRD_CHIRP) {
        const v = u / BIRD_CHIRP
        f.oct = 2.8 + 1.4 * v
        f.tone = Math.sin(Math.PI * v)
      }
  }
}
