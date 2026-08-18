import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { STEPS } from '../../drums'
import { packParams } from '../../engine/params'
import { buildBender } from '../build'
import {
  bin,
  lowEnergy,
  makeIo,
  render,
  renderBender,
  rms,
  SR,
  stepMask,
} from '../testRender'
import { CYCLE } from './toyDrum'

// One voice alone on an empty grid, nothing else in the kit or the chain.
const soloVoice = (overrides: Partial<Controls>, seconds = 0.5) =>
  render(
    {
      chipLevel: 0,
      drumLevel: 1,
      drumBpm: 240,
      drumKick: 0,
      drumSnare: 0,
      drumHat: 0,
      ...overrides,
    },
    seconds,
  )

// A hit is one onset if the voice goes quiet for long enough before it.
function onsets(x: Float32Array): number[] {
  const hits: number[] = []
  let quiet = x.length
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]!) > 0.05) {
      if (quiet > 0.08 * SR) hits.push(i)
      quiet = 0
    } else quiet++
  }
  return hits
}

const VOICE_KEYS = [
  'drumKick',
  'drumSnare',
  'drumHat',
  'drumClap',
  'drumTom',
  'drumBell',
] as const

test('flat batteries drag the drum machine down with the tune', () => {
  // Kick on every fourth step, so the first hit lands one beat in and its
  // arrival time is the tempo — measured off a rail that has been idle, so
  // nothing about how hard the kit sags can move it.
  const kit: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.8,
    drumBpm: 120,
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0,
    drumHat: 0,
  }
  const firstHit = (x: Float32Array) => {
    const peak = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0)
    return x.findIndex(v => Math.abs(v) > peak * 0.3) / SR
  }
  const fresh = firstHit(render(kit, 2))
  const flat = firstHit(render({ ...kit, chipBattery: 0.6 }, 2))
  expect(fresh).toBeCloseTo(0.5, 1)
  expect(flat).toBeGreaterThan(fresh * 1.15)
})

test('every voice in the grid is reachable from its own mask', () => {
  for (const key of VOICE_KEYS) {
    expect(rms(soloVoice({ [key]: stepMask(2) })), key).toBeGreaterThan(0.002)
  }
  expect(rms(soloVoice({}))).toBe(0)
})

test('an accented step hits harder than a plain one', () => {
  const plain = soloVoice({ drumKick: stepMask(2) })
  const hard = soloVoice({ drumKick: stepMask(2), drumAccent: stepMask(2) })
  expect(rms(hard)).toBeGreaterThan(rms(plain) * 1.3)
})

test('swing holds the offbeat back and takes it off the step after', () => {
  // hats on steps 3, 4 and 5, choked short so each hit is its own onset
  const pattern: Partial<Controls> = {
    drumHat: stepMask(2, 3, 4),
    drumBpm: 60,
    drumDecay: 0.3,
  }
  const straight = onsets(soloVoice(pattern, 1.4))
  const swung = onsets(soloVoice({ ...pattern, drumSwing: 0.6 }, 1.4))
  expect(straight).toHaveLength(3)
  expect(swung).toHaveLength(3)
  const gap = (h: number[], i: number) => h[i + 1]! - h[i]!
  // the offbeat is late, so the gap onto it grows and the next one shrinks
  expect(gap(swung, 0)).toBeGreaterThan(gap(straight, 0) * 1.2)
  expect(gap(swung, 1)).toBeLessThan(gap(straight, 1) * 0.85)
  // and the beat after it lands where it always did
  expect(Math.abs(swung[2]! - straight[2]!)).toBeLessThan(0.01 * SR)
})

