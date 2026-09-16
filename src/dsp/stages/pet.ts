import { IDX } from '../../engine/params'
import { Bus, FAULT_NAMES } from '../bus'
import { DEST, hop } from '../modbus'
import { octaves } from '../util/pitch'
import { mulberry32, type Rng } from '../util/rng'
import { flushDenormal } from '../util/softclip'
import {
  CHIP_HZ,
  CHIRP,
  E_STOP,
  ENERGY,
  ENERGY_BITS,
  K_BITS,
  K_TABLES,
  N_K,
  PERIOD,
  PET_ADDR_LINES,
  PET_DATA_LINES,
  PET_ROM,
  PHRASE,
  PHRASE_START,
  PITCH_BITS,
  ROM_BYTES,
  SUBFRAME,
  SUBFRAMES,
} from './petRom'

import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'

export const MOOD_NAMES = [
  'asleep',
  'awake',
  'chatty',
  'hungry',
  'scared',
  'sleepy',
] as const
export const MOOD = {
  asleep: 0,
  awake: 1,
  chatty: 2,
  hungry: 3,
  scared: 4,
  sleepy: 5,
} as const

const MOOD_PHRASES: readonly (readonly number[])[] = [
  [PHRASE.snore],
  [PHRASE.hello, PHRASE['dah noh loo'], PHRASE['koh mah'], PHRASE['la la loo']],
  [PHRASE.laugh, PHRASE['la la loo'], PHRASE['may may'], PHRASE['dah noh loo']],
  [PHRASE.hungry, PHRASE['yum yum']],
  [PHRASE['uh oh'], PHRASE.wee],
  [PHRASE.yawn, PHRASE.sleep, PHRASE.nighty],
]
const ENTRY_PHRASE = [
  PHRASE.nighty,
  PHRASE.hello,
  PHRASE.laugh,
  PHRASE.hungry,
  PHRASE['uh oh'],
  PHRASE.yawn,
]
const MOOD_PITCH = [0.85, 1, 1.08, 0.95, 1.25, 0.85]
const MOOD_RATE = [0.9, 1, 1.1, 0.95, 1.2, 0.8]
/** Unprompted phrases a second with Chatter all the way up. */
const MOOD_TALK = [0.08, 0.35, 0.8, 0.5, 0.7, 0.25]

const WAKE = 0.04
const SCARE = 0.6
/** How much of the board's output envelope the ears pick up. */
const ENV_EARS = 0.5
const DEAF_SECS = 0.4
const QUIET_TO_SLEEPY = 20
/** Extra seconds of quiet before sleep, and wakes a second while asleep, at full Chatter. */
const CHATTER_STAYS_UP = 100
const CHATTER_WAKES = 0.05
const SLEEPY_TO_ASLEEP = 6
const CHATTY_SECS = 8
const SCARED_SECS = 5
const HUNGER_SECS = 45
const HITS_TO_SCARE = 6
const LOW_RAIL = 0.62
const BLINK_SECS = 0.35

/** The host processor gives up on a phrase after this many frames. */
const MAX_FRAMES = 160
/** The lattice adders saturate here. */
const CLAMP = 4
/** And the output stage here. */
const OUT_CLAMP = 1.2
const SPEECH_GAIN = 0.8
/** The fastest the chip clock can run, in chip samples per output sample. */
const MAX_INC = 4

const MOTOR_HZ = 55
const REVS_PER_CLICK = 4
const MOTOR_SPIN_SECS = 0.08
/** Current the motor draws running, and on top of that while it spins up. */
const MOTOR_RUN_LOAD = 0.3
const MOTOR_INRUSH = 0.6

const ENERGY_QUIET = ENERGY[1]!
const ENERGY_SPAN = Math.log(ENERGY[E_STOP - 1]! / ENERGY_QUIET)

const clamp = (x: number) => (x > CLAMP ? CLAMP : x < -CLAMP ? -CLAMP : x)

// A talking pet toy: a speech chip reading LPC frames out of a phrase ROM, a
// microcontroller choosing phrases by mood, and one cam motor for the eyes and
// ears on the same batteries as the rest of the toy board.
export class Pet implements Stage {
  label = 'pet'

  private readonly rng: Rng
  private readonly addrBus: Bus
  private readonly dataBus: Bus
  private addrLine = -1
  private addrFault = 0
  private dataLine = -1
  private dataFault = 0
  private hold = 0
  private kBits = 0

  private readonly k = new Float32Array(N_K)
  private readonly kFrom = new Float32Array(N_K)
  private readonly kTo = new Float32Array(N_K)
  private readonly b = new Float32Array(N_K + 1)
  private energy = 0
  private eFrom = 0
  private eTo = 0
  private period = 0
  private pFrom = 0
  private pTo = 0
  private amp = 0
  private voiced = false
  private jump = true

