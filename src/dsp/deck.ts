import { IDX, MAX_SOURCES } from '../engine/params.ts'
import { DEST } from './modbus.ts'
import { BLOCK, type StereoBlock } from './stage.ts'
import { hermite } from './util/delayline.ts'
import { Lowpass, lpCoef } from './util/onepole.ts'
import { octaves } from './util/pitch.ts'

import type { Chain } from './chain.ts'

// The deck the whole instrument is printed to.
//
// Slowing an instrument down is not slowing its oscillators down: a board run
// at half speed by its own controls is a board with every envelope, every delay
// time and every reverb tail still the length it was, which is a detuned board
// rather than a slow one. The way to get the other thing is the way a tape gets
// it — print the machine and play the printing back off a capstan that is not
// turning at the speed it was recorded at. So the chain sits inside this rather
// than beside it: the chain renders blocks into a ring at its own rate, knowing
// nothing, and the deck reads the ring at whatever rate the trimmer is set to.
//
// The ring is a power of two so the read wraps on a mask, and both heads are
// rebased by whole laps of it every callback — a position counted up from boot
// would leave the range a bitwise mask is exact over after a few hours.

const RING = 1024
const MASK = RING - 1

// Slower than this and the deck is stopping rather than playing. A head reads
// flux change, so what leaves falls away with the speed; at rest a tape is
// silent however much is printed on it.
const CREEP = 0.05

// Room for the lag the mic servo aims at, plus the stretch of mic one chain
// block reads in a single pass at the slowest speed the deck still reads at.
const MIC_RING = 8192
const MIC_MASK = MIC_RING - 1
const MIC_SPAN = MIC_RING - BLOCK / CREEP

// Where a wire onto the lane can drag the capstan to. The knob stops at ×2; a
// lane pushing two octaves on top of that would ask for a callback's worth of
// chain the ring cannot hold.
const MAX_SPEED = 4

// Four-point cubic Hermite, for every speed but ×1, which reads the ring
// straight so that it is the chain's own output, sample for sample.
function readRing(ring: Float32Array, base: number, pos: number) {
  const idx = Math.floor(pos)
  return hermite(
    ring[base + ((idx - 1) & MASK)]!,
    ring[base + (idx & MASK)]!,
    ring[base + ((idx + 1) & MASK)]!,
    ring[base + ((idx + 2) & MASK)]!,
    pos - idx,
  )
}

export class Deck {
  private readonly ringL = new Float32Array(RING)
  private readonly ringR = new Float32Array(RING)
  // The source tapes on the same terms as the mix, so a stem take at half
  // speed is what you heard rather than the raw machine at its own pitch.
  // Written only while the stem tape is running, like the chain's own copy.
  private readonly ringStems = new Float32Array(MAX_SOURCES * RING)
  // Four poles rather than one: the lid has to come down inside the half-octave
  // between the corner and the fold, and six decibels an octave over that
  // distance is a lean rather than a lid.
  private readonly aaL = new Lowpass(4)
  private readonly aaR = new Lowpass(4)
  private readonly chainIo: StereoBlock = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  private readonly micRing = new Float32Array(MIC_RING)
  private readonly micBlock = new Float32Array(BLOCK)
  private micWrite = 0
  private micRead = 0
  private micLive = false
  private micPrimed = false
  private write = 0
  private readPos = 0
  private speed = 1
  private started = false
  private laneMean = 0

  /** This callback's stems, resampled alongside the mix, in chain layout. */
  readonly stems = new Float32Array(MAX_SOURCES * BLOCK)

  private readonly chain: Chain
  private readonly sr: number

  constructor(chain: Chain, sr: number) {
    this.chain = chain
    this.sr = sr
  }

  /** The real input, at the rate it actually arrived. What the chain gets is
      read back out of here at the deck's own speed. */
  pushMic(mic: Float32Array | null, n: number) {
    this.micLive = mic !== null
    const base = this.micWrite & MIC_MASK
    if (mic) {
      for (let i = 0; i < n; i++) this.micRing[(base + i) & MIC_MASK] = mic[i]!
    } else {
      for (let i = 0; i < n; i++) this.micRing[(base + i) & MIC_MASK] = 0
    }
    this.micWrite += n
  }

