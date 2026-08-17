import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildChain } from './build'
import { DEST } from './modbus'
import { BLOCK, type StereoBlock } from './stage'
import { Thermal } from './thermal'
import { ToyRail } from './toyRail'
import { Burst } from './util/burst'
import { Chaos, Drunk } from './util/drift'
import { mulberry32 } from './util/rng'

const SR = 48000

const makeIo = (): StereoBlock => ({
  l: new Float32Array(BLOCK),
  r: new Float32Array(BLOCK),
  n: BLOCK,
})

function render(
  overrides: Partial<Controls>,
  seconds: number,
  seed = 1,
): Float32Array {
  const chain = buildChain(SR, seed)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return out
}

const rms = (x: Float32Array) =>
  Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)

// The spread of level across short windows. A board doing the same thing all the
// way through reads low however loud it is; a board that keeps changing its mind
// reads high, which is the difference between a texture and a run of events.
function levelSpread(x: Float32Array, windowS = 0.05): number {
  const w = Math.floor(windowS * SR)
  const levels: number[] = []
  for (let i = 0; i + w <= x.length; i += w) {
    levels.push(rms(x.subarray(i, i + w)))
  }
  const mean = levels.reduce((a, v) => a + v, 0) / levels.length
  if (mean <= 0) return 0
  const varSum = levels.reduce((a, v) => a + (v - mean) ** 2, 0)
  return Math.sqrt(varSum / levels.length) / mean
}

// How much top end is in a window, by one-pole difference.
function hfEnergy(x: Float32Array): number {
  const c = 1 - Math.exp((-2 * Math.PI * 2000) / SR)
  let y = 0
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    y += c * (x[i]! - y)
    sum += (x[i]! - y) ** 2
  }
  return Math.sqrt(sum / x.length)
}

// ── the primitives ───────────────────────────────────────────────────────────

// Clustering has to redistribute faults rather than manufacture them: turn it up
// and the same handful arrive in runs. The measure is the spread of the gaps
// between them against their mean — a flat rate is a Poisson process and sits at
// one; bunches with silences between them read well above it.
test('clustering bunches faults up without making more of them', () => {
  const trial = (cluster: number) => {
    const burst = new Burst(SR, 1.6)
    const rng = mulberry32(4)
    const gaps: number[] = []
    let last = -1
    for (let i = 0; i < 120 * SR; i++) {
      burst.step()
      if (burst.roll(0.7 / SR, cluster, rng)) {
        if (last >= 0) gaps.push(i - last)
        last = i
      }
    }
    const mean = gaps.reduce((a, v) => a + v, 0) / gaps.length
    const sd = Math.sqrt(
      gaps.reduce((a, v) => a + (v - mean) ** 2, 0) / gaps.length,
    )
    return { hits: gaps.length + 1, spread: sd / mean }
  }
  const flat = trial(0)
  const clustered = trial(1)
  expect(flat.hits).toBeGreaterThan(50)
  // Bunching one fault behind another means whole clusters are what the sample
  // counts, so the tally is noisy — but it is the same order of events, not a
  // rate knob in disguise.
  expect(clustered.hits).toBeGreaterThan(flat.hits * 0.5)
  expect(clustered.hits).toBeLessThan(flat.hits * 2)
  expect(flat.spread).toBeLessThan(1.05)
  expect(clustered.spread).toBeGreaterThan(1.6)
})

test('heat climbs under load and falls back slower than it rose', () => {
  const t = new Thermal(SR)
  for (let b = 0; b < (60 * SR) / BLOCK; b++) t.tick(0.8, BLOCK)
  const hot = t.value
  expect(hot).toBeGreaterThan(0.4)

  for (let b = 0; b < (60 * SR) / BLOCK; b++) t.tick(0, BLOCK)
  // A minute of cooling sheds less than the minute of heating put in.
  expect(t.value).toBeGreaterThan(hot * 0.3)
  expect(t.value).toBeLessThan(hot)
})

