import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { SineOsc } from '../util/lfo'
import { lpCoef } from '../util/onepole'
import { flushDenormal, softclip } from '../util/softclip'
import { gaussian, mulberry32, type Rng } from '../util/rng'

// Speed moves the whole machine at once: the head gap loses highs at a
// wavelength, so a slower tape loses them lower; the replay bump sits at a
// wavelength too, so it drops with speed; less tape past the head per second
// means more hiss and slower wow; and a spool wrap takes longer to come round.
const SPEED = [
  {
    gapHz: 5000,
    bumpHz: 26,
    hiss: 1.7,
    wowHz: 0.55,
    flutHz: 5,
    wobble: 1.7,
    printMs: 900,
    squealHz: 1500,
  },
  {
    gapHz: 10000,
    bumpHz: 38,
    hiss: 1,
    wowHz: 0.8,
    flutHz: 6.8,
    wobble: 1,
    printMs: 450,
    squealHz: 2400,
  },
  {
    gapHz: 19000,
    bumpHz: 55,
    hiss: 0.55,
    wowHz: 1.15,
    flutHz: 9.5,
    wobble: 0.6,
    printMs: 225,
    squealHz: 3400,
  },
]

const NOMINAL_MS = 10
/** how far off centre a fully wound Hysteresis can sit the record curve, as a
    share of the level the medium is carrying. Past about this the second
    harmonic stops being a bloom and starts being the note. */
const HYST_MAX = 1.5
const LINE_MS = NOMINAL_MS + 900 + 20
const EMPH_HZ = 1200
const AZIMUTH_MAX = 48
/** how far above the -3 dB knee a pair of poles has to sit to still cross it
    there, `1/sqrt(sqrt(2)-1)`. */
const GAP_POLE = 1.5538
/** where the contour effect's next ripple sits above the head bump, and how
    much of it comes back — inverted, so the bottom octave is a lift and a
    scoop rather than a lump. */
const RIPPLE_RATIO = 2.2
const RIPPLE_DEPTH = 0.4
/** how much of the record level the makeup gives back. All of it and the knob
    would be a tone control; none and it would be a fader. This much leaves the
    machine at unity where the record level is, and lets what the oxide took off
    either end of the travel be the thing you hear. */
const MAKEUP_POW = 0.74
/** How sharply friction falls off as the span starts moving, how far the cycle
    runs before it climbs back out, and the draught of noise that starts it.
    `mu` is the character: small sings, large rasps. */
const SQ_MU = 0.14
const SQ_SAT = 0.25
const SQ_SEED = 3e-4
/** What tension does to it: a few percent on the note, and the whole of whether
    it takes off at all. The knob sets the bite the tape has on the head with
    nothing else happening, tension swings it either side, and the size of the
    cycle goes as the root of what is left — so the knob reads as how often the
    machine screams as much as how loudly, and a tape that is only going off
    squeals in waves the drift's own minutes long. */
const SQ_WANDER = 0.09
const SQ_TENSION = 0.8
const SQ_SLIP = -0.6
const SQ_GRIP = 0.9
/** The two ways out: the tape's own speed wobbling at the squeal rate, in ms,
    and the machine screaming into the room. */
const SQ_FM_MS = 0.08
const SQ_BLEED = 0.06

interface Settings {
  drive: number
  makeup: number
  emph: number
  emphCoef: number
  deCoef: number
  remanence: number
  bump: number
  tilt: number
  tiltCoef: number
  hiss: number
  hissCoef: number
  modNoise: number
  envCoef: number
  magAtk: number
  magRel: number
  gapCoef: number
  dropAmt: number
  dropProb: number
  dropCoef: number
  dropSr: number
  bumpF: number
  bumpQ: number
  ripple: number
  ripF: number
  printGain: number
  printDelay: number
  printCoef: number
}

// One channel of tape: record head (pre-emphasis → saturation against a
// magnetised oxide → de-emphasis), the medium itself (hiss laid on it, so
// playback colours it), then the replay head (gap loss, head bump) and the layer
// bleeding through from the wrap underneath.
//
// Its six one-poles are six doubles on this object rather than six objects
// holding one double each. A head runs all of them every sample, so the old
// shape was six pointers off to six places on the heap for six multiply-adds,
// and two heads make that twelve — the same thing the spring tank was paying.
class TapeHead {
  private line: DelayLine
  private pre = 0
  private de = 0
  private tiltY = 0
  private hissY = 0
  private gap = 0
  private gap2 = 0
  private print = 0
  private env = 0
  private magEnv = 0
  private bumpLow = 0
  private bumpBand = 0
  private ripLow = 0
  private ripBand = 0
  private dropLeft = 0
  private dropDepth = 0
  private dropEnv = 0
  private gauss: Rng
  private rng: Rng