test('bit depth is the kit’s own DAC: the quiet tail falls off the bottom', () => {
  const hit: Partial<Controls> = { drumTom: stepMask(2), drumBpm: 60 }
  const decayed = (x: Float32Array) =>
    x.subarray(Math.round(0.75 * SR), Math.round(1 * SR))
  const stock = decayed(soloVoice(hit, 1))
  const crushed = decayed(soloVoice({ ...hit, drumBits: 2 }, 1))
  expect(rms(stock)).toBeGreaterThan(0.001)
  expect(rms(crushed)).toBeLessThan(rms(stock) * 0.2)
})

// The whole kit through the converter, loud and quiet parts kept apart: what
// the ladder does is not noise added to the signal, it is an error that depends
// on which bits are set, and the code where every bit changes at once is
// midscale — the zero crossing.
const LOUD = 0.15

function ladderError(bits: number, amt: number) {
  const board: Partial<Controls> = {
    chipLevel: 0,
    drumBpm: 120,
    drumDecay: 1.5,
    drumBits: bits,
  }
  const clean = render(board, 3)
  const bent = render({ ...board, drumLadder: amt }, 3)
  const at = (want: boolean) => {
    let err = 0
    let sig = 0
    for (let i = 0; i < clean.length; i++) {
      const c = clean[i]!
      if (Math.abs(c) > LOUD !== want) continue
      err += (bent[i]! - c) ** 2
      sig += c * c
    }
    return Math.sqrt(err / sig)
  }
  return { loud: at(true), quiet: at(false) }
}

test('an untrimmed ladder lands hardest on whatever is quietest', () => {
  const off = ladderError(7, 0)
  expect(off.loud).toBe(0)
  expect(off.quiet).toBe(0)
  const bad = ladderError(7, 1)
  expect(bad.loud).toBeGreaterThan(0.02)
  expect(bad.quiet).toBeGreaterThan(bad.loud * 3)
})

// The difference between a bad converter and a short word. Quantization error
// falls by half at every rung, so a fourteen-bit kit is a hundred and twenty
// times cleaner than a seven-bit one; the ladder's error is its resistors'
// tolerance, and a longer word buys a longer word's worth of the same
// tolerance. Wind Bit depth up and the grit is still there.
test('a longer word does not buy its way out of the ladder', () => {
  const short = ladderError(7, 1)
  const long = ladderError(14, 1)
  expect(long.loud).toBeGreaterThan(short.loud * 0.25)
  expect(long.quiet).toBeGreaterThan(0.05)
})

test('bridged envelope pins put the kick on the snare steps', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.9,
    drumBpm: 120,
    drumKick: 0b1000_1000_0000_1100,
    drumSnare: 0b0111_0111_1111_0011,
    drumHat: 0,
  }
  const stock = render(look, 2)
  const swapped = render({ ...look, drumCross: 1, drumCrossAmt: 1 }, 2)
  // Steps 9 to 12 are snares with no kick among them, so the bar's own half of
  // the pattern is the control: down there the swap is the only thing that can
  // put a thump on the beat at all.
  const snaresOnly = (x: Float32Array) =>
    x.subarray(Math.round(SR), Math.round(1.5 * SR))
  expect(lowEnergy(snaresOnly(swapped))).toBeGreaterThan(
    10 * lowEnergy(snaresOnly(stock)),
  )
  expect(lowEnergy(swapped)).toBeGreaterThan(1.2 * lowEnergy(stock))
})

// The envelope and the amplifier are two pins. A voice leaning all the way over
// to a neighbour has nothing opening its own amplifier, and running its decay
// inside the output test left it stuck at full for as long as the bridge was
// soldered: silent, then a hit that had been waiting minutes the moment you
// unpatched it — and, until then, a borrowed envelope that never fell.
test('a bridged envelope still falls, so a borrowed hit is a hit and not a drone', () => {
  const bridged: Partial<Controls> = {
    drumKick: stepMask(2, 4, 6),
    drumBpm: 60,
    drumDecay: 0.3,
    drumCross: 1,
    drumCrossAmt: 1,
  }
  // The kick steps drive the snare's amplifier; nothing drives the kick's.
  const out = soloVoice(bridged, 1.8)
  expect(onsets(out)).toHaveLength(3)
})

