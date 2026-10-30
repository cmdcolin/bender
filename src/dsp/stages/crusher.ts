import { IDX, SOURCE_TAPS, type SourceTap } from '../../engine/params.ts'
import { Bus, FAULT_NAMES } from '../bus.ts'
import { MIC } from '../micJacks.ts'
import { DEST, hop } from '../modbus.ts'
import { DEAD_V } from '../toyRail.ts'
import { clamp01 } from '../util/clamp.ts'
import { octaves } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

export const CRUSH_ADC = ['stock', 'SAR', 'μ-law', 'ADPCM', 'delta']
const ADC_SAR = 1
const ADC_MULAW = 2
const ADC_ADPCM = 3
const ADC_DELTA = 4

export const CRUSH_CLOCK = ['crystal', 'toy RC']
const CLOCK_RC = 1

export const CRUSH_REF = [
  'fixed',
  'the rail',
  'the toy chip',
  'the mic',
  'the bus',
]
const REF_RAIL = 1
export const CRUSH_REF_TOY = 2
const REF_MIC = 3
const REF_GAIN = 4
const REF_CLIP = 1.5

export const CRUSH_LOGIC = ['off', 'XOR', 'AND', 'OR']
const LOGIC_XOR = 1
const LOGIC_AND = 2

const WITH = [
  ['the toy', 'toyChip'],
  ['the kit', 'toyDrum'],
  ['glint', 'fmChip'],
  ['chaos osc', 'chaosOsc'],
  ['noise', 'noise'],
  ['sampler', 'sampler'],
  ['keys', 'pcmKeys'],
  ['growler', 'monoSynth'],
  ['layercake', 'fourTrack'],
] as const satisfies readonly (readonly [string, SourceTap])[]

export const CRUSH_WITH = WITH.map(([label]) => label)
export const CRUSH_WITH_TAP = WITH.map(([, tap]) => SOURCE_TAPS.indexOf(tap))

export const CRUSH_LINES = 16
const MSB = 0x8000
const TOP = 0xffff

// Bits a comparator settles per sample period at a full rail. A 48 kHz clock
// leaves exactly enough, so any sag at all costs the low bits.
const SAR_BITS_PER_SAMPLE = 16
const SAR_KNEE = 1.5

const MU = 255
const MU_LOG = Math.log1p(MU)

// One IMA block of mono 4-bit words; each header hands the decoder the
// encoder's state, so a bad word drifts until the next one.
export const ADPCM_BLOCK = 505
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8]
const IMA_STEP = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
]

const DM_LEAK = 0.999

// A bad MSB rung, short by this much of half scale at full travel, is the
// lurch at every zero crossing; heat opens every rung further.
const LADDER_TOL = 0.5
const LADDER_FLOOR = 0.4
const LADDER_HEAT = 1.5

const MIC_HYST = 0.02

const toWord = (v: number) =>
  Math.min(Math.max(Math.round((v + 1) * MSB), 0), TOP)
const fromWord = (w: number) => w / MSB - 1
const compress = (x: number) =>
  x < 0 ? -Math.log1p(-MU * x) / MU_LOG : Math.log1p(MU * x) / MU_LOG
const expand = (y: number) =>
  y < 0 ? -Math.expm1(-y * MU_LOG) / MU : Math.expm1(y * MU_LOG) / MU

class Adpcm {
  pred = 0
  index = 0

  step(nibble: number) {
    const step = IMA_STEP[this.index]!
    let diff = step >> 3
    if (nibble & 4) diff += step
    if (nibble & 2) diff += step >> 1
    if (nibble & 1) diff += step >> 2
    this.pred = Math.min(
      Math.max(this.pred + (nibble & 8 ? -diff : diff), -32768),
      32767,
    )
    this.index = Math.min(Math.max(this.index + IMA_INDEX[nibble & 7]!, 0), 88)
  }

  encode(s: number) {
    const step = IMA_STEP[this.index]!
    let diff = s - this.pred
    let nibble = 0
    if (diff < 0) {
      nibble = 8
      diff = -diff
    }
    if (diff >= step) {
      nibble |= 4
      diff -= step
    }
    if (diff >= step >> 1) {
      nibble |= 2
      diff -= step >> 1
    }
    if (diff >= step >> 2) nibble |= 1
    this.step(nibble)
    return nibble
  }

