import { IDX } from '../../engine/params.ts'
import {
  ALLOPHONES,
  DEMO_PHRASE,
  PH_EMPTY,
  PH_SYL,
  PH_WORD,
  PHRASE_KEYS,
  PHRASE_LEN,
} from '../../prattle.ts'
import { Bus } from '../bus.ts'
import { MIC, micInto } from '../micJacks.ts'
import { SupplyTap, type Supplies } from '../supplies.ts'
import { voiceMask } from '../trigbus.ts'
import { DcBlocker, lpCoef, OnePoleLP } from '../util/onepole.ts'
import { mulberry32 } from '../util/rng.ts'
import { flushDenormal, softclip } from '../util/softclip.ts'
import { CORD_FROM, cordTap, PIN } from './cord.ts'
import {
  BASE_PITCH,
  BLOCK_WORDS,
  CHIP_HZ,
  CHIRP_BLOCK,
  CHIRP_LEN,
  COEF_ADDR_LINES,
  COEF_DATA_LINES,
  ENERGY_BLOCK,
  FRAME_SAMPLES,
  INTERP_STEPS,
  N_K,
  PITCH_BITS,
  PITCH_BLOCK,
  ROM,
  signed,
} from './prattleRom.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

// A talking toy's speech chip: ten lattice stages excited by a chirp off a
// pitch divider for voiced frames and by a shift register for the rest. One RC
// oscillator clocks the samples, the pitch counter and the frame counter, so
// starving it drops the voice, the speed and the formants together.

export const FRAME_DIVS = [1, 2, 3, 4, 6, 8, 16, 32, 64, 0]
export const LOCK_MULTS = [0, 1, 2, 4]
export const VOICING = { spoken: 0, voiced: 1, whisper: 2 } as const

const PITCH_TOP = (1 << PITCH_BITS) - 1
const PH_IDX = PHRASE_KEYS.map(k => IDX[k])
const PAUSE = ALLOPHONES.indexOf('PA')
const LONG_PAUSE = ALLOPHONES.indexOf('PA2')
// Every adder in the lattice saturates rather than wraps, so a coefficient
// past one rings up into the rails and howls there instead of running away.
const SAT = 3
const saturate = (x: number) => SAT * softclip(x / SAT)
const DAC_STEPS = 512
const OUT_TRIM = 0.8
// The chip's own reconstruction filter is switched-capacitor, run off the same
// RC clock, so it follows the voice up and down.
const FILTER_AT = 0.45
const FILTER_TOP = 0.4
const DC_HZ = 20
const MIC_GAIN = 3
const LEAK_GAIN = 2.5
const MAX_CHIP_STEPS = 8
const LFSR_SEED = 0x1fff
const DATA_SEED = 0x3d
const ADDR_SEED = 0x5b
const PITCH_SEED = 0x71
const LOOP_SEED = 0x2c
const SLIP_SEED = 0x46
const SLIP_ODDS = 0.5
const OVER_GAIN = 2
const PERIOD_WRAP = 256
const SING_HYST = 0.05
// Chip samples the pitch counter waits for the next reset before it goes back
// to wrapping at its own period: 50 ms, so a sung note down to 20 Hz holds.
const SING_HOLD = 400

export const SING_FROM = ['off', ...CORD_FROM]

// A coefficient or energy register is ten bits of two's complement, so a sum
// past full scale comes back from the other end.
const wrapSigned = (x: number) => x - 2 * Math.floor((x + 1) / 2)

export class Prattle implements Stage {
  label = 'prattle'

  private readonly phrase = new Uint8Array(PHRASE_LEN)
  private pos = -1
  private segNext = 0
  private speaking = false
  private sayQueued = false
  private on = false
  private addr = 0
  private end = 0

  private fp = 1
  private divCount = 0
  private step = -1
  private sinceStrobe = 0
  private subIdx = 0

