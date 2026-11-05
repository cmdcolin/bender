import { CYCLE } from '../drums.ts'
import { N_PARAMS } from '../engine/params.ts'

const reached = (tick: number, at: number) =>
  (tick - at + CYCLE) % CYCLE < CYCLE / 2

// Params waiting on the kit's counter. The kit calls reach() on the sample its
// counter steps, so a cue on a downbeat is in place before that step reads its
// pattern. Once landed it holds over each new board from the main thread until
// the next cue or a drop, because the main thread only learns of the landing
// from the next meter.
export class Cue {
  landed = 0
  private id = 0
  private at = -1
  private holding = false
  private readonly vals = new Float32Array(N_PARAMS)
  private readonly mask = new Uint8Array(N_PARAMS)
  private readonly board: Float32Array

  constructor(board: Float32Array) {
    this.board = board
  }

  arm(id: number, at: number, vals: Float32Array, mask: Uint8Array) {
    this.vals.set(vals)
    this.mask.set(mask)
    this.id = id
    this.at = at
    this.holding = false
  }

  drop() {
    this.at = -1
    this.holding = false
  }

  reach(tick: number, p: Float32Array) {
    if (this.at >= 0 && reached(tick, this.at)) {
      this.overlay(p)
      this.overlay(this.board)
      this.at = -1
      this.holding = true
      this.landed = this.id
    }
  }

  hold() {
    if (this.holding) this.overlay(this.board)
  }

  private overlay(into: Float32Array) {
    const { mask, vals } = this
    for (let i = 0; i < N_PARAMS; i++) if (mask[i]) into[i] = vals[i]!
  }
}