  private speaking = false
  private addr = 0
  private bit = 0
  private byte = 0
  private frames = 0
  private subIdx = 0
  private sub = 0
  private pulse = 0
  private noise = 0x2545f491
  private chipAcc = 0
  private held = 0
  private hpIn = 0
  private hpOut = 0

  private moodNow: number = MOOD.awake
  private moodTime = 0
  private quiet = 0
  private hunger = 0
  private sound = 0
  private hits = 0
  private deaf = 0
  private railAvg = 1
  private pending: number = PHRASE.hello
  private blink = 0
  private lastReboot = 0

  private speed = 0
  private revPhase = 0
  private revs = 0
  private hiss = 0x1d872b41
  private ring1 = 0
  private ring2 = 0
  private readonly ringC: number
  private readonly ringR2: number

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    seed = 0x9e7,
  ) {
    this.rng = mulberry32(seed)
    this.addrBus = new Bus(PET_ADDR_LINES, seed ^ 0xadd4)
    this.dataBus = new Bus(PET_DATA_LINES, seed ^ 0xda7a)
    const r = 0.985
    this.ringC = 2 * r * Math.cos((2 * Math.PI * 1900) / sr)
    this.ringR2 = r * r
  }

  when(p: Float32Array) {
    return p[IDX.petLevel]! > 0
  }

  private saying = -1

  get mood(): number {
    return this.moodNow
  }

  /** The phrase being spoken, or -1. */
  get phrase(): number {
    return this.speaking ? this.saying : -1
  }

  /** How fast the cam motor turns, 0 to 1. */
  get motor(): number {
    return this.speed
  }

  /** How loud the current speech frame is, 0 to 1 on the log scale the energy
      codes step along. */
  get mouth(): number {
    if (!this.speaking || this.energy <= ENERGY_QUIET) return 0
    return Math.min(Math.log(this.energy / ENERGY_QUIET) / ENERGY_SPAN, 1)
  }

  private fetch(addr: number): number {
    const a =
      this.addrBus.read(addr, this.addrLine, this.addrFault, 1) &
      (ROM_BYTES - 1)
    return this.dataBus.read(PET_ROM[a]!, this.dataLine, this.dataFault, 1)
  }

  private bits(count: number): number {
    let v = 0
    for (let i = 0; i < count; i++) {
      if (this.bit === 0) this.byte = this.fetch(this.addr)
      v = (v << 1) | ((this.byte >> (7 - this.bit)) & 1)
      if (++this.bit === 8) {
        this.bit = 0
        this.addr = (this.addr + 1) & (ROM_BYTES - 1)
      }
    }
    return v
  }

  say(phrase: number) {
    this.saying = phrase
    this.speaking = true
    this.pending = -1
    this.addr = PHRASE_START[phrase]!
    this.bit = 0
    this.frames = 0
    this.subIdx = SUBFRAMES - 1
    this.sub = SUBFRAME - 1
    this.energy = 0
    this.eTo = 0
    this.voiced = false
    this.jump = true
    this.b.fill(0)
  }

  private hush() {
    this.speaking = false
    this.held = 0
    this.energy = 0
    this.eTo = 0
    this.amp = 0
    this.b.fill(0)
    this.deaf = DEAF_SECS
  }

  private corrupt(k: number): number {
    if (this.rng() >= this.kBits) return k
    const q = (Math.round(k * 256) & 0x3ff) ^ (1 << ((this.rng() * 10) | 0))
    return (q >= 512 ? q - 1024 : q) / 256
  }

  private frame() {
    this.eFrom = this.energy
    this.pFrom = this.period
    this.kFrom.set(this.k)
    if (++this.frames > MAX_FRAMES) {
      this.hush()
      return
    }
    if (this.rail.latched || this.rng() < this.hold) {
      this.jump = false
      return
    }
    const e = this.bits(ENERGY_BITS)
    if (e === E_STOP) {
      this.hush()
      return
    }
    if (e === 0) {
      this.eTo = 0
      this.jump = true
      return
    }
    const repeat = this.bits(1) === 1
    const pitch = this.bits(PITCH_BITS)
    const voiced = pitch !== 0
    if (!repeat) {
      const count = voiced ? N_K : 4
      for (let i = 0; i < count; i++)
        this.kTo[i] = K_TABLES[i]![this.bits(K_BITS[i]!)]!
      for (let i = count; i < N_K; i++) this.kTo[i] = 0
    }
    if (this.kBits > 0)
      for (let i = 0; i < N_K; i++) this.kTo[i] = this.corrupt(this.kTo[i]!)
    this.jump = voiced !== this.voiced || this.eFrom === 0
    this.voiced = voiced
    this.eTo = ENERGY[e]!
    this.pTo = PERIOD[pitch]!
  }

  private interpolate() {
    if (++this.subIdx >= SUBFRAMES) {
      this.subIdx = 0
      this.frame()
      if (!this.speaking) return
    }
    const t = this.jump ? 1 : (this.subIdx + 1) / SUBFRAMES
    for (let i = 0; i < N_K; i++)
      this.k[i] = this.kFrom[i]! + (this.kTo[i]! - this.kFrom[i]!) * t
    this.energy = this.eFrom + (this.eTo - this.eFrom) * t
    this.period = this.voiced ? this.pFrom + (this.pTo - this.pFrom) * t : 0
    if (this.voiced && this.pFrom === 0) this.period = this.pTo
    this.amp = this.voiced ? this.energy * Math.sqrt(this.period) : this.energy
  }

  private chipSample(stretch: number): number {
    if (++this.sub >= SUBFRAME) {
      this.sub = 0
      this.interpolate()
      if (!this.speaking) return 0
    }
    let x: number
    if (this.voiced) {
      const per = Math.max(this.period * stretch, 2)
      if (++this.pulse >= per) this.pulse -= per
      const at = this.pulse | 0
      x = at < CHIRP.length ? CHIRP[at]! * this.amp : 0
    } else {
      let s = this.noise
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      this.noise = s
      x = s & 1 ? this.amp : -this.amp
    }
    const k = this.k
    const b = this.b
    let f = x
    for (let i = N_K - 1; i >= 0; i--) {
      f = clamp(f - k[i]! * b[i]!)
      b[i + 1] = k[i]! * f + b[i]!
    }
    b[0] = f
    return f > OUT_CLAMP ? OUT_CLAMP : f < -OUT_CLAMP ? -OUT_CLAMP : f
  }

  private enter(mood: number) {
    if (mood !== this.moodNow) this.blink = BLINK_SECS
    this.moodNow = mood
    this.moodTime = 0
    this.quiet = 0
    this.pending = ENTRY_PHRASE[mood]!
  }

  private think(p: Float32Array, ctx: Ctx, n: number, dt: number) {
    let peak = 0
    let hit = false
    for (let i = 0; i < n; i++) {
      const a = Math.abs(ctx.mic[i]!)
      if (a > peak) peak = a
      if (ctx.trig.drumGain[i]! > 0) hit = true
    }
    const busy = this.speaking || this.blink > 0 || this.deaf > 0
    const heard = busy ? peak : Math.max(peak, ctx.env[n - 1]! * ENV_EARS)
    this.sound = flushDenormal(
      Math.max(heard, this.sound * Math.exp(-dt / 0.3)),
    )
    this.hits = flushDenormal(this.hits * Math.exp(-dt / 1.5) + (hit ? 1 : 0))
    this.railAvg += (this.rail.v - this.railAvg) * Math.min(dt / 0.5, 1)
    this.deaf = Math.max(this.deaf - dt, 0)
    this.blink = Math.max(this.blink - dt, 0)
    this.moodTime += dt

    if (this.rail.rebootCount !== this.lastReboot) {
      this.lastReboot = this.rail.rebootCount
      this.enter(MOOD.awake)
      return
    }

    const low = this.railAvg < LOW_RAIL
    const loud = this.sound > SCARE
    const heardAny = this.sound > WAKE
    const mood = this.moodNow
    const chatter = p[IDX.petChatter]! ** 2
    this.quiet = heardAny || hit ? 0 : this.quiet + dt
    if (mood !== MOOD.asleep) this.hunger += dt

    switch (mood) {
      case MOOD.asleep:
        if (hit || heardAny) this.enter(low ? MOOD.sleepy : MOOD.awake)
        else if (!low && this.rng() < chatter * CHATTER_WAKES * dt)
          this.enter(MOOD.awake)
        break
      case MOOD.sleepy:
        if (loud) this.enter(MOOD.scared)
        else if (hit && !low) this.enter(MOOD.awake)
        else if (this.moodTime > SLEEPY_TO_ASLEEP && (low || this.quiet > 2))
          this.enter(MOOD.asleep)
        break
      case MOOD.scared:
        if (loud || this.hits > HITS_TO_SCARE) this.moodTime = 0
        else if (this.moodTime > SCARED_SECS) this.enter(MOOD.awake)
        break
      default:
        if (loud || this.hits > HITS_TO_SCARE) this.enter(MOOD.scared)
        else if (low) this.enter(MOOD.sleepy)
        else if (hit) {
          if (mood === MOOD.hungry) this.hunger = 0
          if (mood === MOOD.chatty) {
            this.moodTime = 0
            if (!this.speaking) this.pending = PHRASE.laugh
          } else this.enter(MOOD.chatty)
        } else if (this.quiet > QUIET_TO_SLEEPY + CHATTER_STAYS_UP * chatter)
          this.enter(MOOD.sleepy)
        else if (mood === MOOD.chatty && this.moodTime > CHATTY_SECS)
          this.enter(MOOD.awake)
        else if (mood === MOOD.awake && this.hunger > HUNGER_SECS)
          this.enter(MOOD.hungry)
    }

    const rate = p[IDX.petChatter]! * MOOD_TALK[this.moodNow]!
    if (!this.speaking && this.pending < 0 && this.rng() < rate * dt) {
      const list = MOOD_PHRASES[this.moodNow]!
      this.pending = list[(this.rng() * list.length) | 0]!
    }
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const n = io.n
    const dt = n / this.sr
    const rail = this.rail
    const bay = ctx.mod
    this.addrLine =
      hop(p[IDX.petAddrLine]!, PET_ADDR_LINES + 1, bay.read(DEST.petAddrLine)) -
      1
    this.addrFault = hop(
      p[IDX.petAddrFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.petAddrFault),
    )
    this.dataLine =
      hop(p[IDX.petDataLine]!, PET_DATA_LINES + 1, bay.read(DEST.petDataLine)) -
      1
    this.dataFault = hop(
      p[IDX.petDataFault]!,
      FAULT_NAMES.length,
      bay.read(DEST.petDataFault),
    )
    this.hold = p[IDX.petHold]!
    this.kBits = p[IDX.petKBits]!

    const powered = !rail.booting && !rail.dead
    this.think(p, ctx, n, dt)
    if (!powered) {
      if (this.speaking) this.hush()
    } else if (!this.speaking && this.pending >= 0) {
      this.say(this.pending)
      this.blink = BLINK_SECS
    }

    const pitchLane = bay.read(DEST.petPitch)
    const rateLane = bay.read(DEST.petRate)
    const pitch =
      p[IDX.petPitch]! *
      (pitchLane ? octaves(pitchLane[0]!) : 1) *
      MOOD_PITCH[this.moodNow]! *
      rail.pitchFactor
    const clock =
      p[IDX.petRate]! *
      (rateLane ? octaves(rateLane[0]!) : 1) *
      MOOD_RATE[this.moodNow]! *
      rail.clockFactor
    const inc = Math.min((CHIP_HZ * clock) / this.sr, MAX_INC)
    const stretch = 1 / Math.max(pitch, 0.05)

    const running = powered && (this.speaking || this.blink > 0)
    const target = running ? Math.min(rail.v / 0.9, 1) : 0
    const spin = Math.min(dt / MOTOR_SPIN_SECS, 1)
    this.speed = flushDenormal(this.speed + (target - this.speed) * spin)
    if (running)
      rail.reported +=
        MOTOR_RUN_LOAD + MOTOR_INRUSH * Math.max(target - this.speed, 0)
    const moving = this.speed > 1e-3

    if (!this.speaking && !moving && this.held === 0 && this.hpOut === 0) return

    const level = p[IDX.petLevel]!
    const motorLevel = p[IDX.petMotor]! * this.speed
    const amp = rail.latched ? 1 : rail.ampFactor
    const revInc = (MOTOR_HZ * this.speed) / this.sr
    for (let i = 0; i < n; i++) {
      if (this.speaking) {
        this.chipAcc += inc
        while (this.chipAcc >= 1) {
          this.chipAcc -= 1
          this.held = this.chipSample(stretch)
        }
      }
      let x = this.held * SPEECH_GAIN * amp
      if (moving) {
        let click = 0
        this.revPhase += revInc
        if (this.revPhase >= 1) {
          this.revPhase -= 1
          if (++this.revs >= REVS_PER_CLICK) {
            this.revs = 0
            click = 1
          }
        }
        let s = this.hiss
        s ^= s << 13
        s ^= s >>> 17
        s ^= s << 5
        this.hiss = s
        const seg = this.revPhase * 3
        const brush = seg - Math.floor(seg) < 0.3 ? 0.3 : -0.12
        const ring = this.ringC * this.ring1 - this.ringR2 * this.ring2 + click
        this.ring2 = this.ring1
        this.ring1 = flushDenormal(ring)
        x += motorLevel * (brush + (s & 0xff) / 1275 - 0.1 + ring * 0.05)
      }
      const y = x - this.hpIn + 0.995 * this.hpOut
      this.hpIn = x
      this.hpOut = flushDenormal(y)
      const out = y * level
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.hush()
    this.deaf = 0
    this.chipAcc = 0
    this.pulse = 0
    this.hpIn = 0
    this.hpOut = 0
    this.speed = 0
    this.revPhase = 0
    this.revs = 0
    this.ring1 = 0
    this.ring2 = 0
    this.k.fill(0)
    this.kFrom.fill(0)
    this.kTo.fill(0)
    this.addrBus.reset()
    this.dataBus.reset()
  }
}