  private readonly fromK = new Float64Array(N_K)
  private readonly tgtK = new Float64Array(N_K)
  private readonly k = new Float64Array(N_K)
  private readonly b = new Float64Array(N_K + 1)
  private fromE = 0
  private tgtE = 0
  private energy = 0
  private fromP = 0
  private tgtP = 0
  private period = 0
  private lastVoiced = 0

  private pitchCount = 0
  private lfsr = LFSR_SEED
  private chipPhase = 0
  private held = 0
  private micNow = 0
  private outNow = 0

  private readonly dataBus = new Bus(COEF_DATA_LINES, DATA_SEED)
  private readonly addrBus = new Bus(COEF_ADDR_LINES, ADDR_SEED)
  private readonly pitchBus = new Bus(PITCH_BITS, PITCH_SEED)
  private loopRng = mulberry32(LOOP_SEED)
  private slipRng = mulberry32(SLIP_SEED)
  private slip = 0
  private slipOdds = 0
  private over = 0
  private singHigh = false
  private sungAgo = SING_HOLD
  private dataLine = -1
  private dataFault = 0
  private addrLine = -1
  private addrFault = 0
  private pitchLine = -1
  private pitchFault = 0
  private busCut = 1
  private loopMask = 0
  private loopSlip = 0
  private div = 1
  private inflect = 0
  private voicing = 0
  private leak = 0
  private struck = false
  private repeat = false

  private readonly smooth1 = new OnePoleLP()
  private readonly smooth2 = new OnePoleLP()
  private readonly dc = new DcBlocker()
  private readonly dcCoef: number

  private readonly sr: number
  private readonly power: SupplyTap

  constructor(sr: number, supplies: Supplies) {
    this.sr = sr
    this.power = new SupplyTap(supplies)
    this.dcCoef = 1 - (2 * Math.PI * DC_HZ) / sr
  }

  // Like the toy it came out of, it says its phrase on power-up: the fader
  // coming off the floor.
  when(p: Float32Array) {
    const on = p[IDX.talkLevel]! > 0
    if (on && !this.on) this.sayQueued = true
    this.on = on
    return on
  }

  cords(p: Float32Array) {
    const from = Math.round(p[IDX.talkSingFrom]!)
    const tap = from > 0 ? cordTap(from - 1, null) : PIN
    return tap === PIN ? 0 : 1 << tap
  }

  /** Speak the phrase from the top. */
  say() {
    this.sayQueued = true
  }

  /** Where the chip is in its phrase, -1 when it is not speaking. */
  get at() {
    return this.speaking ? this.pos : -1
  }

  private fetch(addr: number) {
    const a = this.addrBus.read(
      addr,
      this.addrLine,
      this.addrFault,
      this.busCut,
    )
    return this.dataBus.read(
      ROM.coef[a & ((1 << COEF_ADDR_LINES) - 1)]!,
      this.dataLine,
      this.dataFault,
      this.busCut,
    )
  }

  private loadPhrase(p: Float32Array) {
    let empty = true
    for (let i = 0; i < PHRASE_LEN; i++) {
      const c = Math.round(p[PH_IDX[i]!]!)
      this.phrase[i] = c
      if (c !== PH_EMPTY) empty = false
    }
    if (empty) this.phrase.set(DEMO_PHRASE)
  }

  private allophone(a: number) {
    this.addr = ROM.start[a]!
    this.end = ROM.end[a]!
  }

  // Past the allophone just spoken to the next one in the phrase, stopping at a
  // split when a hit is what moves it on.
  private next() {
    let settled = false
    for (let guard = 0; !settled && guard <= PHRASE_LEN; guard++) {
      this.pos++
      const c = this.pos < PHRASE_LEN ? this.phrase[this.pos]! : PH_EMPTY
      if (c === PH_EMPTY) {
        this.segNext = 0
        if (this.repeat && !this.struck) {
          this.pos = -1
          this.allophone(LONG_PAUSE)
        } else this.speaking = false
        settled = true
      } else if (c === PH_WORD || c === PH_SYL) {
        if (this.struck) this.speaking = false
        else if (c === PH_WORD) this.allophone(PAUSE)
        settled = this.struck || c === PH_WORD
      } else {
        this.allophone(c - 1)
        settled = true
      }
    }
    if (!settled) this.speaking = false
  }