  reset() {
    this.pred = 0
    this.index = 0
  }
}

class Side {
  hold = 0
  count = 0
  budget = 0
  enc = new Adpcm()
  dec = new Adpcm()
  words = 0
  dmEnc = 0
  dmDec = 0
  dmReg = 0

  private readonly start: number

  constructor(start: number) {
    this.start = start
    this.count = start
  }

  reset() {
    this.hold = 0
    this.count = this.start
    this.budget = 0
    this.enc.reset()
    this.dec.reset()
    this.words = 0
    this.dmEnc = 0
    this.dmDec = 0
    this.dmReg = 0
  }
}

// Bit depth quantizer plus a jittered sample-and-hold. The hold phases are
// offset per channel so heavy crush smears into stereo hash.
//
// Past stock it is a muxed converter: one ADC takes both channels in turn onto
// one sixteen-wire bus into one R-2R DAC, so a floating pin and the SAR's
// unfinished bits carry from one channel's word into the other's.
export class Crusher implements Stage {
  label = 'crusher'
  private holdL = 0
  private holdR = 0
  private countL = 0
  private countR = 0
  private rng: Rng

  private left = new Side(0)
  private right = new Side(2)
  private bus: Bus
  private sar = MSB
  private micHigh = false
  private fault: Rng
  private ladderHi = new Float64Array(256)
  private ladderLo = new Float64Array(256)
  private ladderMid = 0

  private readonly sr: number

  constructor(sr: number, seed = 404) {
    this.sr = sr
    this.rng = mulberry32(seed)
    this.countR = 2
    this.bus = new Bus(CRUSH_LINES, seed ^ 0xc0de)
    this.fault = mulberry32(seed ^ 0x5a2)
    const parts = mulberry32(seed ^ 0x1adde4)
    const trim = new Float64Array(CRUSH_LINES)
    for (let k = 0; k < CRUSH_LINES; k++) {
      const off =
        ((LADDER_FLOOR + (1 - LADDER_FLOOR) * parts()) *
          LADDER_TOL *
          (1 << k)) /
        MSB
      trim[k] = parts() < 0.5 ? -off : off
    }
    trim[CRUSH_LINES - 1] = -LADDER_TOL
    for (let w = 0; w < 256; w++) {
      for (let k = 0; k < 8; k++) {
        if ((w >> k) & 1) {
          this.ladderLo[w]! += trim[k]!
          this.ladderHi[w]! += trim[k + 8]!
        }
      }
    }
    this.ladderMid = (this.ladderHi[255]! + this.ladderLo[255]!) / 2
  }

  when(p: Float32Array) {
    return p[IDX.crushMix]! > 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const bay = ctx.mod
    const line =
      hop(
        p[IDX.crushDataLine]!,
        CRUSH_LINES + 1,
        bay.read(DEST.crushDataLine),
      ) - 1
    const deep =
      line >= 0 ||
      p[IDX.crushAdc]! >= 0.5 ||
      p[IDX.crushClock]! >= 0.5 ||
      p[IDX.crushRef]! >= 0.5 ||
      p[IDX.crushLogic]! >= 0.5 ||
      p[IDX.crushLadder]! > 0 ||
      bay.read(DEST.crushLadder) !== null ||
      Math.round(p[IDX.micPatch]!) === MIC.crushClock
    if (deep) this.circuit(io, p, ctx, line)
    else this.stock(io, p, ctx)
  }

