// Morphing the whole board: where every control was, where it is going, and what
// each one is allowed to do on the way. Picking a preset or rolling a random
// board normally lands in one frame; this is the same move taken slowly, so the
// sound travels there instead of cutting.
//
// It earns its place beyond being a smooth transition: the interesting boards
// are *between* the presets, and a jump has never played you one. A morph walks
// the path — straight through the exact chipStarve where the toy gives up and
// reboots, the dlyFb where the delay stops decaying and starts building — so the
// gesture that performs a change is also the only way to hear where this board's
// thresholds actually are.
//
// Pure and frame-free on purpose: the engine owns the clock, this owns the
// answer to "what does the board look like a third of the way along".

import { CONTROL_KEYS, type ControlKey, type Controls } from '../controls'
import { CUT_KEYS, HOLD_KEYS } from '../ui/controls'

// Eased, not linear. A linear morph lurches into motion and stops dead, which
// reads as two cuts with a slide between them; smoothstep leaves and arrives at
// rest, so the whole thing sounds like one movement.
const ease = (t: number): number => t * t * (3 - 2 * t)

export class Glide {
  // The keys that actually differ, split by how they travel. Worked out once: a
  // morph typically moves a couple of dozen of the two hundred controls, and
  // walking all of them every frame is work with a known answer.
  private readonly travel: ControlKey[]
  private readonly switching: ControlKey[]

  constructor(
    private readonly from: Controls,
    private readonly to: Controls,
    // Keys HOLD_KEYS would otherwise shield — set by a caller that means to
    // change one of them on purpose, such as a reset that owns outGain.
    forceKeys: ReadonlySet<ControlKey> = new Set(),
  ) {
    const moved = CONTROL_KEYS.filter(
      k => (forceKeys.has(k) || !HOLD_KEYS.has(k)) && from[k] !== to[k],
    )
    this.travel = moved.filter(k => !CUT_KEYS.has(k))
    this.switching = moved.filter(k => CUT_KEYS.has(k))
  }

  // The board `t` of the way along, 0..1, written over `base` — the engine's
  // live controls, so anything a hand moved mid-morph survives on the keys this
  // morph is not touching.
  at(base: Controls, t: number): Controls {
    const next = { ...base }
    if (t >= 1) {
      // The landing frame assigns the destination rather than evaluating the
      // path at t=1: `from + (to - from) * 1` is not bit-identical to `to`, and
      // the share link writes every control that differs from stock. A morph
      // that stopped a float's width short would put the whole board in the URL.
      for (const k of this.travel) next[k] = this.to[k]
      for (const k of this.switching) next[k] = this.to[k]
      return next
    }
    const e = ease(t)
    for (const k of this.travel)
      next[k] = this.from[k] + (this.to[k] - this.from[k]) * e
    // Modes cut at the midpoint. Nothing hides that and nothing should: half a
    // distortion circuit is not a sound, so there is no honest in-between to
    // play. The midpoint is where the cut is least conspicuous, with everything
    // around it at full tilt.
    for (const k of this.switching)
      next[k] = e < 0.5 ? this.from[k] : this.to[k]
    return next
  }
}