  private speakFrom(pos: number) {
    this.pos = pos
    this.speaking = true
    this.next()
  }

  private begin(from: number) {
    this.speakFrom(from - 1)
    if (!this.speaking && from > 0) this.speakFrom(-1)
    this.segNext = this.segmentEnd()
    // With the frame clock stopped, the start pulse runs the counter on until
    // the voicing latch takes a voiced frame, and the chip holds it.
    for (
      let g = 0;
      this.div === 0 &&
      this.speaking &&
      ROM.framePitch[this.addr] === 0 &&
      g < PHRASE_LEN * 8;
      g++
    )
      this.advance()
    this.frame()
  }

  // Where the next hit picks up: past the split that ends this segment.
  private segmentEnd() {
    let end = PHRASE_LEN
    for (let i = Math.max(this.pos, 0); i < end; i++) {
      const c = this.phrase[i]!
      if (c === PH_EMPTY || c === PH_WORD || c === PH_SYL) end = i
    }
    return end < PHRASE_LEN && this.phrase[end] !== PH_EMPTY ? end + 1 : 0
  }

  private advance() {
    const m = this.loopMask
    const wraps = m !== 0 && ((this.addr + 1) & m) === 0
    this.addr =
      wraps && this.loopRng() >= this.loopSlip ? this.addr & ~m : this.addr + 1
    if (this.addr === this.end) this.next()
  }

  // A frame tick: the frame counter's word read out of the frame ROM and its
  // codes looked up in the coefficient ROM, all across the one bus.
  private frame() {
    this.fp = 0
    this.step = -1
    for (let s = 0; s < N_K; s++) this.fromK[s] = this.k[s]!
    this.fromE = this.energy
    this.fromP = this.period
    if (this.speaking) this.latch()
    else this.tgtE = 0
  }

  private latch() {
    const f = this.addr
    const pCode = ROM.framePitch[f]!
    const eCode = ROM.frameEnergy[f]!
    const base = f * N_K
    this.slip =
      this.slipOdds > 0
        ? (this.slip + (this.slipRng() < this.slipOdds ? 1 : 0)) % N_K
        : 0
    const slip = this.slip
    for (let s = 0; s < N_K; s++)
      this.tgtK[(s + slip) % N_K] = signed(
        this.fetch(s * BLOCK_WORDS + ROM.frameK[base + s]!),
      )
    this.tgtE = signed(this.fetch(ENERGY_BLOCK * BLOCK_WORDS + eCode))
    const pitch =
      pCode === 0
        ? 0
        : this.pitchBus.read(
            Math.min(Math.max(pCode + this.inflect, 1), PITCH_TOP),
            this.pitchLine,
            this.pitchFault,
            this.busCut,
          )
    const period =
      pitch === 0 ? 0 : this.fetch(PITCH_BLOCK * BLOCK_WORDS + pitch)
    this.tgtP =
      this.voicing === VOICING.whisper
        ? 0
        : period === 0 && this.voicing === VOICING.voiced
          ? this.lastVoiced || ROM.coef[PITCH_BLOCK * BLOCK_WORDS + BASE_PITCH]!
          : period
    if (this.tgtP > 0) this.lastVoiced = this.tgtP
    // No glide out of silence or across a change of source, so a burst lands
    // whole.
    if (this.fromE === 0 || (this.fromP === 0) !== (this.tgtP === 0)) {
      for (let s = 0; s < N_K; s++) this.fromK[s] = this.tgtK[s]!
      this.fromE = this.tgtE
      this.fromP = this.tgtP
    }
    this.advance()
  }

  private tick() {
    if (this.div !== 0 && ++this.divCount >= this.div) {
      this.divCount = 0
      this.frame()
    }
  }