test('the whole-kit ring reaches the voices the three-way one never did', () => {
  // only kicks in the pattern, so anything the cowbell does came off the ring
  const look: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.9,
    drumBpm: 120,
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0,
    drumHat: 0,
    drumCrossAmt: 1,
  }
  const threeWay = render({ ...look, drumCross: 4 }, 1)
  const wholeKit = render({ ...look, drumCross: 5 }, 1)
  expect(bin(wholeKit, 540)).toBeGreaterThan(4 * bin(threeWay, 540))
})

test('an unbridged kit is the kit it always was', () => {
  const look: Partial<Controls> = { chipLevel: 0, drumLevel: 0.9 }
  expect(render({ ...look, drumCrossAmt: 1 }, 1)).toEqual(render(look, 1))
})

test('the step counter wraps somewhere every pattern length divides', () => {
  for (let len = 1; len <= STEPS; len++) expect(CYCLE % len).toBe(0)
})

test('a short row comes round on its own, against the rest of the bar', () => {
  // One hat on the row's first step, at sixteen steps a second. All sixteen
  // steps is one strike a second; four steps is one every quarter of that.
  const hat: Partial<Controls> = { drumHat: stepMask(0), drumDecay: 0.3 }
  const full = onsets(soloVoice(hat, 1.9))
  const short = onsets(soloVoice({ ...hat, drumHatLen: 4 }, 1.9))
  expect(full).toHaveLength(1)
  expect(short.length).toBeGreaterThanOrEqual(7)
  expect(short[1]! - short[0]!).toBeCloseTo(0.25 * SR, -3)
})

test('a row past its length is a row the sequencer never reaches', () => {
  const kit: Partial<Controls> = { drumHatLen: 4, drumDecay: 0.3 }
  // Step 7 sits outside the four the row plays, so it sounds like the row
  // without it — the contact stays closed for when the row gets its steps back.
  expect(soloVoice({ ...kit, drumHat: stepMask(0, 6) }, 2)).toEqual(
    soloVoice({ ...kit, drumHat: stepMask(0) }, 2),
  )
})

// A pad on a controller, striking the trigger line by hand. The sequencer is
// stopped throughout: the kit answers a finger whether or not the pattern is
// running, the way it answers the mic.
test('a hand can strike the kit with the pattern stopped', () => {
  const stopped: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 1,
    drumKick: 0,
    drumSnare: 0,
    drumHat: 0,
  }
  const silent = renderBender(stopped, 0.3)
  const struck = renderBender(stopped, 0.3, built => built.toyDrum.strike(1, 1))
  expect(rms(silent)).toBeLessThan(1e-4)
  expect(rms(struck)).toBeGreaterThan(0.01)

  // How hard it lands is the pad's, not the pattern's: an accent's worth of
  // weight is louder than a plain step's.
  const soft = renderBender(stopped, 0.3, built => built.toyDrum.strike(1, 0.4))
  expect(rms(soft)).toBeLessThan(rms(struck))
})

test('two pads inside one block fold into one hit of both voices', () => {
  const stopped: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 1,
    drumKick: 0,
    drumSnare: 0,
    drumHat: 0,
  }
  const kick = renderBender(stopped, 0.3, b => b.toyDrum.strike(1, 1))
  const both = renderBender(stopped, 0.3, b => {
    b.toyDrum.strike(1, 1)
    b.toyDrum.strike(1 << 2, 1)
  })
  // The hat is the bright one, so the pair carries what the kick alone does not.
  expect(bin(both, 6000)).toBeGreaterThan(bin(kick, 6000) * 4)
  expect(onsets(both).length).toBe(1)
})

