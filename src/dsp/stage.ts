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
  /**
   * How bright the chain is running, signed: positive when there is more
   * high-frequency energy in the loop than programme, negative when it has gone
   * dull. The second global bus, and deliberately the fast one — droop is slow
   * and never negative, so on its own it can only make every stage pump in step.
   * Two buses that disagree are what let the board argue with itself.
   */
  bright: Float32Array
  /** 0 cold, 1 as hot as the board gets. Block rate: it moves over minutes. */
  heat: number
  /**
   * Which pin the feedback return is actually on this block. The relay walks it
   * off the one the param names, so every stage that consumes the return reads
   * it from here — otherwise half the board thinks the wire is somewhere else.
   */
  fbDest: number
  mod: ModBus
  /** the trigger lines of the two boxes, for whatever has bridged them */
  trig: TriggerBus
}

export interface Stage {
  label: string
  when?(p: Float32Array, ctx: Ctx): boolean
  process(io: StereoBlock, p: Float32Array, ctx: Ctx): void
  panic(): void
}

export const BLOCK = 128