  private interpolate() {
    const step = Math.min(Math.floor(this.fp * INTERP_STEPS), INTERP_STEPS - 1)
    if (step !== this.step) {
      this.step = step
      const over = this.over
      const t = ((step + 1) / INTERP_STEPS) * (1 + OVER_GAIN * over)
      for (let s = 0; s < N_K; s++) {
        const k = this.fromK[s]! + (this.tgtK[s]! - this.fromK[s]!) * t
        this.k[s] = over > 0 ? wrapSigned(k) : k
      }
      const energy = this.fromE + (this.tgtE - this.fromE) * t
      this.energy = over > 0 ? wrapSigned(energy) : energy
      const period = Math.round(this.fromP + (this.tgtP - this.fromP) * t)
      this.period =
        over > 0 && this.fromP > 0 && this.tgtP > 0
          ? ((period % PERIOD_WRAP) + PERIOD_WRAP) % PERIOD_WRAP
          : period
    }
  }

  private chipSample(ownClock: boolean) {
    if (ownClock) {
      this.fp += 1 / (FRAME_SAMPLES * Math.max(this.div, 1))
      if (this.fp >= 1) {
        this.fp = 1
        this.tick()
      }
    }
    this.interpolate()
    let e: number
    if (this.sungAgo < SING_HOLD) this.sungAgo++
    if (this.period > 0) {
      if (++this.pitchCount >= this.period && this.sungAgo >= SING_HOLD)
        this.pitchCount = 0
      e =
        this.pitchCount < CHIRP_LEN
          ? signed(this.fetch(CHIRP_BLOCK * BLOCK_WORDS + this.pitchCount))
          : 0
    } else {
      const bit = (this.lfsr ^ (this.lfsr >> 1)) & 1
      this.lfsr = (this.lfsr >> 1) | (bit << 12)
      e = this.lfsr & 1 ? 1 : -1
    }
    e = (this.micNow !== 0 ? this.micNow * MIC_GAIN : e) * this.energy
    e += this.leak * LEAK_GAIN * this.outNow * this.energy
    const k = this.k
    const b = this.b
    let f = e
    for (let s = N_K - 1; s >= 0; s--) {
      f -= k[s]! * b[s]!
      f = saturate(f)
      b[s + 1] = flushDenormal(saturate(b[s]! + k[s]! * f))
    }
    b[0] = flushDenormal(f)
    const y = f > 1 ? 1 : f < -1 ? -1 : f
    this.held = Math.round(y * DAC_STEPS) / DAC_STEPS
    // Done talking, the chip mutes its DAC and clears the lattice.
    if (!this.speaking && this.energy === 0) {
      this.held = 0
      b.fill(0)
    }
  }