// The grid lights off this report, so a hit that never reaches it is a row that
// stays dark while the kit plays.
test('the kit reports what fired, once each', () => {
  const built = buildBender(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    chipLevel: 0,
    drumLevel: 1,
    drumKick: 0,
    drumSnare: 0,
    drumHat: 0,
  })
  const io = makeIo()
  built.toyDrum.strike(1 | (1 << 2), 1)
  built.chain.process(io, p)
  expect(built.toyDrum.takeFired()).toBe(1 | (1 << 2))
  // Reading takes them: a hit the panel has already lit is one it has seen.
  expect(built.toyDrum.takeFired()).toBe(0)
})

// Where the weight of a hit sits after its peak, in seconds. An exponential
// tail puts it at half the time constant, and it does not care how loud the hit
// was — which is what makes it readable on a rail that is sagging the amplitude
// at the same time as it is dragging the clock.
function tailCentroid(x: Float32Array): number {
  let peak = 0
  let at = 0
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]!) > peak) {
      peak = Math.abs(x[i]!)
      at = i
    }
  }
  let num = 0
  let den = 0
  for (let i = at; i < x.length; i++) {
    const e = x[i]! * x[i]!
    num += (i - at) * e
    den += e
  }
  return den > 0 ? num / den / SR : 0
}

// There is one oscillator in the chip, and the tempo, the pitch and the
// envelopes are all counted off it. Flat cells used to drag two of the three:
// the pattern ran late and low with its tails exactly as long as they were on
// fresh cells, which is a kit whose sequencer and whose envelope counter are
// reading different clocks. There is only the one.
test('flat cells stretch the kit’s tails, not only its tempo', () => {
  const hit: Partial<Controls> = {
    drumHat: stepMask(2),
    drumBpm: 60,
    drumDecay: 8,
  }
  const fresh = tailCentroid(soloVoice(hit, 2))
  const flat = tailCentroid(soloVoice({ ...hit, chipBattery: 0.6 }, 2))
  expect(fresh).toBeGreaterThan(0.02)
  expect(flat).toBeGreaterThan(fresh * 1.08)
})

// How far apart a clap's three bursts came out. They are noise, so what sits
// nine milliseconds apart is where each one starts rather than any one sample:
// rectify, smooth, and take the leading edges that are far enough apart to be
// bursts rather than the hiss crossing a threshold twice.
function burstStarts(x: Float32Array): number[] {
  const a = 1 - Math.exp(-1 / (0.001 * SR))
  let e = 0
  let top = 0
  const env = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) {
    e += a * (Math.abs(x[i]!) - e)
    env[i] = e
    if (e > top) top = e
  }
  const starts: number[] = []
  let from = -1
  for (let i = 0; i <= env.length; i++) {
    const loud = i < env.length && env[i]! > 0.35 * top
    if (loud && from < 0) from = i
    if (!loud && from >= 0) {
      if (i - from > 0.001 * SR) starts.push(from / SR)
      from = -1
    }
  }
  return starts
}

// The clap's nine milliseconds are counted off that same oscillator rather than
// measured against the wall, so a rail that drags the tempo spreads the three
// bursts apart by as much.
test('a sagging rail spreads the clap\u2019s bursts', () => {
  const clap: Partial<Controls> = {
    drumClap: stepMask(2),
    drumBpm: 60,
    // Short enough that each burst is down to a twelfth of itself before the
    // next one lands, which is what makes three of them countable.
    drumDecay: 0.25,
  }
  const span = (x: Float32Array) => {
    const starts = burstStarts(x)
    expect(starts.length).toBeGreaterThanOrEqual(3)
    return starts[2]! - starts[0]!
  }
  const fresh = span(soloVoice(clap, 2))
  const flat = span(soloVoice({ ...clap, chipBattery: 0.6 }, 2))
  expect(fresh).toBeGreaterThan(0.016)
  expect(fresh).toBeLessThan(0.02)
  expect(flat).toBeGreaterThan(fresh * 1.08)
})

