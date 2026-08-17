import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { DelayLine } from '../util/delayline'
import { OnePoleLP, lpCoef } from '../util/onepole'
import { flushDenormal, softclip } from '../util/softclip'
import { gaussian, mulberry32, type Rng } from '../util/rng'

// Speed moves the whole machine at once: the head gap loses highs at a
// wavelength, so a slower tape loses them lower; the replay bump sits at a
// wavelength too, so it drops with speed; less tape past the head per second
// means more hiss and slower wow; and a spool wrap takes longer to come round.
const SPEED = [
  { gapHz: 6500, bumpHz: 26, hiss: 1.7, wowHz: 0.55, flutHz: 5, wobble: 1.7, printMs: 900 },
  { gapHz: 12000, bumpHz: 38, hiss: 1, wowHz: 0.8, flutHz: 6.8, wobble: 1, printMs: 450 },
  { gapHz: 19000, bumpHz: 55, hiss: 0.55, wowHz: 1.15, flutHz: 9.5, wobble: 0.6, printMs: 225 },
]

const NOMINAL_MS = 10
const LINE_MS = NOMINAL_MS + 900 + 20
const EMPH_HZ = 1200
const AZIMUTH_MAX = 40

interface Settings {
  drive: number
  makeup: number
  emph: number
  emphCoef: number
  tilt: number
  tiltCoef: number
  hiss: number
  hissCoef: number
  modNoise: number
  envCoef: number
  gapCoef: number
  bumpF: number
  bumpQ: number
  printGain: number
  printDelay: number
  printCoef: number
}

// One channel of tape: record head (pre-emphasis → saturation → de-emphasis),
// the oxide itself (hiss laid on the medium, so playback colours it), then the
// replay head (gap loss, head bump) and the layer bleeding through from the
// wrap underneath.
class TapeHead {
  private line: DelayLine
  private preLp = new OnePoleLP()
  private deLp = new OnePoleLP()
  private tiltLp = new OnePoleLP()
  private hissLp = new OnePoleLP()
  private gapLp = new OnePoleLP()
  private printLp = new OnePoleLP()
  private env = 0
  private bumpLow = 0
  private bumpBand = 0
  private gauss: Rng

  constructor(sr: number, seed: number) {
    this.line = new DelayLine((LINE_MS / 1000) * sr + 8)
    this.gauss = gaussian(mulberry32(seed))
  }

  process(x: number, delay: number, gapScale: number, s: Settings): number {
    const pre = this.preLp.process(x * s.drive, s.emphCoef)
    const rec = softclip(pre + (1 + s.emph) * (x * s.drive - pre))
    const de = this.deLp.process(rec, s.emphCoef)
    const played = (de + (rec - de) / (1 + s.emph)) * s.makeup
    const tl = this.tiltLp.process(played, s.tiltCoef)
    const printed = played + s.tilt * (played - tl)

    this.env = flushDenormal(this.env + s.envCoef * (Math.abs(printed) - this.env))
    const n = this.gauss()
    const nLp = this.hissLp.process(n, s.hissCoef)
    const hiss = (n + 0.8 * (n - 2 * nLp)) * s.hiss * (1 + s.modNoise * this.env)
    this.line.write(printed + hiss)

    let y = this.line.readHermite(delay)
    if (s.printGain > 0) {
      y += this.printLp.process(this.line.readHermite(delay + s.printDelay), s.printCoef) * s.printGain
    }
    y = this.gapLp.process(y, s.gapCoef * gapScale)

    this.bumpLow = flushDenormal(this.bumpLow + s.bumpF * this.bumpBand)
    const high = y - this.bumpLow - s.bumpQ * this.bumpBand
    this.bumpBand = flushDenormal(this.bumpBand + s.bumpF * high)
    return y + 0.5 * this.bumpBand * s.bumpQ
  }