  private stock(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const bits = p[IDX.bits]!
    const srHz = p[IDX.srHz]!
    const jitter = p[IDX.srJitter]!
    const mix = p[IDX.crushMix]!
    const mod = ctx.mod.read(DEST.crushHz)
    const modBits = ctx.mod.read(DEST.bits)
    const stepsBase = Math.pow(2, bits - 1)
    const holdBase = Math.max(this.sr / Math.max(srHz, 1), 1)

    for (let i = 0; i < io.n; i++) {
      // the clock and the word length are only read where a hold latches, as
      // the real divider does
      const hold = mod
        ? Math.max(
            this.sr /
              Math.min(Math.max(srHz * octaves(mod[i]! * 4), 20), this.sr),
            1,
          )
        : holdBase
      const steps = modBits
        ? octaves(Math.min(Math.max(bits + modBits[i]! * 8, 1), 16) - 1)
        : stepsBase
      this.countL -= 1
      if (this.countL <= 0) {
        this.holdL = Math.round(io.l[i]! * steps) / steps
        this.countL = hold * (1 + jitter * (this.rng() * 2 - 1))
      }
      this.countR -= 1
      if (this.countR <= 0) {
        this.holdR = Math.round(io.r[i]! * steps) / steps
        this.countR = hold * (1 + jitter * (this.rng() * 2 - 1))
      }
      io.l[i] = io.l[i]! * (1 - mix) + this.holdL * mix
      io.r[i] = io.r[i]! * (1 - mix) + this.holdR * mix
    }
  }

  private circuit(io: StereoBlock, p: Float32Array, ctx: Ctx, line: number) {
    const bay = ctx.mod
    const bits = p[IDX.bits]!
    const srHz = p[IDX.srHz]!
    const jitter = p[IDX.srJitter]!
    const mix = p[IDX.crushMix]!
    const adc = Math.round(p[IDX.crushAdc]!)
    const rc = Math.round(p[IDX.crushClock]!) === CLOCK_RC
    const micClock = Math.round(p[IDX.micPatch]!) === MIC.crushClock
    const ref = Math.round(p[IDX.crushRef]!)
    const logic = Math.round(p[IDX.crushLogic]!)
    const fault = hop(
      p[IDX.crushDataFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.crushDataFault),
    )
    const modCut = bay.read(DEST.crushBusCut)
    const cut = clamp01(p[IDX.crushBusCut]! + (modCut ? modCut[0]! : 0))
    const ladderBase = p[IDX.crushLadder]!
    const modLadder = bay.read(DEST.crushLadder)
    const widen = 1 + LADDER_HEAT * ctx.heat
    const depthBase = p[IDX.crushRefDepth]!
    const modDepth = ref > 0 ? bay.read(DEST.crushRefDepth) : null
    const mod = bay.read(DEST.crushHz)
    const modBits = bay.read(DEST.bits)
    const stepsBase = Math.pow(2, bits - 1)
    const holdBase = Math.max(this.sr / Math.max(srHz, 1), 1)
    const { left, right } = this

    for (let i = 0; i < io.n; i++) {
      const hold = mod
        ? Math.max(
            this.sr /
              Math.min(Math.max(srHz * octaves(mod[i]! * 4), 20), this.sr),
            1,
          )
        : holdBase
      const steps = modBits
        ? octaves(Math.min(Math.max(bits + modBits[i]! * 8, 1), 16) - 1)
        : stepsBase
      const supply = 1 - ctx.droop[i]!
      const speed =
        supply > DEAD_V
          ? Math.pow((supply - DEAD_V) / (1 - DEAD_V), SAR_KNEE)
          : 0
      left.budget += speed
      right.budget += speed
      let latchL = false
      let latchR = false
      if (micClock) {
        const m = ctx.mic[i]!
        if (!this.micHigh && m > MIC_HYST) {
          this.micHigh = true
          latchL = latchR = true
        } else if (this.micHigh && m < -MIC_HYST) this.micHigh = false
      } else {
        const v = ctx.railV[i]!
        const tick = rc ? Math.max((v - DEAD_V) / (1 - DEAD_V), 0) : 1
        left.count -= tick
        right.count -= tick
        if (left.count <= 0) {
          latchL = true
          left.count = hold * (1 + jitter * (this.rng() * 2 - 1))
        }
        if (right.count <= 0) {
          latchR = true
          right.count = hold * (1 + jitter * (this.rng() * 2 - 1))
        }
      }
      if (latchL || latchR) {
        const ladder = modLadder
          ? clamp01(ladderBase + modLadder[i]!)
          : ladderBase
        const amt = ladder * widen
        const other = logic > 0 ? ctx.logic[i]! : 0
        if (latchL)
          left.hold = this.convert(
            left,
            io.l[i]!,
            other,
            steps,
            adc,
            logic,
            line,
            fault,
            cut,
            amt,
          )
        if (latchR)
          right.hold = this.convert(
            right,
            io.r[i]!,
            other,
            steps,
            adc,
            logic,
            line,
            fault,
            cut,
            amt,
          )
      }
      let g = 1
      if (ref > 0) {
        const pin =
          ref === REF_RAIL
            ? ctx.railV[i]!
            : Math.min(
                Math.max(
                  REF_GAIN *
                    (ref === CRUSH_REF_TOY
                      ? ctx.toy[i]!
                      : ref === REF_MIC
                        ? ctx.mic[i]!
                        : 0.5 * (io.l[i]! + io.r[i]!)),
                  -REF_CLIP,
                ),
                REF_CLIP,
              )
        const depth = modDepth ? clamp01(depthBase + modDepth[i]!) : depthBase
        g = 1 + depth * (pin - 1)
      }
      io.l[i] = io.l[i]! * (1 - mix) + left.hold * g * mix
      io.r[i] = io.r[i]! * (1 - mix) + right.hold * g * mix
    }
  }

