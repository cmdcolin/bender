import { ROMS } from '../../src/dsp/stages/roms.ts'

export const ROM_BYTES = 8192
export const STEPS = 32
export const REST_CODE = 12
export const HOLD_CODE = 13
const BASE_BELOW_A3 = 12
const TOP_OCTAVE = 3

export const divisor = (semi: number) => Math.round(256 * 2 ** (-semi / 12))

export const codeOf = (step: number) => {
  if (step === -1) return REST_CODE
  if (step === -2) return HOLD_CODE
  const n = step + BASE_BELOW_A3
  const oct = Math.floor(n / 12)
  if (n < 0 || oct > TOP_OCTAVE)
    throw new Error(`step ${step} is outside four octaves`)
  return (oct << 4) | (n % 12)
}

export const stepOf = (code: number) => {
  const semi = code & 15
  if (semi === REST_CODE) return -1
  if (semi === HOLD_CODE) return -2
  return (code >> 4) * 12 + semi - BASE_BELOW_A3
}

export function tuneImage(): Uint8Array {
  const image = new Uint8Array(ROM_BYTES).fill(REST_CODE)
  ROMS.forEach((rom, bank) => {
    for (let i = 0; i < STEPS; i++)
      image[bank * STEPS + i] = codeOf(rom.steps[i % rom.steps.length]!)
  })
  return image
}

export function semitoneImage(): Uint8Array {
  const image = new Uint8Array(ROM_BYTES)
  for (let semi = 0; semi < 12; semi++)
    image[semi] = (256 - divisor(semi)) & 255
  return image
}

export const tempoHz = (masterHz: number, tap: number) => masterHz / 2 ** tap