// One noise transistor on the board, not three. Two voices hung off it hear the
// same hiss, so a snare and a hat on the same step sum coherently into one crack
// — where three independent sources would sum to their energies and nothing
// more. It is also what makes the hat a high-pass: what it subtracts is the
// filtered version of the sample it is holding, and drawing its own sample left
// it subtracting a number the snare had frozen there whenever it last rang.
test('a snare and a hat on the same step are one noise source, not two', () => {
  const at: Partial<Controls> = { drumBpm: 60, drumLevel: 0.5 }
  const hat = soloVoice({ ...at, drumHat: stepMask(2) }, 1)
  const snare = soloVoice({ ...at, drumSnare: stepMask(2) }, 1)
  const both = soloVoice(
    { ...at, drumHat: stepMask(2), drumSnare: stepMask(2) },
    1,
  )
  // The overlap is what carries it: the hat is gone in a few tens of
  // milliseconds and the snare rings on past it alone.
  const onset = onsets(both)[0]!
  const crack = (x: Float32Array) =>
    x.subarray(onset, onset + Math.round(0.008 * SR))
  const energy = (x: Float32Array) => x.reduce((a, v) => a + v * v, 0)
  expect(energy(crack(both))).toBeGreaterThan(
    1.4 * (energy(crack(hat)) + energy(crack(snare))),
  )
})

// The wires between the step counter and the pattern memory. Nothing here is a
// malfunction: the counter counts, the memory answers, and what comes back is
// the cell the wires named rather than the cell the counter did.
const FAULT_GROUND = 1
const FAULT_SUPPLY = 2
const FAULT_BRIDGE = 3

test('an address line held low plays every step twice', () => {
  // Hats on the even steps, a hit every other tick. A0 stuck low files every
  // odd step on top of the even one below it, so the odd ticks fetch the even
  // steps' hats too and the row comes out at double the rate.
  const hats: Partial<Controls> = {
    drumHat: 0b1010_1010_1010_1010,
    drumBpm: 60,
    drumDecay: 0.3,
  }
  const straight = onsets(soloVoice(hats, 4.2))
  const doubled = onsets(
    soloVoice({ ...hats, drumAddrLine: 1, drumAddrFault: FAULT_GROUND }, 4.2),
  )
  expect(straight).toHaveLength(8)
  expect(doubled).toHaveLength(16)
})

test('an address line held high plays the back half of the bar and never the front', () => {
  // Kick in the front half, cowbell in the back. A3 stuck high adds eight to
  // every step, so the front half is unreachable and the back half plays twice.
  const bar: Partial<Controls> = {
    drumKick: 0b1111_1111_0000_0000,
    drumBell: 0b0000_0000_1111_1111,
    drumBpm: 240,
  }
  const stock = soloVoice(bar, 2)
  const bent = soloVoice(
    { ...bar, drumAddrLine: 4, drumAddrFault: FAULT_SUPPLY },
    2,
  )
  expect(bin(bent, 540)).toBeGreaterThan(1.6 * bin(stock, 540))
  expect(lowEnergy(bent)).toBeLessThan(0.2 * lowEnergy(stock))
})

// The data side is the trigger line itself, which is what separates it from the
// cross-patch: a bit forced high strikes the voice rather than lending it an
// envelope, so the row lights and everything soldered onto the trigger bus
// hears about it.
test('a data line held high strikes a voice the grid has nothing on', () => {
  const empty: Partial<Controls> = { drumBpm: 60, drumDecay: 0.3 }
  const forced = (line: number) =>
    soloVoice(
      { ...empty, drumDataLine: line, drumDataFault: FAULT_SUPPLY },
      2.05,
    )
  const bell = forced(6)
  const kick = forced(1)
  expect(rms(soloVoice(empty, 2.05))).toBe(0)
  expect(onsets(bell)).toHaveLength(8)
  expect(onsets(kick)).toHaveLength(8)
  // One wire each, and a different voice on the far end of it.
  expect(lowEnergy(kick)).toBeGreaterThan(20 * lowEnergy(bell))
})