  constructor(sr: number, seed: number) {
    this.line = new DelayLine((LINE_MS / 1000) * sr + 8)
    const draw = mulberry32(seed)
    this.gauss = gaussian(mulberry32((draw() * 0x1_0000_0000) >>> 0))
    this.rng = mulberry32((draw() * 0x1_0000_0000) >>> 0)
  }

  // azGap is what the azimuth error alone costs this head's top end; the
  // dropouts are the head's own, because oxide sheds in patches and a patch
  // sits on one track. Shared, every dropout was a mono event landing on both
  // channels at once, which is the one thing a hole in the oxide never is.
  process(x: number, delay: number, azGap: number, s: Settings): number {
    const xd = x * s.drive
    this.pre = flushDenormal(this.pre + s.emphCoef * (xd - this.pre))
    const pre = this.pre
    // The field the gap presents to the oxide, and the curve it meets there.
    //
    // A clipper on its own is odd: both halves of a wave meet the same shape, so
    // it makes a third harmonic and a fifth and never a second — which is the
    // sound of something breaking up rather than of something warm. Tape is not
    // odd. The medium arrives at the gap already magnetised, by more of it the
    // harder it has been driven, and that remanence sits the curve off centre:
    // the two halves of the wave saturate against different amounts of it and
    // come out different shapes. That difference is the second harmonic, and
    // because the offset rides the programme envelope rather than the note, it
    // blooms up with the level and goes away again when you back off.
    //
    // What the offset does to the operating point is the sound; the dc it also
    // leaves is not, and would come off headroom the rest of the take needs. So
    // the curve is read at the offset and taken back off there, which is a
    // second call into the clipper and the only per-sample cost this knob has.
    //
    // How much the medium is carrying is measured off the clipper's own output
    // rather than off what comes back from the replay head: the record level
    // makes up its gain on the way out, so a head being driven twice as hard
    // plays back at the same level, and reading the offset from there would have
    // meant a tape that blooms *less* the harder you hit it. What the domains
    // have been through is `rec`, which is a difference of two clipped values
    // and so bounded by ±2 rather than ±1 — the loop closes on itself all the
    // same, because the further off centre the offset sits the curve, the
    // smaller the difference either half of the wave comes back as.
    const field = pre + (1 + s.emph) * (xd - pre)
    const offset = s.remanence * this.magEnv
    const rec =
      offset === 0
        ? softclip(field)
        : softclip(field + offset) - softclip(offset)
    // Domains flip as fast as the field asks them to and then stay flipped —
    // that is what remanence is — so this rises in a couple of milliseconds and
    // lets go over a twentieth of a second. Tracked at one speed both ways it
    // sat near the average of a rectified wave, which is a bloom that follows
    // the note; riding the peak and hanging after it is a bloom that follows the
    // playing, and it stays lit through the gap between two hits instead of
    // pumping in and out of every one.
    const mag = Math.abs(rec)
    this.magEnv = flushDenormal(
      this.magEnv +
        (mag > this.magEnv ? s.magAtk : s.magRel) * (mag - this.magEnv),
    )
    this.de = flushDenormal(this.de + s.deCoef * (rec - this.de))
    const de = this.de
    const played = (de + (rec - de) / (1 + s.emph)) * s.makeup
    // The record tilt and the hiss are both a knob at rest for most boards, and
    // a head runs whatever is here forty-eight thousand times a second in each
    // channel. Both branches go the same way for the whole of a take, which is
    // the one shape a predictor gets right every time.
    let printed = played
    if (s.tilt !== 0) {
      this.tiltY = flushDenormal(
        this.tiltY + s.tiltCoef * (played - this.tiltY),
      )
      printed = played + s.tilt * (played - this.tiltY)
    }

    let hiss = 0
    if (s.hiss > 0) {
      this.env = flushDenormal(
        this.env + s.envCoef * (Math.abs(printed) - this.env),
      )
      const n = this.gauss()
      this.hissY = flushDenormal(this.hissY + s.hissCoef * (n - this.hissY))
      hiss =
        (n + 0.8 * (n - 2 * this.hissY)) * s.hiss * (1 + s.modNoise * this.env)
    }
    this.line.write(printed + hiss)

    let y = this.line.readHermite(delay)
    if (s.printGain > 0) {
      const through = this.line.readHermite(delay + s.printDelay)
      this.print = flushDenormal(
        this.print + s.printCoef * (through - this.print),
      )
      y += this.print * s.printGain
    }
    if (s.dropAmt > 0 && this.dropLeft <= 0 && this.rng() < s.dropProb) {
      this.dropLeft = Math.floor((0.004 + this.rng() * 0.05) * s.dropSr)
      this.dropDepth = 0.3 + 0.7 * this.rng()
    }
    if (this.dropLeft > 0) this.dropLeft--
    this.dropEnv = flushDenormal(
      this.dropEnv +
        s.dropCoef * ((this.dropLeft > 0 ? this.dropDepth : 0) - this.dropEnv),
    )
    // Oxide sheds highs before it sheds level — the tell that separates a
    // dropout from a power cut.
    const gc = s.gapCoef * azGap * (1 - 0.75 * this.dropEnv)
    this.gap = flushDenormal(this.gap + gc * (y - this.gap))
    this.gap2 = flushDenormal(this.gap2 + gc * (this.gap - this.gap2))
    y = this.gap2
    const dropGain = 1 - 0.9 * this.dropEnv

    if (s.bump === 0) return y * dropGain
    this.bumpLow = flushDenormal(this.bumpLow + s.bumpF * this.bumpBand)
    const high = y - this.bumpLow - s.bumpQ * this.bumpBand
    this.bumpBand = flushDenormal(this.bumpBand + s.bumpF * high)
    // The contour effect does not stop at the bump. Flux comes back round the
    // head core a second time and the response ripples on up the band, the next
    // one inverted and smaller — so the lift at the bottom is paid for by a
    // scoop in the low mids, which is the shape of a real machine's bottom
    // octave rather than one clean peak sitting on a flat line.
    this.ripLow = flushDenormal(this.ripLow + s.ripF * this.ripBand)
    const ripHigh = y - this.ripLow - s.bumpQ * this.ripBand
    this.ripBand = flushDenormal(this.ripBand + s.ripF * ripHigh)
    return (
      (y + s.bumpQ * (s.bump * this.bumpBand - s.ripple * this.ripBand)) *
      dropGain
    )
  }

