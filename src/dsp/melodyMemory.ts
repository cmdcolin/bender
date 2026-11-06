import { IDX } from '../engine/params.ts'
import { cardKey, type CardPrefix, type CardSuffix } from '../monoCard.ts'
import {
  asTuneLen,
  asTuneStep,
  decodeTune,
  encodeTune,
  HOLD,
  isNote,
  TUNE_STEPS,
} from '../tune.ts'
import { Bus, cross, drifts } from './bus.ts'
import { SupplyTap, type Supplies } from './supplies.ts'
import { mulberry32, type Rng } from './util/rng.ts'

import type { Ctx } from './stage.ts'
import type { Transport } from './transport.ts'

const NO_STEP = -1000

export const MEMORY_SYNC_MODES = [
  'off',
  'sixteenths',
  'eighths',
  'dotted eighths',
  'quarters',
]
const MEMORY_SYNC_STEPS = [0, 1, 2, 3, 4]

/** The RAM's buses: a step number in, a note word with its accent and slide
    bits out. */
export const MEMORY_ADDR_LINES = Math.log2(TUNE_STEPS)
export const MEMORY_DATA_LINES = 8
export const MEMORY_DATA_NAMES = [
  'off',
  'D0 +1',
  'D1 +2',
  'D2 +4',
  'D3 +8',
  'D4 +16',
  'D5 +32',
  'D6 accent',
  'D7 slide',
]
export const MEMORY_CARRY_NAMES = [
  'off',
  'wraps at 16',
  'wraps at 8',
  'wraps at 4',
  'wraps at 2',
]
export const MEMORY_ROT_NAMES = [
  'off',
  'every 32 bars',
  'every 16 bars',
  'every 8 bars',
  'every 4 bars',
  'every 2 bars',
  'every bar',
  'every half bar',
  'every beat',
  'every step',
]
const MEMORY_ROT_STEPS = [0, 512, 256, 128, 64, 32, 16, 8, 4, 1]

const ACCENT = 1
const SLIDE = 2
const FLAG_SHIFT = 6
/** How often a leaked write lands with one bit wrong. */
const LEAK_DRIFT = 0.06

function memoryIdx(prefix: CardPrefix) {
  const at = (suffix: CardSuffix) => IDX[cardKey(prefix, suffix)]
  return {
    on: at('SeqOn'),
    rate: at('SeqRate'),
    sync: at('SeqSync'),
    len: at('SeqLen'),
    step0: at('SeqStep0'),
    accentLo: at('SeqAccentLo'),
    accentHi: at('SeqAccentHi'),
    slideLo: at('SeqSlideLo'),
    slideHi: at('SeqSlideHi'),
    addrLine: at('SeqAddrLine'),
    addrFault: at('SeqAddrFault'),
    addrCross: at('SeqAddrCross'),
    carry: at('SeqCarry'),
    dataLine: at('SeqDataLine'),
    dataFault: at('SeqDataFault'),
    busCut: at('SeqBusCut'),
    leak: at('SeqLeak'),
    rot: at('SeqRot'),
    supply: at('Supply'),
  }
}

/** Growler's memory and Howler's, and the line on the bus each strikes. */
export const GROWLER_MEMORY = {
  k: memoryIdx('mono'),
  line: 'seq',
  seed: 0x3e11,
} as const
export const HOWLER_MEMORY = {
  k: memoryIdx('lead'),
  line: 'leadSeq',
  seed: 0x4e7d,
} as const
type Memory = typeof GROWLER_MEMORY | typeof HOWLER_MEMORY

const wordOf = (note: number, flags: number) =>
  encodeTune(asTuneStep(note)) | (flags << FLAG_SHIFT)

function popcount(word: number) {
  let n = 0
  for (let w = word; w; w &= w - 1) n++
  return n
}

