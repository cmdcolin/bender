export function softclip(x: number): number {
  return Math.tanh(x)
}

export function flushDenormal(x: number): number {
  return Math.abs(x) < 1e-15 ? 0 : x
}
