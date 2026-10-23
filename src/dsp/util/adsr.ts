// Near enough to the target that a decay or release counts as there: e^-4.6 is
// one percent, so a stage's time is how long it takes to go 99% of the way.
const SETTLE = 4.6

export interface AdsrRates {
  rise: number
  decay: number
  sustain: number
  release: number
}

/** Per-sample rates for attack, decay and release times in seconds, worked out
    once a block rather than once a sample. */
export function adsrRates(
  sr: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): AdsrRates {
  const fall = (s: number) => Math.exp(-SETTLE / Math.max(s * sr, 1))
  return {
    rise: 1 / Math.max(attack * sr, 1),
    decay: fall(decay),
    sustain: Math.min(Math.max(sustain, 0), 1),
    release: fall(release),
  }
}

/** An attack, decay, sustain, release envelope, 0 to 1. The attack climbs in a
    straight line from wherever the level stands, so a retrigger never clicks
    back to zero; decay and release fall exponentially, as a capacitor through
    a resistor does. */
export class Adsr {
  level = 0
  private stage: 'idle' | 'attack' | 'decay' | 'release' = 'idle'

  trigger() {
    this.stage = 'attack'
  }

  release() {
    if (this.stage !== 'idle') this.stage = 'release'
  }

  step(r: AdsrRates) {
    switch (this.stage) {
      case 'attack':
        this.level += r.rise
        if (this.level >= 1) {
          this.level = 1
          this.stage = 'decay'
        }
        break
      case 'decay':
        this.level = r.sustain + (this.level - r.sustain) * r.decay
        break
      case 'release':
        this.level *= r.release
        if (this.level < 1e-5) {
          this.level = 0
          this.stage = 'idle'
        }
        break
      default:
    }
    return this.level
  }

  reset() {
    this.level = 0
    this.stage = 'idle'
  }
}