  process(io: StereoBlock, p: Float32Array) {
    const n = io.n
    // A wire on the lane multiplies, the way a wire on the sampler's capstan
    // does, so the same patch means the same thing on either speed. It is last
    // callback's lane: the deck is outside the chain, so the bus it reads is
    // only built once the chain has run.
    const target = Math.min(
      Math.max(p[IDX.deckSpeed]! * octaves(this.laneMean * 2), 0),
      MAX_SPEED,
    )
    const speed = this.follow(target, p[IDX.deckInertia]!, n)
    // Back at ×1 the head finishes this callback on a whole sample, a step a
    // fraction of a percent off ×1 rather than a jump, and from there on plays
    // the chain's own samples straight through.
    const straight = speed === 1 && Number.isInteger(this.readPos)
    const end =
      speed === 1 ? Math.round(this.readPos) + n : this.readPos + n * speed
    const step = (end - this.readPos) / n

    if (speed > 0) {
      // A straight read wants the samples it plays and nothing past them, so
      // the chain runs no further ahead than the ear. Otherwise it is what the
      // interpolator reaches for by the end of the callback, plus the two
      // samples past it the four-point kernel wants.
      const need = straight
        ? this.readPos + n
        : Math.floor(this.readPos + (n - 1) * step) + 3
      // A cheap deck's lid on the way in. Crossfaded rather than switched, and
      // at ×1 the wet share is zero, so the ring holds the chain's own samples
      // and nothing about the path changes as the knob passes the detent.
      const wet = Math.min(Math.max(speed - 1, 0), 1)
      const aa = lpCoef((0.4 * this.sr) / Math.max(speed, 1), this.sr)
      let ran = false
      while (this.write < need) {
        this.runBlock(p, speed, wet, aa)
        ran = true
      }
      if (ran) this.laneMean = this.laneAt(DEST.deckSpeed)
    }

    const gain = speed < CREEP ? speed / CREEP : 1
    if (straight) {
      const at = this.readPos
      for (let i = 0; i < n; i++) {
        io.l[i] = this.ringL[(at + i) & MASK]!
        io.r[i] = this.ringR[(at + i) & MASK]!
      }
      if (this.chain.capturing) {
        for (let k = 0; k < MAX_SOURCES; k++) {
          const from = k * RING
          const to = k * BLOCK
          for (let i = 0; i < n; i++)
            this.stems[to + i] = this.ringStems[from + ((at + i) & MASK)]!
        }
      }
    } else {
      let pos = this.readPos
      for (let i = 0; i < n; i++) {
        io.l[i] = gain * readRing(this.ringL, 0, pos)
        io.r[i] = gain * readRing(this.ringR, 0, pos)
        pos += step
      }
      if (this.chain.capturing) {
        for (let k = 0; k < MAX_SOURCES; k++) {
          const from = k * RING
          const to = k * BLOCK
          let at = this.readPos
          for (let i = 0; i < n; i++) {
            this.stems[to + i] = gain * readRing(this.ringStems, from, at)
            at += step
          }
        }
      }
    }
    this.readPos = end
    this.rebase()
  }

  /** A fresh stem tape. The chain splits its sources only while capturing, so
      what the head reads from before the take began is last take's stems. */
  armStems() {
    this.ringStems.fill(0)
    this.stems.fill(0)
  }

  panic() {
    this.ringL.fill(0)
    this.ringR.fill(0)
    this.ringStems.fill(0)
    this.stems.fill(0)
    this.micRing.fill(0)
    this.aaL.reset()
    this.aaR.reset()
  }