  private convert(
    side: Side,
    x: number,
    other: number,
    steps: number,
    adc: number,
    logic: number,
    line: number,
    fault: number,
    cut: number,
    ladder: number,
  ): number {
    const q = (v: number) => Math.round(v * steps) / steps
    let word: number
    if (adc === ADC_ADPCM) {
      if (side.words++ % ADPCM_BLOCK === 0) {
        side.dec.pred = side.enc.pred
        side.dec.index = side.enc.index
      }
      word = side.enc.encode(Math.round(q(x) * 32767)) << 12
    } else if (adc === ADC_DELTA) {
      const delta = 1 / Math.cbrt(2 * steps)
      const bit = x >= side.dmEnc ? 1 : 0
      side.dmEnc = Math.min(
        Math.max(side.dmEnc * DM_LEAK + (bit ? delta : -delta), -1),
        1,
      )
      side.dmReg = (side.dmReg >> 1) | (bit << 15)
      word = side.dmReg
    } else if (adc === ADC_MULAW) {
      word = toWord(q(compress(x)))
    } else {
      word = toWord(q(x))
      if (adc === ADC_SAR) {
        const done = side.budget * SAR_BITS_PER_SAMPLE
        let n = Math.floor(done)
        if (this.fault() < done - n) n++
        if (n < CRUSH_LINES) {
          const keep = n <= 0 ? TOP : TOP >> n
          word = (word & ~keep & TOP) | (this.sar & keep)
        }
        this.sar = word
      }
    }
    side.budget = 0
    if (logic > 0) {
      const b = toWord(q(adc === ADC_MULAW ? compress(other) : other)) ^ MSB
      const a = word ^ MSB
      word =
        (logic === LOGIC_XOR ? a ^ b : logic === LOGIC_AND ? a & b : a | b) ^
        MSB
    }
    if (line >= 0) word = this.bus.read(word, line, fault, cut)
    let v: number
    if (adc === ADC_ADPCM) {
      side.dec.step((word >> 12) & 15)
      v = side.dec.pred / MSB
    } else if (adc === ADC_DELTA) {
      const delta = 1 / Math.cbrt(2 * steps)
      side.dmDec = Math.min(
        Math.max(side.dmDec * DM_LEAK + (word & MSB ? delta : -delta), -1),
        1,
      )
      v = side.dmDec
    } else v = adc === ADC_MULAW ? expand(fromWord(word)) : fromWord(word)
    if (ladder > 0) {
      const w = toWord(v)
      v +=
        ladder *
        (this.ladderHi[w >> 8]! + this.ladderLo[w & 255]! - this.ladderMid)
    }
    return v
  }

  panic() {
    this.holdL = 0
    this.holdR = 0
    this.countL = 0
    this.countR = 2
    this.left.reset()
    this.right.reset()
    this.bus.reset()
    this.sar = MSB
    this.micHigh = false
  }
}