  reset() {
    this.line.reset()
    this.preLp.reset()
    this.deLp.reset()
    this.tiltLp.reset()
    this.hissLp.reset()
    this.gapLp.reset()
    this.printLp.reset()
    this.env = 0
    this.bumpLow = 0
    this.bumpBand = 0
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
  private driftLp = new OnePoleLP()
  private scrapeLp = new OnePoleLP()
  private wow = 0
  private wow2 = 0
  private flut = 0
  private flut2 = 0
  private dropLeft = 0
  private dropDepth = 0
  private dropEnv = 0
  private nominal: number
  private rng: Rng
  private gauss: Rng

  constructor(private readonly sr: number) {
    this.headL = new TapeHead(sr, 909)
    this.headR = new TapeHead(sr, 4242)
    this.nominal = Math.round((NOMINAL_MS / 1000) * sr)
    this.dryL = new DelayLine(this.nominal + 4)
    this.dryR = new DelayLine(this.nominal + 4)
    this.rng = mulberry32(1717)
    this.gauss = gaussian(mulberry32(2323))
  }

  when(p: Float32Array) {
    return p[IDX.tapeMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, _ctx: Ctx) {
    const mix = p[IDX.tapeMix]!
    const sp = SPEED[Math.min(Math.max(Math.round(p[IDX.tapeSpeed]!), 0), SPEED.length - 1)]!
    const bias = p[IDX.tapeBias]!
    // Under-bias records hotter highs and distorts sooner; over-bias is duller
    // and squashes. One knob, the two moving against each other.
    const drive = Math.pow(10, p[IDX.tapeDrive]! / 20) * (1 - 0.45 * bias)
    const gapHz = Math.min(sp.gapHz * Math.pow(2, -bias * 0.5), this.sr * 0.45)
    const bumpF = 2 * Math.sin((Math.PI * sp.bumpHz) / this.sr)
    const s: Settings = {
      drive,
      makeup: Math.pow(drive, -0.8),
      emph: 1.2,
      emphCoef: lpCoef(EMPH_HZ, this.sr),
      tilt: -bias * 0.6,
      tiltCoef: lpCoef(3000, this.sr),
      hiss: p[IDX.tapeHiss]! * sp.hiss * 0.006,
      hissCoef: lpCoef(1500, this.sr),
      modNoise: 1.8,
      envCoef: lpCoef(12, this.sr),
      gapCoef: lpCoef(gapHz, this.sr),
      bumpF,
      bumpQ: 1 / 1.2,
      printGain: p[IDX.tapePrint]! * 0.05,
      printDelay: (sp.printMs / 1000) * this.sr,
      printCoef: lpCoef(2500, this.sr),
    }

    const azimuth = p[IDX.tapeAzimuth]! * AZIMUTH_MAX
    const wowAmt = p[IDX.tapeWow]! * sp.wobble
    const flutAmt = p[IDX.tapeFlutter]! * sp.wobble
    const dropAmt = p[IDX.tapeDrop]!
    const dropProb = (dropAmt * 3) / this.sr
    const dropCoef = lpCoef(120, this.sr)
    const driftCoef = lpCoef(0.12, this.sr)
    const scrapeCoef = lpCoef(120, this.sr)
    const msToSamples = this.sr / 1000

    for (let i = 0; i < io.n; i++) {
      this.wow = (this.wow + sp.wowHz / this.sr) % 1
      this.wow2 = (this.wow2 + (sp.wowHz * 0.37) / this.sr) % 1
      this.flut = (this.flut + sp.flutHz / this.sr) % 1
      this.flut2 = (this.flut2 + (sp.flutHz * 1.54) / this.sr) % 1
      const drift = this.driftLp.process(this.gauss(), driftCoef) * 260
      const scrape = this.scrapeLp.process(this.gauss(), scrapeCoef)
      const wobbleMs =
        wowAmt *
          1.6 *
          (0.75 * Math.sin(this.wow * 2 * Math.PI) + 0.25 * Math.sin(this.wow2 * 2 * Math.PI)) +
        flutAmt *
          0.16 *
          (0.6 * Math.sin(this.flut * 2 * Math.PI) + 0.4 * Math.sin(this.flut2 * 2 * Math.PI)) +
        Math.max(-1, Math.min(1, drift)) * 0.9 * wowAmt +
        scrape * 0.02 * flutAmt
      const d = Math.max(this.nominal + wobbleMs * msToSamples, 4)

      if (dropAmt > 0 && this.dropLeft <= 0 && this.rng() < dropProb) {
        this.dropLeft = Math.floor((0.004 + this.rng() * 0.05) * this.sr)
        this.dropDepth = 0.3 + 0.7 * this.rng()
      }
      if (this.dropLeft > 0) this.dropLeft--
      this.dropEnv = flushDenormal(
        this.dropEnv + dropCoef * ((this.dropLeft > 0 ? this.dropDepth : 0) - this.dropEnv),
      )
      // Oxide sheds highs before it sheds level — the tell that separates a
      // dropout from a power cut.
      const gapScale = 1 - 0.75 * this.dropEnv
      const dropGain = 1 - 0.9 * this.dropEnv

      const inL = io.l[i]!
      const inR = io.r[i]!
      this.dryL.write(inL)
      this.dryR.write(inR)
      const wetL = this.headL.process(inL, d, gapScale, s) * dropGain
      const wetR = this.headR.process(inR, d + azimuth, gapScale * (1 - 0.35 * azimuth / AZIMUTH_MAX), s) * dropGain

      // The dry side runs down the same nominal delay, so the blend only combs
      // when the transport actually wobbles.
      io.l[i] = this.dryL.read(this.nominal) * (1 - mix) + wetL * mix
      io.r[i] = this.dryR.read(this.nominal) * (1 - mix) + wetR * mix
    }
  }

  panic() {
    this.headL.reset()
    this.headR.reset()
    this.dryL.reset()
    this.dryR.reset()
    this.driftLp.reset()
    this.scrapeLp.reset()
    this.wow = 0
    this.wow2 = 0
    this.flut = 0
    this.flut2 = 0
    this.dropLeft = 0
    this.dropDepth = 0
    this.dropEnv = 0
  }
}