  // The platter, which is heavier than the trimmer. Snapped on the first
  // callback, so a board that boots at ×1 boots exactly there and stays there;
  // after that the speed eases toward the knob over the weight set on it, and
  // lands on it outright rather than approaching it forever — a stop has to be
  // a stop, and an envelope halving its way to nothing arrives at a denormal.
  private follow(target: number, tau: number, n: number): number {
    if (!this.started) {
      this.started = true
      this.speed = target
    } else if (tau <= 0) {
      this.speed = target
    } else {
      const next =
        this.speed +
        (1 - Math.exp(-n / (tau * this.sr))) * (target - this.speed)
      this.speed = Math.abs(next - target) < 1e-6 ? target : next
    }
    return this.speed
  }

  private runBlock(p: Float32Array, speed: number, wet: number, aa: number) {
    this.fillMic(speed)
    this.chain.process(
      this.chainIo,
      p,
      this.micLive ? this.micBlock : undefined,
    )
    // The ring is a whole number of blocks long and the write head only ever
    // moves by one, so a block never straddles the seam.
    const base = this.write & MASK
    const l = this.chainIo.l
    const r = this.chainIo.r
    for (let i = 0; i < BLOCK; i++) {
      const dry = l[i]!
      const dryR = r[i]!
      this.ringL[base + i] = dry + wet * (this.aaL.process(dry, aa) - dry)
      this.ringR[base + i] = dryR + wet * (this.aaR.process(dryR, aa) - dryR)
    }
    if (this.chain.capturing) {
      const stems = this.chain.stems
      for (let k = 0; k < MAX_SOURCES; k++) {
        const from = k * BLOCK
        const to = k * RING + base
        for (let i = 0; i < BLOCK; i++)
          this.ringStems[to + i] = stems[from + i]!
      }
    }
    this.write += BLOCK
  }

  // A chain block spans 128/speed real samples, so the mic head walks its ring
  // at 1/speed. It cannot sit on the write head — one pass at half speed reads
  // 256 samples ahead and only 128 have arrived — so it rides a lag behind it,
  // and the servo trims the step by a few percent toward that lag rather than
  // jumping the head. A hand on the trimmer pitches the mic a hair; a jump
  // would click.
  private fillMic(speed: number) {
    const s = Math.max(speed, CREEP)
    const want = 256 / s + 192
    if (!this.micPrimed) {
      this.micPrimed = true
      this.micRead = this.micWrite - want
    } else if (this.micWrite - this.micRead > MIC_SPAN) {
      // Further behind than the ring is long is a head reading a lap-old
      // sample, which is worse than the jump that puts it back on its lag.
      this.micRead = this.micWrite - want
    }
    const lag = this.micWrite - this.micRead
    const trim = Math.min(Math.max((lag - want) / want, -0.03), 0.03)
    const step = (1 + trim) / s
    if (this.micLive) {
      const last = this.micWrite - 1
      for (let i = 0; i < BLOCK; i++) {
        const at = Math.min(this.micRead + i * step, last)
        const idx = Math.floor(at)
        const frac = at - idx
        const a = this.micRing[idx & MIC_MASK]!
        const b = this.micRing[(idx + 1) & MIC_MASK]!
        this.micBlock[i] = a + frac * (b - a)
      }
    }
    this.micRead = Math.min(this.micRead + BLOCK * step, this.micWrite)
  }

  private laneAt(dest: number): number {
    const lane = this.chain.lane(dest)
    if (!lane) return 0
    let sum = 0
    for (let i = 0; i < BLOCK; i++) sum += lane[i]!
    return sum / BLOCK
  }

  // Whole laps off both heads at once. Every index this file computes is taken
  // modulo the ring, so dropping a multiple of it changes nothing about what is
  // read — it only keeps the numbers small enough for a mask to stay exact.
  private rebase() {
    const laps = Math.floor(this.readPos / RING) * RING
    if (laps > 0) {
      this.readPos -= laps
      this.write -= laps
    }
    // A stopped deck still takes mic in and reads none of it, so the two heads
    // would otherwise drift apart for as long as the tape is parked. Nothing
    // that far back is still in the ring to read.
    this.micRead = Math.max(this.micRead, this.micWrite - MIC_SPAN)
    const micLaps = Math.floor(this.micRead / MIC_RING) * MIC_RING
    if (micLaps > 0) {
      this.micRead -= micLaps
      this.micWrite -= micLaps
    }
  }
}