test('the chaos source never comes round again, and stays in its bounds', () => {
  const chaos = new Chaos()
  const lap = () => {
    const out: number[] = []
    for (let i = 0; i < SR / 2; i++) out.push(chaos.step(2, SR))
    return out
  }
  const first = lap()
  const second = lap()
  for (const v of [...first, ...second]) {
    expect(v).toBeGreaterThanOrEqual(-1)
    expect(v).toBeLessThanOrEqual(1)
  }
  // Two laps of an LFO would be the same lap twice.
  const diff = first.reduce((a, v, i) => a + Math.abs(v - second[i]!), 0)
  expect(diff / first.length).toBeGreaterThan(0.05)
})

// Run fast enough to have crossed its own travel a few times: a walk this slow
// takes minutes to explore, which is the point of it as a control and would be a
// silly thing to sit through in a test.
test('the drunk walk reaches the ends of its travel and stays inside them', () => {
  const drunk = new Drunk()
  const rng = mulberry32(11)
  let lo = 0
  let hi = 0
  for (let i = 0; i < 60 * SR; i++) {
    const v = drunk.step(30, SR, rng)
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  expect(hi).toBeGreaterThan(0.85)
  expect(hi).toBeLessThanOrEqual(1)
  expect(lo).toBeLessThan(-0.85)
  expect(lo).toBeGreaterThanOrEqual(-1)
})

// ── the rail ─────────────────────────────────────────────────────────────────

test('heat takes the rail floor down and the clock with it', () => {
  const cold = new ToyRail(SR)
  const hot = new ToyRail(SR)
  cold.setBoard(0.3, 0)
  hot.setBoard(0.3, 1)
  for (let i = 0; i < SR; i++) {
    cold.tick(0, 0, 0)
    hot.tick(0, 0, 0)
  }
  expect(hot.v).toBeLessThan(cold.v - 0.05)
  expect(hot.clockFactor).toBeLessThan(cold.clockFactor)
})

// The old watchdog tripped at one voltage, held for exactly 70 ms and came back
// to exactly the same place, so a starved chip rebooted on a metronome. That is
// the one thing a dying toy never does.
test('reboots do not arrive on a metronome', () => {
  const rail = new ToyRail(SR)
  rail.setBoard(0)
  const gaps: number[] = []
  let last = 0
  let seen = 0
  for (let i = 0; i < 12 * SR; i++) {
    rail.tick(0.3, 0.6, 0)
    if (rail.rebootCount !== seen) {
      seen = rail.rebootCount
      if (last > 0) gaps.push(i - last)
      last = i
    }
  }
  expect(gaps.length).toBeGreaterThan(10)
  expect(new Set(gaps).size).toBeGreaterThan(gaps.length * 0.7)
})

test('a latched die holds its level instead of fading with the rail', () => {
  const rail = new ToyRail(SR, 3)
  rail.setBoard(0, 0, 1)
  let latchedFor = 0
  let everDeadWhileLatched = false
  for (let i = 0; i < 12 * SR; i++) {
    rail.tick(0.3, 0.6, 0)
    if (rail.latched) {
      latchedFor++
      if (rail.dead) everDeadWhileLatched = true
    }
  }
  expect(latchedFor).toBeGreaterThan(0.5 * SR)
  // A jam is not a dead chip: it is the loudest the thing ever gets.
  expect(everDeadWhileLatched).toBe(false)
})

// ── the board ────────────────────────────────────────────────────────────────

const STARVED: Partial<Controls> = {
  chipLevel: 1,
  chipStarve: 0.75,
  chipAccomp: 0.5,
}

test('latch-up leaves a starving chip louder, not quieter', () => {
  const clean = render(STARVED, 5)
  const jamming = render({ ...STARVED, chipLatch: 1 }, 5)
  expect(rms(jamming)).toBeGreaterThan(rms(clean) * 1.15)
})

// Positive-going crossings per window: the pitch of the tune, near enough, and
// what a rail sagging under its own warmth takes down with it.
const crossings = (x: Float32Array, from: number, to: number) => {
  let n = 0
  for (let i = from * SR + 1; i < to * SR; i++) {
    if (x[i - 1]! <= 0 && x[i]! > 0) n++
  }
  return n
}

// Rendered on a board sagging steadily rather than rebooting, so what is being
// measured is the drift and not the reboot timing. Heat takes about forty seconds
// to climb and two minutes to fall — how far it goes is held by the Thermal and
// ToyRail units above; what this holds is that the board is wired to it, and that
// the two boards start together and come apart as they run.
test('a hot board is not the board that booted', () => {
  const look: Partial<Controls> = {
    chipLevel: 1,
    chipStarve: 0.25,
    chipAccomp: 0.5,
  }
  const hot = render({ ...look, heatAmt: 1 }, 20)
  const cold = render({ ...look, heatAmt: 0 }, 20)
  const early = [hot, cold].map(x => crossings(x, 1, 4))
  const late = [hot, cold].map(x => crossings(x, 17, 20))
  // Barely apart at the start, and the hot one running flat by the end: warming
  // up costs it rail, and the rail is its pitch and its tempo both.
  expect(Math.abs(early[0]! - early[1]!)).toBeLessThan(early[1]! * 0.015)
  expect(late[0]!).toBeLessThan(late[1]! * 0.98)
})

test('clustered faults change when things happen, not whether', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.7,
    brownAmt: 0.5,
    brownRate: 8,
    brownCrackle: 0.4,
    glitchMix: 0.7,
    glitchProb: 0.3,
  }
  const flat = render(look, 10)
  const clustered = render({ ...look, faultCluster: 1 }, 10)
  expect(clustered).not.toEqual(flat)
  // Bursts and silences read as spread; a flat rate averages into a texture.
  expect(levelSpread(clustered)).toBeGreaterThan(levelSpread(flat) * 1.1)
})