test('a bridged pair of data lines comes out only where both rows agree', () => {
  // Kick on all four beats, snare on two of them. D0 bridged to D1 pulls each
  // down to what they have in common, so the kick loses the beats the snare has
  // nothing on.
  const pair: Partial<Controls> = {
    drumKick: 0b1000_1000_1000_1000,
    drumSnare: 0b0000_1000_0000_1000,
    drumBpm: 240,
    drumDecay: 0.3,
  }
  const stock = onsets(soloVoice(pair, 2.05))
  const bridged = onsets(
    soloVoice({ ...pair, drumDataLine: 1, drumDataFault: FAULT_BRIDGE }, 2.05),
  )
  expect(stock).toHaveLength(8)
  expect(bridged).toHaveLength(4)
})

test('a bus nobody has cut is the kit it always was', () => {
  const look: Partial<Controls> = { chipLevel: 0, drumLevel: 0.9 }
  expect(
    render({ ...look, drumAddrFault: 3, drumDataFault: 2, drumBusCut: 0.4 }, 1),
  ).toEqual(render(look, 1))
})

// The one-shot behind each voice. A trigger line hammered faster than a voice
// can drain used to strike it every pulse, so the retrigger bend was a tone
// generator at the knob's own rate and nothing else. With a floor under it the
// kit answers at a rate of its own — the one its envelopes set.
test('a trigger floor divides a hammered line down to the kit’s own rate', () => {
  const hammer: Partial<Controls> = {
    drumBpm: 60,
    drumRetrigHz: 300,
    drumDecay: 0.3,
  }
  // Nothing on the grid: a retrigger falls back to the kick, so the hammer is
  // the only thing striking anything.
  const buzz = soloVoice(hammer, 4)
  const quick = soloVoice({ ...hammer, drumTrigFloor: 1 }, 4)
  const slow = soloVoice({ ...hammer, drumTrigFloor: 1, drumDecay: 0.6 }, 4)
  // Every pulse strikes, so it never goes quiet: one onset for four seconds.
  expect(onsets(buzz)).toHaveLength(1)
  expect(rms(buzz)).toBeGreaterThan(0.05)
  // Twice the decay is half the rate, which is Decay setting the pitch of the
  // rattle where Retrigger used to.
  expect(onsets(quick).length).toBeGreaterThan(12)
  expect(onsets(quick).length).toBeGreaterThan(onsets(slow).length * 1.7)
})

// A fold is a discontinuity, and the voices cannot make one: the loudest thing
// any of them does between two samples is a sine at 800 Hz. So the step between
// neighbouring samples, against the level overall, is what says the accumulator
// rolled over rather than that the kit got quieter.
const slew = (x: Float32Array) => {
  let s = 0
  for (let i = 1; i < x.length; i++) s += (x[i]! - x[i - 1]!) ** 2
  return Math.sqrt(s / x.length) / rms(x)
}

test('a wrapping accumulator turns the loud step inside-out', () => {
  const stack: Partial<Controls> = {
    drumLevel: 1,
    drumKick: stepMask(2),
    drumSnare: stepMask(2),
    drumClap: stepMask(2),
    drumTom: stepMask(2),
    drumAccent: stepMask(2),
    drumBpm: 60,
  }
  const peak = (x: Float32Array) =>
    x.reduce((a, v) => Math.max(a, Math.abs(v)), 0)
  const stock = soloVoice(stack, 1.5)
  const wrapped = soloVoice({ ...stack, drumOverflow: 1 }, 1.5)
  // Rolling over is also a ceiling: what wraps cannot leave the box past full
  // scale, where the sum that did not wrap left it to the limiter to catch.
  expect(peak(stock)).toBeGreaterThan(0.8)
  expect(peak(wrapped)).toBeLessThan(0.7 * peak(stock))
  expect(slew(wrapped)).toBeGreaterThan(1.6 * slew(stock))
})
