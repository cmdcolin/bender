export interface StereoBlock {
  l: Float32Array
  r: Float32Array
  n: number
}

// Shared buses a stage may read beyond its own params. mic is the leveled mono
// input for this block; micPatch (in params) decides which stage consumes it.
export interface Ctx {
  sr: number
  mic: Float32Array
}

export interface Stage {
  label: string
  when?(p: Float32Array): boolean
  process(io: StereoBlock, p: Float32Array, ctx: Ctx): void
  panic(): void
}

export const BLOCK = 128
