export const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
