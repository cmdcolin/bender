import type { ModBus } from './modbus'
import type { TriggerBus } from './trigbus'

export interface StereoBlock {
  l: Float32Array
  r: Float32Array
  n: number
}

// Shared buses a stage may read beyond its own params. mic is the leveled mono
// input for this block; micPatch (in params) decides which stage consumes it.
// fb is last block's feedback-bus output; fbDest decides where it lands.
//
// The supply buses model one wall-wart feeding the whole board: railV and sag
// are written this block by whoever owns them (ToyChip, Brownout), and droop
// is the worse of the two from last block — what everything else reads to know
// the power is dying. env is last block's output envelope.
export interface Ctx {
  sr: number
  mic: Float32Array
  fb: Float32Array
  railV: Float32Array
  sag: Float32Array
  droop: Float32Array
  env: Float32Array
  /** the chip's sequencer phase, 0 to 1 across the current ROM step */
  step: Float32Array
  mod: ModBus
  /** the trigger lines of the two boxes, for whatever has bridged them */
  trig: TriggerBus
}

export interface Stage {
  label: string
  when?(p: Float32Array): boolean
  process(io: StereoBlock, p: Float32Array, ctx: Ctx): void
  panic(): void
}

export const BLOCK = 128