// The second melody: a 32-step memory with a counter of its own, clocked off the
// toy's supply so it sags and stalls with the rest of the board. Its notes ride
// their own line on the trigger bus, and the control named Plays on decides which
// machine has that line soldered to its key input.
//
// The panel writes the RAM, and the RAM is what plays: a leaking write enable or
// a starved refresh changes the cells and leaves the panel's steps alone, until
// a step is written again or `restore` writes the whole line back.
export class MelodyMemory {
  private pos = 0
  private clock = 1
  private fresh = true
  private stepSamples = 0

  /** Where the counter is standing, for the roll's playhead and the quantizer. */
  at = 0
  /** How far through that step it has got, 0 to 1. */
  get frac() {
    return Math.min(this.clock, 1)
  }
  stepMs = 0

  /** What each cell of the RAM holds: a step, and its accent and slide bits. */
  readonly notes = new Float32Array(TUNE_STEPS)
  readonly flags = new Uint8Array(TUNE_STEPS)
  private readonly seen = new Float32Array(TUNE_STEPS).fill(Number.NaN)
  private readonly seenFlags = new Float32Array(4).fill(Number.NaN)
  private restoring = false

  private addrLine = -1
  private addrFault = 0
  private addrCross = 0
  private carry = 0
  private dataLine = -1
  private dataFault = 0
  private cut = 1
  private leak = 0
  private rotEvery = 0
  private rotOnSteps = false
  private steps = 0

  private read = -1
  private note = 0
  private noteFlags = 0

  private readonly addrBus: Bus
  private readonly dataBus: Bus
  private readonly leakRng: Rng
  private readonly rotRng: Rng

  private readonly sr: number
  private readonly power: SupplyTap
  private readonly transport: Transport
  private readonly k: Memory['k']
  private readonly line: Memory['line']

  constructor(
    sr: number,
    supplies: Supplies,
    transport: Transport,
    memory: Memory = GROWLER_MEMORY,
  ) {
    this.sr = sr
    this.k = memory.k
    this.line = memory.line
    this.power = new SupplyTap(supplies)
    this.transport = transport
    this.addrBus = new Bus(MEMORY_ADDR_LINES, memory.seed ^ 0xadd4)
    this.dataBus = new Bus(MEMORY_DATA_LINES, memory.seed ^ 0xda7a)
    this.leakRng = mulberry32(memory.seed ^ 0x1eac)
    this.rotRng = mulberry32(memory.seed ^ 0x7077)
  }

  /** Steps whose cell no longer holds what the panel wrote, step 0 lowest. */
  get damage() {
    let mask = 0
    for (let s = 0; s < TUNE_STEPS; s++) {
      if (this.notes[s] !== this.seen[s] || this.flags[s] !== this.written(s))
        mask |= 1 << s
    }
    return mask >>> 0
  }

  /** Writes the panel's whole line back into the RAM on the next block. */
  restore() {
    this.restoring = true
  }

  private written(s: number) {
    const bit = 1 << (15 - (s & 15))
    const half = s < 16 ? 0 : 1
    return (
      (this.seenFlags[half]! & bit ? ACCENT : 0) |
      (this.seenFlags[2 + half]! & bit ? SLIDE : 0)
    )
  }

  // A step written on the panel is a whole word written: its note, accent and
  // slide all go back to what the panel says.
  private load(p: Float32Array) {
    const k = this.k
    this.loadFlags(0, p[k.accentLo]!, ACCENT)
    this.loadFlags(1, p[k.accentHi]!, ACCENT)
    this.loadFlags(2, p[k.slideLo]!, SLIDE)
    this.loadFlags(3, p[k.slideHi]!, SLIDE)
    for (let s = 0; s < TUNE_STEPS; s++) {
      const v = p[k.step0 + s]!
      if (this.restoring || v !== this.seen[s]) {
        this.seen[s] = v
        this.notes[s] = v
        this.flags[s] = this.written(s)
      }
    }
    this.restoring = false
  }

