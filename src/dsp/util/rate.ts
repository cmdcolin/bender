export const REF_SR = 48000

export const perRef = (sr: number) => REF_SR / sr

export const poleAt = (pole: number, sr: number) => pole ** perRef(sr)

export const stepAt = (coef: number, sr: number) =>
  -Math.expm1(Math.log1p(-coef) * perRef(sr))