  reset() {
    this.line.reset()
    this.pre = 0
    this.de = 0
    this.tiltY = 0
    this.hissY = 0
    this.gap = 0
    this.gap2 = 0
    this.print = 0
    this.env = 0
    this.magEnv = 0
    this.bumpLow = 0
    this.bumpBand = 0
    this.ripLow = 0
    this.ripBand = 0
    this.dropLeft = 0
    this.dropDepth = 0
    this.dropEnv = 0
  }
}

// The whole instrument printed to tape. Everything upstream is the room; this
// is the machine it was recorded on.
export class Tape implements Stage {
  label = 'tape'
  private headL: TapeHead
  private headR: TapeHead
  private dryL: DelayLine
  private dryR: DelayLine
  private driftY = 0
  private scrapeY = 0
  private wow = new SineOsc()
  private wow2 = new SineOsc()
  private flut = new SineOsc()
  private flut2 = new SineOsc()
  private sqLow = 0
  private sqBand = 0
  private nominal: number
  private gauss: Rng
  private readonly s: Settings = {
    drive: 1,
    makeup: 1,
    emph: 1.2,
    emphCoef: 0,
    deCoef: 0,
    remanence: 0,
    bump: 0.5,
    tilt: 0,
    tiltCoef: 0,
    hiss: 0,
    hissCoef: 0,
    modNoise: 1.8,
    envCoef: 0,
    magAtk: 0,
    magRel: 0,
    gapCoef: 0,
    dropAmt: 0,
    dropProb: 0,
    dropCoef: 0,
    dropSr: 0,
    bumpF: 0,
    bumpQ: 1 / 1.2,
    ripple: 0,
    ripF: 0,
    printGain: 0,
    printDelay: 0,
    printCoef: 0,
  }