test('cross-coupling stops the squeal settling on a level', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.2,
    bendSlot0: 6,
    filtMix: 1,
    filtRes: 1.1,
    filtHz: 500,
    fbAmt: 1.2,
    fbDelayMs: 8,
    brownAmt: 0.3,
  }
  const settled = render(look, 8)
  const hunting = render({ ...look, couple: 0.9 }, 8)
  expect(hunting).not.toEqual(settled)
  const window = (x: Float32Array, at: number) =>
    hfEnergy(x.subarray(at * SR, (at + 1) * SR))
  const spread = (x: Float32Array) => {
    const bands = [3, 4, 5, 6].map(at => window(x, at))
    return Math.max(...bands) / Math.max(Math.min(...bands), 1e-6)
  }
  expect(spread(hunting)).toBeGreaterThan(spread(settled))
})

// The precise claim, and the reason it is a mechanism rather than a modulation:
// with the joint open the stage is not in the path at all, so the board is
// sample-for-sample the board with that slot empty. A dry/wet fade could never
// be — it would land somewhere between the two.
test('dry joints take a bend out of the path rather than turning it down', () => {
  const empty: Partial<Controls> = {
    bendSlot0: 0,
    bendSlot1: 0,
    bendSlot2: 0,
    bendSlot3: 0,
    bendSlot4: 0,
    bendSlot5: 0,
  }
  const look: Partial<Controls> = {
    ...empty,
    chipLevel: 0.8,
    bendSlot0: 2,
    crushMix: 1,
    bits: 2,
    srHz: 4000,
  }
  const clean = render({ ...empty, chipLevel: 0.8 }, 8)
  const solid = render(look, 8)
  const chattering = render({ ...look, jointChatter: 0.8 }, 8)

  // Per block, how far from the clean board it is, over the blocks where the
  // clean board has something to be crushed — a gap between notes matches
  // everything and says nothing. The safety tail carries filter state across
  // blocks, so an open joint gives back the clean board to within the residue of
  // what came before rather than to the last bit.
  const apartByBlock = (x: Float32Array) => {
    const out: number[] = []
    for (let b = 0; b + BLOCK <= x.length; b += BLOCK) {
      let sum = 0
      let signal = 0
      for (let i = b; i < b + BLOCK; i++) {
        sum += Math.abs(x[i]! - clean[i]!)
        signal += Math.abs(clean[i]!)
      }
      if (signal / BLOCK > 0.02) out.push(sum / BLOCK)
    }
    return out
  }
  const solidApart = apartByBlock(solid)
  const chatterApart = apartByBlock(chattering)
  // A crusher soldered in solid is never the clean board. One on a dry joint is
  // two boards taking turns: whole blocks indistinguishable from clean, and whole
  // blocks as far off it as the soldered-in one — which is what a dry/wet fade
  // could never give you, since it would sit between the two the whole time.
  const near = (xs: number[]) => xs.filter(v => v < 1e-4).length
  const far = (xs: number[]) => xs.filter(v => v > 5e-3).length
  expect(near(solidApart)).toBe(0)
  expect(near(chatterApart)).toBeGreaterThan(20)
  expect(far(chatterApart)).toBeGreaterThan(20)
})

