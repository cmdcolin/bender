import { asEvent, EVENT, EVENT_KEYS, STEPS } from '../drums.ts'
import { IDX } from '../engine/params.ts'
import { MIC } from './micJacks.ts'
import { DEST } from './modbus.ts'
import { PARTS, ToyRail, type Parts } from './toyRail.ts'

import type { Ctx } from './stage.ts'

// Which supply a machine runs off, as its Supply selector counts them.
export const SUPPLY = { shared: 0, second: 1, bench: 2 } as const
export const SUPPLY_NAMES = ['shared cells', 'second cells', 'bench supply']

export const SUPPLY_KEYS = [
  'chipSupply',
  'drumSupply',
  'fmSupply',
  'pcmSupply',
  'monoSupply',
] as const

// The five machines' faders, any one of which up keeps the supplies running.
// A board with all five down ticks no rail, as it never did.
export const poweredUp = (p: Float32Array) =>
  p[IDX.chipLevel]! > 0 ||
  p[IDX.drumLevel]! > 0 ||
  p[IDX.fmLevel]! > 0 ||
  p[IDX.pcmLevel]! > 0 ||
  p[IDX.monoLevel]! > 0

const onSecond = (p: Float32Array) => {
  for (const k of SUPPLY_KEYS)
    if (Math.round(p[IDX[k]]!) === SUPPLY.second) return true
  return p[IDX.distMix]! > 0 && Math.round(p[IDX.distSupply]!) === SUPPLY.second
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

const EVENT_IDX = EVENT_KEYS.map(k => IDX[k])

// The board's supplies: the shared cells every machine boots on, a second set
// of cells, and a bench supply that never moves. The bench is a rail nobody
// ticks, so it sits at full forever and every machine reads it through the same
// class it reads the cells through.
//
// The toy chip ticks the rail it sits on itself, a sample at a time, because its
// output is that rail's load and the two are worked out against each other.
// Whatever rail it is not on is ticked here at the head of the block, with no
// toy on it, before any machine reads it.
export class Supplies {
  readonly shared: ToyRail
  readonly second: ToyRail
  readonly bench: ToyRail
  private readonly secondParts: Parts = { ...PARTS }
  private ctx: Ctx | null = null
  private starve = 0
  private starveLane: Float32Array | null = null
  private micToRail = false
  private fbToRail = false
  private couple = 0
  private clipHz = 0
  private clipClock = 0
  private starve2 = 0
  private starve2Lane: Float32Array | null = null
  private clip2Hz = 0
  private dropLeft = 0

  constructor(sr: number, shared: ToyRail, seed: number) {
    this.shared = shared
    this.second = new ToyRail(sr, seed ^ 0x2ce11)
    this.bench = new ToyRail(sr, seed ^ 0xbe7c)
  }

  of(choice: number): ToyRail {
    const pick = Math.round(choice)
    return pick === SUPPLY.second
      ? this.second
      : pick === SUPPLY.bench
        ? this.bench
        : this.shared
  }

  begin(n: number, p: Float32Array, ctx: Ctx) {
    this.shared.nextBlock()
    this.second.nextBlock()
    this.bench.nextBlock()
    if (!poweredUp(p)) return
    this.ctx = ctx
    this.stepEvents(n, p, ctx)
    const cluster = p[IDX.faultCluster]!

    this.shared.setBoard(
      p[IDX.chipBattery]!,
      ctx.heat,
      p[IDX.chipLatch],
      cluster,
      p[IDX.chipCap],
    )
    this.shared.setParts({
      lead: p[IDX.chipLeadR]!,
      latchHold: p[IDX.chipLatchHold]!,
      watchdog: p[IDX.chipWatchdog]!,
      clipStarve: p[IDX.chipClipBite]!,
      clipHold: p[IDX.chipClipHold]! / 1000,
      dragPull: p[IDX.chipClipCharge]!,
      dragDrop: p[IDX.chipClipRelease]!,
      decouple: p[IDX.chipDecouple]! / 1000,
    })
    this.starve = p[IDX.chipStarve]!
    this.starveLane = ctx.mod.read(DEST.starve)
    this.micToRail = Math.round(p[IDX.micPatch]!) === MIC.toyRail
    this.fbToRail = ctx.fbDest === 2
    this.couple = p[IDX.couple]!
    this.clipHz = p[IDX.chipClipHz]!
    this.clipClock = p[IDX.chipClipClock]!

    const host = this.of(p[IDX.chipSupply]!)
    if (host !== this.shared)
      for (let i = 0; i < n; i++) this.tick(this.shared, i, 0)

    if (!onSecond(p)) return
    this.second.setBoard(
      p[IDX.cell2Battery]!,
      0,
      p[IDX.cell2Latch],
      cluster,
      p[IDX.cell2Cap],
    )
    this.secondParts.lead = p[IDX.cell2Lead]!
    this.second.setParts(this.secondParts)
    this.starve2 = p[IDX.cell2Starve]!
    this.starve2Lane = ctx.mod.read(DEST.starve2)
    this.clip2Hz = p[IDX.cell2Clip]!
    if (host !== this.second)
      for (let i = 0; i < n; i++) this.tick(this.second, i, 0)
  }

  // The kit's drop and reboot steps, a block behind the strobe: the supplies run
  // ahead of the kit, so last block's steps are the newest they can read.
  private stepEvents(n: number, p: Float32Array, ctx: Ctx) {
    const steps = ctx.trig.drumStep
    for (let i = 0; i < n; i++) {
      const tick = steps[i]!
      if (tick === 0) continue
      const event = asEvent(p[EVENT_IDX[(tick - 1) % STEPS]!]!)
      this.dropLeft = event === EVENT.drop ? ctx.trig.drumStepLen : 0
      if (event === EVENT.reboot) this.shared.trip()
    }
    this.shared.contact = this.dropLeft <= 0
    this.dropLeft -= n
  }

  /** One sample of whichever rail `rail` is, drawing `load` on top of what
      the machines on it drew last block. The bench takes nothing. */
  tick(rail: ToyRail, i: number, load: number) {
    const ctx = this.ctx!
    if (rail === this.shared) {
      const lane = this.starveLane
      const starve = lane ? clamp01(this.starve + lane[i]!) : this.starve
      const extra =
        (this.micToRail ? Math.abs(ctx.mic[i]!) * 2 : 0) +
        (this.fbToRail ? Math.abs(ctx.fb[i]!) * 2 : 0) +
        this.couple * Math.max(ctx.bright[i]!, 0) * 0.5
      rail.tick(load, starve, extra, this.clipHz, this.clipClock)
      ctx.railV[i] = rail.v
    } else if (rail === this.second) {
      const lane = this.starve2Lane
      const starve = lane ? clamp01(this.starve2 + lane[i]!) : this.starve2
      rail.tick(load, starve, 0, this.clip2Hz, 0)
    }
  }

  reset() {
    this.dropLeft = 0
    this.shared.reset()
    this.second.reset()
    this.bench.reset()
  }
}

/** One machine's lead onto the supplies: the rail its selector picks, and
    whether that rail rebooted since the machine last asked. Moving to another
    rail is not a reboot. */
export class SupplyTap {
  rail: ToyRail
  private seen: number
  private readonly supplies: Supplies

  constructor(supplies: Supplies) {
    this.supplies = supplies
    this.rail = supplies.shared
    this.seen = this.rail.rebootCount
  }

  pick(choice: number): ToyRail {
    const rail = this.supplies.of(choice)
    if (rail !== this.rail) {
      this.rail = rail
      this.seen = rail.rebootCount
    }
    return rail
  }

  rebooted(): boolean {
    if (this.rail.rebootCount === this.seen) return false
    this.seen = this.rail.rebootCount
    return true
  }
}
