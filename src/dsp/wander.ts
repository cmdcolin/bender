import { doubleMask, halveMask, rotate } from '../drum-moves.ts'
import { EVENT, N_DRUM_VOICES, RATCHETS, STEPS, stepBit } from '../drums.ts'
import { FAULT } from './bus.ts'

import type { Rng } from './util/rng.ts'

const KICK = 0
const SNARE = 1
const HAT = 2
const CLAP = 3
const TOM = 4
const CYM = 7
const ALL = (1 << STEPS) - 1
const LAST_BEAT = STEPS - 4
const GHOSTS = [KICK, SNARE, HAT]
const WIRES = [KICK, SNARE, HAT, CLAP, TOM]
const WIRE_FAULTS = [FAULT.ground, FAULT.supply, FAULT.bridge]
const FAULTS = [EVENT.brake, EVENT.freeze, EVENT.cut, EVENT.drop, EVENT.reboot]

export interface Stray {
  name: string
  wild: number
  play: (w: Wander, rand: Rng, amount: number) => void
}

const pick = <T>(xs: readonly T[], rand: Rng): T =>
  xs[Math.floor(rand() * xs.length)]!

const between = (lo: number, hi: number, rand: Rng) =>
  lo + Math.floor(rand() * (hi - lo + 1))

const fromCell = (at: number) => ALL >>> at

const clearFrom = (w: Wander, at: number) => {
  const keep = ~fromCell(at) & ALL
  for (let v = 0; v < N_DRUM_VOICES; v++) {
    w.rows[v]! &= keep
    w.maybes[v]! &= keep
  }
  w.accent &= keep
}

const randomHitVoice = (w: Wander, rand: Rng) => {
  const start = Math.floor(rand() * N_DRUM_VOICES)
  for (let i = 0; i < N_DRUM_VOICES; i++) {
    const v = (start + i) % N_DRUM_VOICES
    if (w.rows[v]) return v
  }
  return -1
}

const randomHit = (mask: number, rand: Rng) => {
  let n = 0
  for (let s = 0; s < STEPS; s++) if (mask & stepBit(s)) n++
  if (n === 0) return -1
  let k = Math.floor(rand() * n)
  for (let s = 0; s < STEPS; s++) if (mask & stepBit(s) && k-- === 0) return s
  return -1
}

const roll = (w: Wander, rand: Rng, columns: number, most: number) => {
  for (let i = 0; i < columns; i++) {
    const col = between(STEPS / 2, STEPS - 1, rand)
    w.ratchets[col] = RATCHETS[between(1, most, rand)]!
  }
}

const throwFault = (w: Wander, rand: Rng, amount: number) => {
  const n = amount > 0.9 ? 5 : amount > 0.7 ? 4 : 3
  const fault = FAULTS[Math.floor(rand() * n)]!
  const run = between(2, 4, rand)
  w.events.fill(fault, STEPS - run, STEPS)
}