  private loadFlags(slot: number, word: number, flag: number) {
    const was = this.seenFlags[slot]!
    if (this.restoring || word !== was) {
      this.seenFlags[slot] = word
      const fresh = this.restoring || Number.isNaN(was)
      const base = (slot & 1) * 16
      for (let b = 0; b < 16; b++) {
        const bit = 1 << (15 - b)
        const on = (word & bit) !== 0
        if (fresh || on !== ((was & bit) !== 0)) {
          const s = base + b
          this.flags[s] = on ? this.flags[s]! | flag : this.flags[s]! & ~flag
        }
      }
    }
  }

  private wire(p: Float32Array) {
    const k = this.k
    this.addrLine = Math.round(p[k.addrLine]!) - 1
    this.addrFault = Math.round(p[k.addrFault]!)
    this.addrCross = Math.round(p[k.addrCross]!)
    this.carry = Math.round(p[k.carry]!)
    this.dataLine = Math.round(p[k.dataLine]!) - 1
    this.dataFault = Math.round(p[k.dataFault]!)
    this.cut = p[k.busCut]!
    this.leak = Math.min(Math.max(p[k.leak]!, 0), 1)
    this.rotEvery = MEMORY_ROT_STEPS[Math.round(p[k.rot]!)] ?? 0
  }

  // Which cell answers for a count. A lookahead reads the wires without moving
  // a floating pin, so it leaves a cut trace where the live read left it.
  private address(count: number, live: boolean) {
    const crossed = cross(count, this.addrCross)
    return this.addrLine < 0 || (!live && drifts(this.addrFault))
      ? crossed
      : this.addrBus.read(crossed, this.addrLine, this.addrFault, this.cut) &
          (TUNE_STEPS - 1)
  }

  private faulted(word: number) {
    return this.dataBus.read(word, this.dataLine, this.dataFault, this.cut)
  }

  private peeked(addr: number) {
    return this.dataLine < 0 || drifts(this.dataFault)
      ? wordOf(this.notes[addr]!, this.flags[addr]!)
      : this.faulted(wordOf(this.notes[addr]!, this.flags[addr]!))
  }

  private peekNote(addr: number) {
    return this.dataLine < 0 || drifts(this.dataFault)
      ? this.notes[addr]!
      : decodeTune(this.peeked(addr))
  }

  private peekFlags(addr: number) {
    return this.dataLine < 0 || drifts(this.dataFault)
      ? this.flags[addr]!
      : this.peeked(addr) >> FLAG_SHIFT
  }

  private store(addr: number, word: number) {
    this.notes[addr] = decodeTune(word)
    this.flags[addr] = (word >> FLAG_SHIFT) & (ACCENT | SLIDE)
  }

  // The write enable glitches as the address moves on, so the word still on
  // the data bus lands in the cell the counter has just named.
  private leakInto(addr: number) {
    if (this.leakRng() < LEAK_DRIFT) {
      const bit = 1 << Math.floor(this.leakRng() * MEMORY_DATA_LINES)
      this.store(addr, wordOf(this.note, this.noteFlags) ^ bit)
    } else {
      this.notes[addr] = this.note
      this.flags[addr] = this.noteFlags
    }
  }

  private fetch(addr: number) {
    if (this.dataLine < 0) {
      this.note = this.notes[addr]!
      this.noteFlags = this.flags[addr]!
    } else {
      const word = this.faulted(wordOf(this.notes[addr]!, this.flags[addr]!))
      this.note = decodeTune(word)
      this.noteFlags = (word >> FLAG_SHIFT) & (ACCENT | SLIDE)
    }
  }

  // A charged cell leaks to nothing, one bit at a time, from wherever in the
  // line the refresh missed: a note sinks by that bit's weight, a rest turns
  // into a note, an accent or a slide drops out.
  private decay(len: number) {
    const rand = this.rotRng
    const start = Math.floor(rand() * len)
    let done = false
    for (let j = 0; j < len && !done; j++) {
      const s = (start + j) % len
      const word = wordOf(this.notes[s]!, this.flags[s]!)
      if (word !== 0) {
        let pick = Math.floor(rand() * popcount(word))
        let bit = 1
        while (!(word & bit) || pick-- > 0) bit <<= 1
        this.store(s, word & ~bit)
        done = true
      }
    }
  }