  // Every stream off one seed, the way every other seeded part of the board
  // draws its own — the tape had four numbers written into it instead, so two
  // takes of one board came back with the same hiss on them, the same dropouts
  // in the same places and the machine going off at the same moment. The heads
  // take a seed each and split it again, since a head owns both its hiss and
  // its own shed oxide.
  constructor(
    private readonly sr: number,
    seed = 1,
  ) {
    const draw = mulberry32(seed)
    const next = () => (draw() * 0x1_0000_0000) >>> 0
    this.headL = new TapeHead(sr, next())
    this.headR = new TapeHead(sr, next())
    this.nominal = Math.round((NOMINAL_MS / 1000) * sr)
    this.dryL = new DelayLine(this.nominal + 4)
    this.dryR = new DelayLine(this.nominal + 4)
    this.gauss = gaussian(mulberry32(next()))
  }

  when(p: Float32Array) {
    return p[IDX.tapeMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const mix = p[IDX.tapeMix]!
    const sp =
      SPEED[
        Math.min(Math.max(Math.round(p[IDX.tapeSpeed]!), 0), SPEED.length - 1)
      ]!
    const bias = p[IDX.tapeBias]!
    // Under-bias records hotter highs and distorts sooner; over-bias is duller
    // and squashes. One knob, the two moving against each other.
    const drive = Math.pow(10, p[IDX.tapeDrive]! / 20) * (1 - 0.45 * bias)
    // Gap loss is flat and then a cliff — a wavelength either fits across the
    // gap or it cancels in it — so the knee is where the two poles cross -3 dB
    // and the fall past it is 12 dB an octave. One pole was 6, which is a tone
    // control: it took the top off the midrange an octave early and still let
    // 20 kHz through at 3¾ ips, where a real machine has nothing up there at
    // all. Two is what makes the speed switch a different machine.
    const gapHz = Math.min(
      sp.gapHz * Math.pow(2, -bias * 0.5) * GAP_POLE,
      this.sr * 0.47,
    )
    const s = this.s
    s.drive = drive
    s.makeup = Math.pow(drive, -MAKEUP_POW)
    // Record and replay have to be each other's inverse, or the machine at rest
    // colours a signal it never touched. A shelf that lifts the top by `g` from
    // a corner inverts to a shelf that cuts it by `g` from a corner `g` times
    // lower — run both from the same corner, as this did, and what is left over
    // is a 2 dB lump sitting on 1.2 kHz, which is the one part of the band that
    // could least afford one. Written out as poles rather than as corners, the
    // two cancel to the bit.
    const g = 1 + s.emph
    const a = 1 - lpCoef(EMPH_HZ, this.sr)
    s.emphCoef = 1 - a
    s.deCoef = 1 - (g * a) / (g + (1 - a) * (1 - g))
    // How far off centre the remanence sits the curve, per unit of level the
    // medium is carrying. Under-bias leaves more of the field behind, which is
    // the other half of why an underbiased tape is the one that crunches.
    s.remanence = p[IDX.tapeHyst]! * HYST_MAX * (1 - 0.35 * bias)
    s.bump = p[IDX.tapeBump]!
    s.tilt = -bias * 0.6
    s.tiltCoef = lpCoef(3000, this.sr)
    s.hiss = p[IDX.tapeHiss]! * sp.hiss * 0.006
    s.hissCoef = lpCoef(1500, this.sr)
    s.envCoef = lpCoef(12, this.sr)
    s.magAtk = lpCoef(60, this.sr)
    s.magRel = lpCoef(2.5, this.sr)
    s.gapCoef = lpCoef(gapHz, this.sr)
    s.dropAmt = p[IDX.tapeDrop]!
    s.dropProb = (s.dropAmt * 3) / this.sr
    s.dropCoef = lpCoef(120, this.sr)
    s.dropSr = this.sr
    s.bumpF = 2 * Math.sin((Math.PI * sp.bumpHz) / this.sr)
    s.ripple = s.bump * RIPPLE_DEPTH
    s.ripF = 2 * Math.sin((Math.PI * sp.bumpHz * RIPPLE_RATIO) / this.sr)
    s.printGain = p[IDX.tapePrint]! * 0.05
    s.printDelay = (sp.printMs / 1000) * this.sr
    s.printCoef = lpCoef(2500, this.sr)

    const azimuth = p[IDX.tapeAzimuth]! * AZIMUTH_MAX
    const azGap = 1 - (0.45 * azimuth) / AZIMUTH_MAX
    const wowAmt = p[IDX.tapeWow]! * sp.wobble
    const flutAmt = p[IDX.tapeFlutter]! * sp.wobble
    const driftCoef = lpCoef(0.12, this.sr)
    const scrapeCoef = lpCoef(120, this.sr)
    const msToSamples = this.sr / 1000
    const wowK = SineOsc.rate(sp.wowHz, this.sr)
    const wow2K = SineOsc.rate(sp.wowHz * 0.37, this.sr)
    const flutK = SineOsc.rate(sp.flutHz, this.sr)
    const flut2K = SineOsc.rate(sp.flutHz * 1.54, this.sr)
    const sqAmt = p[IDX.tapeSqueal]!
    // The coefficient is scaled per sample rather than resolved, since a
    // resonance that has to call a sine to wander is one the transport can't
    // afford to have wandering.
    const sqF =
      2 * Math.sin((Math.PI * Math.min(sp.squealHz, this.sr * 0.15)) / this.sr)
    const sqGrip = SQ_SLIP + sqAmt * (SQ_GRIP - SQ_SLIP)
    const sqFm = SQ_FM_MS * msToSamples

    for (let i = 0; i < io.n; i++) {
      this.driftY = flushDenormal(
        this.driftY + driftCoef * (this.gauss() - this.driftY),
      )
      const drift = this.driftY * 260
      this.scrapeY = flushDenormal(
        this.scrapeY + scrapeCoef * (this.gauss() - this.scrapeY),
      )
      const scrape = this.scrapeY
      const tension = Math.min(Math.max(drift, -1), 1)

      // Sticky shed. The binder has gone off, so the tape grabs the head,
      // stretches, lets go and grabs again — and friction falls as it starts to
      // move, which is a damping term that is negative while the span is nearly
      // still and positive once it is running. A resonator wired that way needs
      // no exciting: it takes off on its own and settles into a limit cycle,
      // which is what a squeal is. Nothing here plays a screech; the screech is
      // what a friction curve with the wrong slope on it does.
      let squeal = 0
      if (sqAmt > 0) {
        const f = sqF * (1 + SQ_WANDER * tension)
        const bite = sqGrip + SQ_TENSION * tension
        const damp = SQ_MU * (this.sqBand * this.sqBand * SQ_SAT - bite)
        this.sqLow = flushDenormal(this.sqLow + f * this.sqBand)
        const high = this.gauss() * SQ_SEED - this.sqLow - damp * this.sqBand
        this.sqBand = flushDenormal(this.sqBand + f * high)
        squeal = this.sqBand
      }

      const wobbleMs =
        wowAmt *
          1.6 *
          (0.75 * this.wow.step(wowK) + 0.25 * this.wow2.step(wow2K)) +
        flutAmt *
          0.16 *
          (0.6 * this.flut.step(flutK) + 0.4 * this.flut2.step(flut2K)) +
        tension * 0.9 * wowAmt +
        scrape * 0.02 * flutAmt
      // The squeal is the tape's speed past the head, so it lands on the head
      // delay with the rest of the transport — everything already recorded
      // wobbles at the squeal's rate, which is why a machine doing this sounds
      // wrong on material that has none of it in it.
      const d = Math.max(
        this.nominal + wobbleMs * msToSamples + squeal * sqFm,
        4,
      )

      const inL = io.l[i]!
      const inR = io.r[i]!
      this.dryL.write(inL)
      this.dryR.write(inR)
      const wetL = this.headL.process(inL, d, 1, s)
      const wetR = this.headR.process(inR, d + azimuth, azGap, s)

      // The dry side runs down the same nominal delay, so the blend only combs
      // when the transport actually wobbles.
      // The dry tap is a whole number of samples and never moves, so it splits
      // to itself and a zero fraction: nothing here to clamp or floor.
      // And the other way out is the room: a machine doing this is audible
      // across a studio, so it arrives past the heads rather than through them.
      const scream = squeal * SQ_BLEED
      io.l[i] =
        this.dryL.readAt(this.nominal, 0) * (1 - mix) + (wetL + scream) * mix
      io.r[i] =
        this.dryR.readAt(this.nominal, 0) * (1 - mix) + (wetR + scream) * mix
    }
  }

  panic() {
    this.headL.reset()
    this.headR.reset()
    this.dryL.reset()
    this.dryR.reset()
    this.driftY = 0
    this.scrapeY = 0
    this.wow.reset()
    this.wow2.reset()
    this.flut.reset()
    this.flut2.reset()
    this.sqLow = 0
    this.sqBand = 0
  }
}