export const STRAYS: readonly Stray[] = [
  {
    name: 'ghosts',
    wild: 0,
    play: (w, rand) => {
      for (let i = between(1, 3, rand); i > 0; i--) {
        const bit = stepBit(between(0, STEPS / 2 - 1, rand) * 2 + 1)
        w.rows[pick(GHOSTS, rand)]! |= bit
        w.accent &= ~bit
      }
    },
  },
  {
    name: 'nudge',
    wild: 0,
    play: (w, rand) => {
      for (let i = between(1, 2, rand); i > 0; i--) {
        const v = randomHitVoice(w, rand)
        if (v < 0) return
        const from = randomHit(
          v === KICK ? w.rows[v]! & ~stepBit(0) : w.rows[v]!,
          rand,
        )
        if (from < 0) continue
        const to = (from + (rand() < 0.5 ? 1 : STEPS - 1)) % STEPS
        w.rows[v] = (w.rows[v]! & ~stepBit(from)) | stepBit(to)
      }
    },
  },
  {
    name: 'no kick',
    wild: 0.1,
    play: w => {
      w.rows[KICK] = 0
      w.maybes[KICK] = 0
    },
  },
  {
    name: 'roll',
    wild: 0.15,
    play: (w, rand) => roll(w, rand, between(1, 2, rand), 3),
  },
  {
    name: 'turnaround',
    wild: 0.2,
    play: (w, rand) => {
      const at = rand() < 0.25 ? STEPS / 2 : LAST_BEAT
      const first = w.scratch
      for (let v = 0; v < N_DRUM_VOICES; v++)
        first[v] = w.rows[v]! & ~fromCell(4)
      clearFrom(w, at)
      const zone = fromCell(at)
      const kind = between(0, 3, rand)
      if (kind === 0) w.rows[TOM]! |= zone
      else if (kind === 1) w.rows[SNARE]! |= zone
      else if (kind === 2)
        for (let v = 0; v < N_DRUM_VOICES; v++)
          for (let to = at; to < STEPS; to += 4) w.rows[v]! |= first[v]! >>> to
      else w.rows[SNARE]! |= stepBit(STEPS - 1)
      w.accent |= stepBit(STEPS - 1)
      if (rand() < 0.5) w.rows[CYM]! |= stepBit(0)
    },
  },
  {
    name: 'shift',
    wild: 0.3,
    play: (w, rand) => {
      const by = between(1, 3, rand)
      for (let v = 0; v < N_DRUM_VOICES; v++) {
        w.rows[v] = rotate(w.rows[v]!, w.lens[v]!, by)
        w.maybes[v] = rotate(w.maybes[v]!, w.lens[v]!, by)
      }
    },
  },
  {
    name: 'half',
    wild: 0.4,
    play: w => w.every(halveMask),
  },
  {
    name: 'double',
    wild: 0.45,
    play: w => w.every(doubleMask),
  },
  {
    name: 'fault',
    wild: 0.5,
    play: throwFault,
  },
  {
    name: 'wire',
    wild: 0.6,
    play: (w, rand) => {
      w.wireLine = pick(WIRES, rand)
      w.wireFault = pick(WIRE_FAULTS, rand)
    },
  },
  {
    name: 'swap',
    wild: 0.7,
    play: (w, rand) => {
      const by = between(1, N_DRUM_VOICES - 1, rand)
      const rows = w.scratch
      rows.set(w.rows)
      for (let v = 0; v < N_DRUM_VOICES; v++)
        w.rows[(v + by) % N_DRUM_VOICES] = rows[v]!
    },
  },
  {
    name: 'blast',
    wild: 0.85,
    play: (w, rand, amount) => {
      roll(w, rand, between(4, 8, rand), RATCHETS.length - 1)
      throwFault(w, rand, amount)
    },
  },
]

export const NO_STRAY = -1

export const packStrays = (first: number, second: number) =>
  (first + 1) | ((second + 1) << 4)

export const strayNames = (packed: number) =>
  [(packed & 15) - 1, (packed >> 4) - 1]
    .filter(i => i !== NO_STRAY)
    .map(i => STRAYS[i]!.name)

/** The kit's pattern for one bar, strayed from the grid now and then. */
export class Wander {
  readonly rows = new Uint16Array(N_DRUM_VOICES)
  readonly maybes = new Uint16Array(N_DRUM_VOICES)
  accent = 0
  readonly lens = new Uint8Array(N_DRUM_VOICES).fill(STEPS)
  readonly ratchets = new Uint8Array(STEPS)
  readonly events = new Uint8Array(STEPS)
  readonly scratch = new Uint16Array(N_DRUM_VOICES)
  wireLine = -1
  wireFault = 0
  first = NO_STRAY
  second = NO_STRAY

  private readonly rand: Rng

  constructor(rand: Rng) {
    this.rand = rand
  }

  get straying() {
    return this.first !== NO_STRAY
  }

  every(f: (mask: number) => number) {
    for (let v = 0; v < N_DRUM_VOICES; v++) {
      this.rows[v] = f(this.rows[v]!)
      this.maybes[v] = f(this.maybes[v]!)
    }
    this.accent = f(this.accent)
  }

  get packed() {
    return packStrays(this.first, this.second)
  }

  /** Odds that `bar` strays: higher on the last bar of every four. */
  static odds(amount: number, bar: number) {
    if (amount <= 0) return 0
    return bar % 4 === 3 ? Math.min(0.25 + amount, 1) : amount * 0.5
  }

  /** Decide `bar`. The caller has loaded rows, maybes, accent and lens from the
      grid; a bar that strays rewrites them. */
  plan(amount: number, bar: number) {
    this.reset()
    const a = Math.min(Math.max(amount, 0), 1)
    if (a <= 0 || this.rand() >= Wander.odds(a, bar)) return
    amount = a
    this.first = this.stray(amount)
    if (amount > 0.75 && this.rand() < amount - 0.5)
      this.second = this.stray(amount)
  }

  reset() {
    this.ratchets.fill(0)
    this.events.fill(0)
    this.wireLine = -1
    this.wireFault = 0
    this.first = NO_STRAY
    this.second = NO_STRAY
  }

  private stray(amount: number) {
    let eligible = 0
    for (const s of STRAYS) if (s.wild <= amount + 0.1) eligible++
    const i = Math.floor(this.rand() * eligible)
    STRAYS[i]!.play(this, this.rand, amount)
    return i
  }
}
