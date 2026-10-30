import type { ModBus } from './modbus.ts'
import type { TriggerBus } from './trigbus.ts'

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
// are written this block by whoever owns them (the shared cells, Brownout), and droop
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
   * One source on its own, mono and dry, for whatever wants to multiply by a
   * machine rather than by an oscillator. Taken the same way the meters are —
   * as the difference that source made to the sum — and written only for the
   * one source `ringFrom` names, so a board that asks for nothing carries a
   * bus of zeros.
   */
  carrier: Float32Array
  /**
   * The toy chip on its own, taken the same way as the carrier, for the kit's
   * converter to use as its reference. Zeros unless the kit asks for it.
   */
  toy: Float32Array
  /**
   * The FM chip on its own, taken the same way, a block late: the toy runs
   * first, so it hears what the FM chip played last block. Zeros unless the
   * toy's timing pin asks for it.
   */
  fm: Float32Array
  /**
   * The second word for the crusher's logic gate: one source on its own, taken
   * the same way as the carrier, for whichever `crushWith` names. Zeros unless
   * the gate is on.
   */
  logic: Float32Array
  /** Kit hits thrown to the tape delay this block, mono and dry. */
  send: Float32Array
  /**
   * How bright the chain is running, signed: positive when there is more
   * high-frequency energy in the loop than programme, negative when it has gone
   * dull. The second global bus, and deliberately the fast one — droop is slow
   * and never negative, so on its own it can only make every stage pump in step.
   * Two buses that disagree are what let the board argue with itself.
   */
  bright: Float32Array
  gnd: Float32Array
  regs: Uint8Array
  /**
   * Last block's output, mono, taken where the feedback bus is tapped: past the
   * dc blocker and the safety clipper, before the limiter. What a record head
   * laid across the board's own output would be hearing — which is a block
   * behind, the way two heads an inch apart on a loop are.
   */
  out: Float32Array
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

/** The buses a stage writes for others to read, which the chain checks after
    that stage runs so a non-finite sample there is blamed on its writer. */
export type WrittenBus = 'sag' | 'step' | 'send'

export interface Stage {
  label: string
  writes?: readonly WrittenBus[]
  when?(p: Float32Array, ctx: Ctx): boolean
  process(io: StereoBlock, p: Float32Array, ctx: Ctx): void
  panic(): void
}

export const BLOCK = 128
export const GLINT_REGS = 64

// Blocks between meter posts. Everything downstream draws off a frame callback,
// so posting faster than a frame buys nothing and costs the audio thread a 2 kB
// buffer, a copy and a hand across the wire. It lives here rather than in the
// worklet because the main thread counts the posts against it: they leave from
// inside the render, so their rate is what says the audio thread is keeping up.
export const METER_EVERY = 6 // ~16 ms at 48 k