test('the relay re-solders the board without moving a setting', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.7,
    bendSlot0: 2,
    bendSlot1: 6,
    bendSlot2: 3,
    crushMix: 0.9,
    filtMix: 0.9,
    filtRes: 1.05,
    distMix: 0.8,
    driveDb: 20,
    fbAmt: 0.4,
  }
  expect(render({ ...look, relayRate: 1 }, 8)).not.toEqual(render(look, 8))
})

test('a wandering crystal keeps the toy off the drum machine', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.8,
    drumLevel: 0.6,
    drumBpm: 120,
  }
  const locked = render(look, 10)
  const wandering = render({ ...look, chipDrift: 0.8 }, 10)
  expect(wandering).not.toEqual(locked)
})

// ── wires ────────────────────────────────────────────────────────────────────

test('the chaos and drunk shapes drive a wire somewhere an LFO cannot', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.6,
    bendSlot0: 6,
    filtMix: 1,
    filtRes: 1,
    filtHz: 600,
    modLfoHz: 1.5,
    mod0Src: 1,
    mod0Dest: DEST.filtHz,
    mod0Depth: 0.8,
  }
  const sine = render(look, 8)
  const chaos = render({ ...look, modLfoShape: 4 }, 8)
  const drunk = render({ ...look, modLfoShape: 5 }, 8)
  expect(chaos).not.toEqual(sine)
  expect(drunk).not.toEqual(sine)
  expect(chaos).not.toEqual(drunk)
})

test('a wire onto the other wire’s depth decides how hard it pushes', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.6,
    bendSlot0: 6,
    filtMix: 1,
    filtRes: 1,
    filtHz: 600,
    modLfoHz: 3,
    mod0Src: 1,
    mod0Dest: DEST.filtHz,
    mod0Depth: 0.5,
    mod1Src: 3,
    mod1Depth: 0.9,
  }
  // Wire 2 parked on a stage is one modulation beside another; wire 2 on wire
  // 1's depth is the two of them making a third thing neither wrote.
  const beside = render({ ...look, mod1Dest: DEST.ringHz }, 8)
  const onDepth = render({ ...look, mod1Dest: DEST.wDepth0 }, 8)
  expect(onDepth).not.toEqual(beside)
})

// ── seeding ──────────────────────────────────────────────────────────────────

test('a board is reproducible from its seed, and a take is a take', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.7,
    chipStarve: 0.5,
    chipLatch: 0.6,
    brownAmt: 0.4,
    brownCrackle: 0.5,
    glitchMix: 0.5,
    faultCluster: 0.7,
    jointChatter: 0.3,
  }
  expect(render(look, 4, 7)).toEqual(render(look, 4, 7))
  expect(render(look, 4, 8)).not.toEqual(render(look, 4, 7))
})