  private read(p: Float32Array) {
    const line = (key: number) => Math.round(p[key]!) - 1
    this.dataLine = line(IDX.talkDataLine)
    this.dataFault = Math.round(p[IDX.talkDataFault]!)
    this.addrLine = line(IDX.talkAddrLine)
    this.addrFault = Math.round(p[IDX.talkAddrFault]!)
    this.pitchLine = line(IDX.talkPitchLine)
    this.pitchFault = Math.round(p[IDX.talkPitchFault]!)
    this.busCut = p[IDX.talkBusCut]!
    const loop = Math.round(p[IDX.talkLoopBit]!)
    this.loopMask = loop > 0 ? (1 << loop) - 1 : 0
    this.loopSlip = p[IDX.talkLoopSlip]!
    this.div = FRAME_DIVS[Math.round(p[IDX.talkFrameDiv]!)] ?? 1
    this.inflect = Math.round(p[IDX.talkInflect]!)
    this.voicing = Math.round(p[IDX.talkVoicing]!)
    this.leak = p[IDX.talkLeak]!
    const slip = p[IDX.talkStackSlip]!
    this.slipOdds = SLIP_ODDS * slip * slip
    this.over = p[IDX.talkOvershoot]!
    this.repeat = p[IDX.talkRepeat]! >= 0.5
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const aged = io.n / ctx.sr
    this.dataBus.age(aged)
    this.addrBus.age(aged)
    this.pitchBus.age(aged)
    const n = io.n
    const rail = this.power.pick(p[IDX.talkSupply]!)
    if (this.power.rebooted()) this.hush()
    this.read(p)
    this.loadPhrase(p)
    const struckBy = Math.round(p[IDX.talkStruck]!)
    const mask = voiceMask(struckBy)
    this.struck = struckBy > 0
    const bits = ctx.trig.bitsNow
    const strobes = ctx.trig.stepNow
    const mult = LOCK_MULTS[Math.round(p[IDX.talkLock]!)] ?? 0
    const subLen = Math.max(ctx.trig.stepLenNow / Math.max(mult, 1), 1)
    const lockStep = 1 / (subLen * Math.max(this.div, 1))
    const mic = micInto(p, ctx, MIC.prattleIn)
    const singFrom = Math.round(p[IDX.talkSingFrom]!)
    const singTap = singFrom > 0 ? cordTap(singFrom - 1, null) : PIN
    const sung =
      singFrom === 0
        ? null
        : singTap === PIN
          ? ctx.trig.pin
          : ctx.trig.outs[singTap]!
    if (!sung) this.sungAgo = SING_HOLD
    const chipHz = CHIP_HZ * p[IDX.talkClock]! * rail.clockFactor
    const inc = chipHz / this.sr
    const smooth = lpCoef(
      Math.min(chipHz * FILTER_AT, this.sr * FILTER_TOP),
      this.sr,
    )

    if (this.sayQueued || (this.repeat && !this.struck && !this.speaking)) {
      this.sayQueued = false
      this.begin(0)
    }

    const amp = rail.ampFactor * p[IDX.talkLevel]! * OUT_TRIM
    let load = 0
    for (let i = 0; i < n; i++) {
      if (this.struck) {
        if ((Math.round(bits[i]!) & mask) !== 0) this.begin(this.segNext)
      }
      if (mult > 0) {
        if (strobes[i]! > 0) {
          this.sinceStrobe = 0
          this.subIdx = 0
          this.tick()
        } else if (
          ++this.sinceStrobe >= (this.subIdx + 1) * subLen &&
          this.subIdx < mult - 1
        ) {
          this.subIdx++
          this.tick()
        }
        this.fp = Math.min(this.fp + lockStep, 1)
      }
      if (sung) {
        const x = sung[i]!
        if (!this.singHigh && x > SING_HYST) {
          this.singHigh = true
          this.pitchCount = -1
          this.sungAgo = 0
        } else if (this.singHigh && x < -SING_HYST) this.singHigh = false
      }
      this.micNow = mic ? mic[i]! : 0
      this.outNow = ctx.out[i]!
      this.chipPhase += inc
      for (let s = 0; this.chipPhase >= 1 && s < MAX_CHIP_STEPS; s++) {
        this.chipPhase -= 1
        this.chipSample(mult === 0)
      }
      if (this.chipPhase >= 1) this.chipPhase = 0
      const spoken = this.dc.process(
        this.smooth2.process(this.smooth1.process(this.held, smooth), smooth),
        this.dcCoef,
      )
      const out = softclip(spoken) * amp
      load += out < 0 ? -out : out
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.drawing += load / n
  }

  private hush() {
    this.speaking = false
    this.sayQueued = false
    this.pos = -1
    this.segNext = 0
    this.tgtE = 0
    this.energy = 0
    this.fromE = 0
  }

  panic() {
    this.hush()
    this.chipPhase = 0
    this.b.fill(0)
    this.k.fill(0)
    this.fromK.fill(0)
    this.tgtK.fill(0)
    this.period = 0
    this.fromP = 0
    this.tgtP = 0
    this.held = 0
    this.fp = 1
    this.divCount = 0
    this.smooth1.reset()
    this.smooth2.reset()
    this.dc.reset()
    this.dataBus.reset()
    this.addrBus.reset()
    this.pitchBus.reset()
    this.loopRng = mulberry32(LOOP_SEED)
    this.slipRng = mulberry32(SLIP_SEED)
    this.slip = 0
    this.singHigh = false
    this.sungAgo = SING_HOLD
    this.lfsr = LFSR_SEED
  }
}
