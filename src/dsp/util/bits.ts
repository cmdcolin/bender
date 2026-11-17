export function popcount(word: number) {
  const a = word - ((word >>> 1) & 0x55555555)
  const b = (a & 0x33333333) + ((a >>> 2) & 0x33333333)
  return Math.imul((b + (b >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}