  private tick(rate: number, len: number): number {
    this.clock += rate / this.sr
    if (this.clock < 1) return NO_STEP
    this.clock -= 1
    return this.advance(rate, len)
  }

  // Steps when the kit's counter steps, so swing, a slipping clock and a
  // cleared counter reach the melody.
  private clocked(at: number, every: number, rate: number, len: number) {
    this.clock = Math.min(this.clock + rate / this.sr, 1)
    if (at === 0 || (at - 1) % every !== 0) return NO_STEP
    this.clock = 0
    return this.advance(rate, len)
  }

  private span(len: number) {
    return this.carry > 0 ? Math.min(len, TUNE_STEPS >> this.carry) : len
  }

  private advance(rate: number, len: number): number {
    const span = this.span(len)
    const was = this.fresh ? -1 : this.read
    this.pos = this.fresh ? 0 : (this.pos + 1) % span
    this.fresh = false
    this.at = this.pos
    this.stepSamples = this.sr / rate
    this.stepMs = 1000 / rate
    const addr = this.address(this.pos, true)
    if (was >= 0 && this.leak > 0 && this.leakRng() < this.leak)
      this.leakInto(addr)
    this.fetch(addr)
    this.read = addr
    if (this.rotOnSteps && ++this.steps % this.rotEvery === 0) this.decay(len)
    return this.note
  }

  // A held step carries the note across, so the span runs to the next note.
  private run(len: number): number {
    const span = this.span(len)
    let n = 1
    for (let k = this.pos + 1; k < span; k++) {
      if (this.peekNote(this.address(k, false)) !== HOLD) break
      n++
    }
    return n
  }

  private slides(run: number) {
    const flags =
      run === 1
        ? this.noteFlags
        : this.peekFlags(this.address(this.pos + run - 1, false))
    return (flags & SLIDE) !== 0
  }

  process(n: number, p: Float32Array, ctx: Ctx) {
    const aged = n / ctx.sr
    this.addrBus.age(aged)
    this.dataBus.age(aged)
    const k = this.k
    this.load(p)
    this.wire(p)
    const rail = this.power.pick(p[k.supply]!)
    if (this.power.rebooted()) {
      this.fresh = true
    }
    const len = asTuneLen(p[k.len]!)
    const kitHz = ctx.trig.kitStepHz
    this.rotOnSteps = this.rotEvery > 0 && kitHz === 0
    if (this.rotEvery > 0 && kitHz > 0) {
      for (let i = 0; i < n; i++) {
        const at = ctx.trig.drumStep[i]!
        if (at > 1 && (at - 1) % this.rotEvery === 0) this.decay(len)
      }
    }
    const every = MEMORY_SYNC_STEPS[Math.round(p[k.sync]!)] ?? 0
    // Synced, the kit is the clock and its run line is the one that counts, so
    // a bassline never needs the toy's song running under it.
    const running =
      p[k.on]! > 0.5 &&
      (every ? this.transport.drums : this.transport.tune) &&
      !rail.booting &&
      !rail.latched &&
      !rail.dead
    if (!running) {
      this.fresh = true
      this.clock = 1
      return
    }
    const rate = every
      ? Math.max(kitHz / every, 0.01)
      : Math.max(p[k.rate]!, 0.01) * rail.clockFactor
    const line = ctx.trig[this.line]
    for (let i = 0; i < n; i++) {
      const step = every
        ? this.clocked(ctx.trig.drumStep[i]!, every, rate, len)
        : this.tick(rate, len)
      if (step === NO_STEP || !isNote(step)) continue
      const run = this.run(len)
      line.struck(
        i,
        step,
        this.stepSamples * run,
        (this.noteFlags & ACCENT) !== 0,
        this.slides(run),
      )
    }
  }

  panic() {
    this.fresh = true
    this.clock = 1
  }
}
