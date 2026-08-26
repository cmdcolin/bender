import { coef } from './follower'
import { flushDenormal, softclip } from './softclip'

/** How far apart the two rails can be pushed, as a share of the nominal one.
    Past this the smaller rail is doing all the clipping and the larger one has
    stopped being a rail at all. */
const ASYM_MAX = 0.85
/** Where the slew knob runs from and to, as the corner a full-scale sine stops
    getting through cleanly. The top is above anything in the band, so the knob
    leaves the amp alone before it starts taking edges off it. */
const SLEW_TOP = 20000
const SLEW_BOTTOM = 150
/** How fast the coupling cap takes on charge against how slowly it gives it
    back. The ratio is the whole of why blocking motorboats rather than just
    ducking: the stage is driven into cutoff inside a couple of cycles and then
    has to wait out the discharge before it can conduct again. */
const BLOCK_ATK = 0.0015
const BLOCK_REL = 0.09
/** How much charge it takes to reach cutoff, against how little it takes to come
    back. Two thresholds rather than one, because cutting off is not a fade: a
    stage that has stopped conducting draws no current at all, so nothing is
    left to hold the cap where it is and the only way back is the leak. One
    threshold let the loop find a level where it sat half-blocked forever —
    which is a compressor, and the whole point of this is that it is not one. */
const BLOCK_GAIN = 2
const BLOCK_RECOVER = 0.35
/** How far down the knob drags the level at which current starts flowing where
    the cap can only leak it back. At rest a stage blocks only when something
    slams it well past its rails, which is a fault you would have to go looking
    for; wound up it blocks on ordinary programme, which is a coupling cap that
    has dried out. The knob is where the stage gives up, not how hard. */
const BLOCK_KNEE = 0.85
/** Where a falling rail stops being headroom and starts being gain. Above it
    the stage still amplifies what it always did and simply has less room to do
    it in; below it the bias is going with the supply and the stage is on its
    way to not being an amplifier. Without that second half the desk merely
    clips lower, and three strips summing into the bus put the level straight
    back — a rail has to be able to kill the loop, not just quieten it. */
const RAIL_KNEE = 0.7

export interface AmpVoicing {
  /** 0 leaves the tanh alone; 1 is a hard rail. */
  rails: number
  /** Which rail is the short one, −1 to 1. */
  asym: number
  /** Volts per sample the output can move. 0 is an amp fast enough not to care. */
  slewStep: number
  /** 0 takes the coupling cap out of the circuit. */
  block: number
  blockAtk: number
  blockRel: number
}

export function ampVoicing(
  rails: number,
  asym: number,
  slew: number,
  block: number,
  sr: number,
): AmpVoicing {
  // A knob at rest is a stage that isn't there, not a stage set gently: the
  // slew limiter and the coupling cap both leave the sample untouched at zero,
  // so a board that never asked for either renders what it always rendered.
  const corner =
    slew > 0 ? SLEW_TOP * Math.pow(SLEW_BOTTOM / SLEW_TOP, slew) : 0
  return {
    rails,
    asym: Math.min(Math.max(asym, -1), 1) * ASYM_MAX,
    slewStep: corner > 0 ? (2 * Math.PI * corner) / sr : 0,
    block,
    blockAtk: coef(BLOCK_ATK, sr),
    blockRel: coef(BLOCK_REL, sr),
  }
}

