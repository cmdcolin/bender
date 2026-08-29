import { flushDenormal, softclip } from './softclip'

// Where the transistor starts running out of rail, and where it stops
// altogether. A hit lands around 1 and an accent around 1.7, so the knee has to
// sit above the first and near the second — an accent should arrive at the edge
// of the transistor's range, which is what an accent sounded like.
//
// Below the knee it has to be *exactly* transparent, not nearly. A saturator
// applied to a feedback state is applied again every sample, so a curve that
// takes a thousandth off a swing takes it a thousand times over: the first
// version of this squashed by under a percent at unity and rang the kick down
// in a fifth of the time the damping asked for. What a tank hands back is the
// damping's business and nothing else's.
const KNEE = 1.4
const CEILING = 2.2
const OVER = CEILING - KNEE

const rail = (x: number): number => {
  const a = Math.abs(x)
  if (a <= KNEE) return x
  const y = KNEE + OVER * softclip((a - KNEE) / OVER)
  return x < 0 ? -y : y
}

// The network every pitched voice on a real drum machine is built around, and
// the reason those voices are not oscillators with envelopes hung on them.
//
// A bridged-T is a handful of resistors and capacitors wrapped around one
// transistor. Nothing in it runs until the trigger dumps a pulse in; then it
// rings, and the ringing is the drum. So decay is not a shape laid over a tone.
// It is how much of each swing the transistor hands back, which makes the decay
// knob a feedback knob — and a feedback knob has a far side. Wind it until the
// network returns more than it took and the drum stops being a hit: it becomes
// a note, which the pattern retunes rather than restrikes.
//
// The pitch falling through a hit comes out of the same part. The pulse drives
// the transistor a long way from the bias it settles at, and what the network
// is tuned to depends on what the transistor looks like from outside it, so a
// large swing is a high tuning and it comes down as the swing comes down. Which
// means the drop is a consequence of how hard the thing was hit rather than a
// curve drawn to look like one: hit it harder and the swoop starts higher and
// lasts longer, and a network that never runs down settles on a pitch of its
// own and holds it.
//
// The swing the tuning reads is the two states taken together, which for a
// quadrature pair is the envelope exactly. Rectifying one of them and chasing
// it with a follower is the obvious thing and it is wrong twice over: what
// comes back ripples at twice the pitch, so the tuning ends up frequency
// modulated by the voice's own second harmonic — enough of it that a kick
// carried more energy at 540 Hz than the cowbell did — and it lags on the way
// down, so a voice holds its trigger line locked out long after it has stopped.
export class BridgedT {
  private lp = 0
  private bp = 0
  private env = 0

  /**
   * `drive` is the trigger pulse, which arrives as charge onto the tank rather
   * than as a signal through it; `f` where the network rests, in radians a
   * sample; `rate` the fraction of itself the swing loses each sample, which at
   * zero is a tank that never stops and under zero one that grows into its own
   * clipping; `sweep` how far a full swing carries the tuning above where it
   * rests.
   *
   * A loss per sample rather than a damping fraction, because a damping
   * fraction is a number of cycles and a tank asked for a fixed number of
   * cycles rings for less time the higher it is tuned. Which is what a real
   * trimmer does to a real network — and it would quietly make the kit's pitch
   * knob a second decay knob, so the pitch is divided back out here and Decay
   * goes on meaning the time it has always meant.
   */
  process(drive: number, f: number, rate: number, sweep: number): number {
    const w = Math.min(f * (1 + sweep * this.env), 1)
    this.lp = flushDenormal(this.lp + w * this.bp)
    this.bp = rail(this.bp + drive - w * this.lp - 2 * rate * this.bp)
    this.env = Math.sqrt(this.bp * this.bp + this.lp * this.lp)
    return this.bp
  }

  /** How hard the tank is swinging, which for these voices is the envelope —
      there isn't a second one to read. The two states are a quadrature pair, so
      this is the envelope itself rather than a follower's guess at it: no lag
      to hold a voice open after it has stopped, and no ripple at twice the
      pitch. The follower inside is for the tuning, which wants the lag. */
  get level() {
    return Math.sqrt(this.bp * this.bp + this.lp * this.lp)
  }

  reset() {
    this.lp = 0
    this.bp = 0
    this.env = 0
  }
}