/**
 * One cheap amplifier, and the three ways it stops being one.
 *
 * Everything else on this board saturates through `softclip`, which is a tanh:
 * odd, smooth, and the sound of something being driven warmly. None of the
 * three below are that. They are what a small op-amp on a starved supply does
 * when a feedback loop asks it for more than it has, and between them they are
 * most of the difference between a loop that howls and a loop that detonates.
 *
 * **Rails.** A real output stage does not roll off into its ceiling, it hits
 * the supply and stops — and the two supplies are never the same size, so one
 * half of the wave squares off before the other. That asymmetry is the even
 * harmonics, and the dc it leaves walks the operating point of everything
 * downstream of it, which is what the safety tail's dc blocker is there for.
 *
 * **Slew.** An amp asked for an edge faster than it can swing puts out a ramp
 * instead. On one tone that is a dull sort of distortion; on two it is neither
 * tone's harmonics, because what the limiter does to a sum is not what it does
 * to either part. That is the intermodulation hash under a loop full of
 * detuned squeals, and it is the one thing here with no harmonic structure at
 * all to fall back on.
 *
 * **The supply.** All of it runs off the same rail, and the rail is not
 * infinite. The amps draw on it by how hard they are working, so a loop that
 * climbs pulls its own ceiling down, which drops what it puts out, which lets
 * the rail back up again — negative feedback with a fiftieth of a second of lag
 * in it, which is not a level to settle at but a cycle to go round. Against the
 * cap's own cycle and whatever the ring is doing, none of the three periods
 * divide into each other and the desk stops repeating itself.
 *
 * **Blocking.** Drive a capacitively-coupled stage hard enough and current
 * flows where the cap can only leak it back slowly. The charge walks the bias
 * toward cutoff, the stage stops conducting, and with no signal getting through
 * there is nothing left to hold the charge — so it drains, the stage comes back,
 * and it blocks again. The loop dies, rebuilds out of whatever noise is on the
 * bus, and dies again, at a rate set by how hard it is being driven rather than
 * by anything with a rate control on it.
 */
export class LoopAmp {
  private slewY = 0
  private cap = 0
  private cutoff = false

  process(x: number, rail: number, v: AmpVoicing): number {
    // Squared rather than proportional below the knee. A stage losing its bias
    // does not give up its gain in step with the volts — it holds on and then
    // goes, and it is that shoulder that decides whether a desk with a sagging
    // supply finds a quieter level to sit at or cannot hold any level at all.
    let y = x
    if (rail < RAIL_KNEE) {
      const k = rail / RAIL_KNEE
      y = x * k * k
    }

    if (v.block > 0) {
      // Charge comes off how far past the knee the input is asking to go, so a
      // stage working under it never blocks however long it runs — and a stage
      // that has already cut off takes on no more of it, because no current is
      // flowing to carry any. That is the whole difference between a motorboat
      // and a gate: once it is off, the only way back is the leak, and how long
      // that takes is set by the cap rather than by whatever the bus is doing.
      const excess = this.cutoff ? 0 : Math.abs(y) - (1 - BLOCK_KNEE * v.block)
      const want = excess > 0 ? excess : 0
      this.cap = flushDenormal(
        this.cap +
          (want > this.cap ? v.blockAtk : v.blockRel) * (want - this.cap),
      )
      // Charge is read off what arrives, not off what gets out. In a loop those
      // are the same wire, so a stage that merely leaned on its own output would
      // talk itself into a steady half-open state and stay there.
      const into = this.cap * BLOCK_GAIN
      if (this.cutoff) {
        if (into > BLOCK_RECOVER) {
          this.slewY = 0
          return 0
        }
        this.cutoff = false
      } else if (into >= 1) {
        this.cutoff = true
        this.slewY = 0
        return 0
      }
      y *= 1 - into
    }

    if (v.slewStep > 0) {
      const step = Math.min(Math.max(y - this.slewY, -v.slewStep), v.slewStep)
      this.slewY = flushDenormal(this.slewY + step)
      y = this.slewY
    }

    const ceil = rail * (1 + (y < 0 ? -v.asym : v.asym))
    const soft = softclip(y / ceil) * ceil
    if (v.rails <= 0) return soft
    const hard = y > ceil ? ceil : y < -ceil ? -ceil : y
    return soft + v.rails * (hard - soft)
  }

  reset() {
    this.slewY = 0
    this.cap = 0
    this.cutoff = false
  }
}
