import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { STEPS } from '../../drums'
import { packParams } from '../../engine/params'
import { buildBender } from '../build'
import {
  bin,
  deviation,
  highEnergy,
  lowEnergy,
  makeIo,
  pitchHz,
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
    // The noise transistor alone. What the swap has to be heard against is a
    // snare with nothing low in it — with the tuned networks under it the snare
    // steps already carry a thump, which is the wrong thump to be counting.
    drumSnappy: 1,
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

// Rotate passes the kick, the snare and the hat around between themselves and
// leaves the rest of the board where it was. The whole-kit ring is every voice
// there is, so an open hat — which the three-way one cannot see at all — comes
// out of the cowbell, and 540 Hz is where the cowbell lives.
test('the whole-kit ring reaches the voices the three-way one never did', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.9,
    drumBpm: 120,
    drumKick: 0,
    drumSnare: 0,
    drumHat: 0,
    drumOpen: 0b1000_1000_1000_1000,
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
//
// Metal all the way down, because the transistor is what this is about: the
// hat's own pot decides how much of it the hat is drawing, and up the travel it
// is drawing on the metal bank instead, which shares nothing with anything.
test('a snare and a hat on the same step are one noise source, not two', () => {
  const at: Partial<Controls> = { drumBpm: 60, drumLevel: 0.5, drumMetal: 0 }
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

// A step wired through the kit's dice rather than straight to the trigger line,
// and how many of eight laps of the bar the kick arrived on.
const diceLaps = (drumChance: number) =>
  onsets(soloVoice({ drumKickMaybe: stepMask(2), drumChance, drumBpm: 480 }, 4))
    .length

test('a maybe step plays some laps and not others', () => {
  const laps = diceLaps(0.5)
  expect(laps).toBeGreaterThan(0)
  expect(laps).toBeLessThan(8)
})

test('the ends of Chance are the two certainties', () => {
  expect(diceLaps(0)).toBe(0)
  expect(diceLaps(1)).toBe(8)
})

// The roll comes off the same seeded source the noise transistor draws on, so a
// kit that rolled for steps nobody wired through the dice would move every hat
// on the bar by a sample of hiss. Nothing draws until there is a maybe step
// under the counter, which is why a board written before the kit grew a dice
// renders the samples it always did.
test('a kit with no maybe steps renders the same wherever Chance sits', () => {
  const kit: Partial<Controls> = { chipLevel: 0, drumLevel: 1, drumBpm: 120 }
  const stock = render(kit, 2)
  for (const drumChance of [0, 0.25, 1])
    expect(deviation(render({ ...kit, drumChance }, 2), stock)).toBe(0)
})

test('a maybe step lands on the same laps every time the board is rendered', () => {
  const kit: Partial<Controls> = {
    drumHatMaybe: stepMask(1, 5, 9, 13),
    drumChance: 0.5,
  }
  expect(deviation(soloVoice(kit, 2), soloVoice(kit, 2))).toBe(0)
})

// The accent is a weight rather than a hit, and it stays on its own line: a
// maybe step that comes up lands at whatever the accent row asked for.
test('an accent still weighs a step the dice decided', () => {
  const dice: Partial<Controls> = { drumKickMaybe: stepMask(2), drumChance: 1 }
  const plain = soloVoice(dice)
  const hard = soloVoice({ ...dice, drumAccent: stepMask(2) })
  expect(rms(hard)).toBeGreaterThan(rms(plain) * 1.3)
})

// A row's own length decides which of its steps the counter is standing on, and
// the maybe mask is read at that step like the other one: a three-step row's
// dice come round every three steps, not every sixteen.
test('a maybe step comes round on its own row’s length', () => {
  const dice: Partial<Controls> = { drumKickMaybe: stepMask(2), drumChance: 1 }
  const short = soloVoice({ ...dice, drumKickLen: 3 }, 2)
  const full = soloVoice(dice, 2)
  // Five hits a second against one every sixteen steps: too close together to
  // count as onsets, and loud enough to hear as the difference it is.
  expect(rms(short)).toBeGreaterThan(rms(full) * 1.5)
})

// One hit by hand with the sequencer stopped, so what follows it is the voice
// and nothing else.
const struck = (
  overrides: Partial<Controls>,
  seconds: number,
  gain = 1,
  bits = 1,
) =>
  renderBender(
    {
      chipLevel: 0,
      drumLevel: 1,
      drumKick: 0,
      drumSnare: 0,
      drumHat: 0,
      ...overrides,
    },
    seconds,
    b => b.toyDrum.strike(bits, gain),
  )

const after = (x: Float32Array, secs: number) =>
  x.subarray(Math.round(secs * SR))

// The far side of the feedback knob. Under the crossing the transistor hands
// back less than it took and the kick is a kick; over it the network makes up
// the difference every cycle and there is nothing left to stop it.
test('wound past the crossing a pitched voice stops running down', () => {
  const drum = struck({}, 2)
  const ringing = struck({ drumRing: 0.85 }, 2)
  const note = struck({ drumRing: 1 }, 2)
  expect(rms(after(drum, 1.5))).toBeLessThan(1e-3)
  expect(rms(after(ringing, 1.5))).toBeGreaterThan(10 * rms(after(drum, 1.5)))
  expect(rms(after(note, 1.5))).toBeGreaterThan(rms(after(note, 0.2)) * 0.9)
})

// The two knobs are one part. A network that never drains never gets back under
// the floor, so the thing that latches it is also the thing that locks it out.
test('a latched network is one the trigger line cannot reach again', () => {
  const built = buildBender(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    chipLevel: 0,
    drumLevel: 1,
    drumKick: 0,
    drumSnare: 0,
    drumHat: 0,
    drumRing: 1,
    drumTrigFloor: 1,
  })
  const io = makeIo()
  built.toyDrum.strike(1, 1)
  for (let b = 0; b < 40; b++) built.chain.process(io, p)
  expect(built.toyDrum.takeFired()).toBe(1)
  built.toyDrum.strike(1, 1)
  built.chain.process(io, p)
  expect(built.toyDrum.takeFired()).toBe(0)
})

// The swoop is not drawn on the voice, it is read off it — so how far it swoops
// is how hard the thing was hit, which no envelope shape can say.
test('a harder hit is a higher hit, because the tuning follows the swing', () => {
  const attack = (x: Float32Array) =>
    pitchHz(x.subarray(0, Math.round(0.08 * SR)))
  expect(attack(struck({}, 0.5, 2.5))).toBeGreaterThan(
    attack(struck({}, 0.5)) * 1.2,
  )
})

// The accent is one cap feeding the whole board rather than a flag on a step.
test('a run of accents drains the bus it is drawn from', () => {
  const roll: Partial<Controls> = {
    drumKick: 0b1111_1111_1111_1111,
    drumAccent: 0b1111_1111_1111_1111,
    drumBpm: 200,
  }
  const span = (x: Float32Array, a: number, b: number) =>
    rms(x.subarray(Math.round(a * SR), Math.round(b * SR)))
  const stiff = soloVoice(roll, 1.2)
  const sagging = soloVoice({ ...roll, drumAccentSag: 1 }, 1.2)
  // The first accent of the run finds the cap charged and lands where a stiff
  // bus would have put it. A few steps later there is nothing left to hand out,
  // and the cap is being asked for another one every seventy milliseconds.
  expect(span(sagging, 0.06, 0.14)).toBeCloseTo(span(stiff, 0.06, 0.14), 2)
  expect(rms(sagging)).toBeLessThan(rms(stiff) * 0.9)
  expect(span(stiff, 0.8, 1.2)).toBeGreaterThan(span(stiff, 0.1, 0.3) * 0.9)
})

test('an accent stacking the kit leaves less on the bus for the next one', () => {
  const board: Partial<Controls> = {
    drumBpm: 240,
    drumKick: stepMask(3),
    drumAccent: stepMask(2, 3),
    drumAccentSag: 1,
    drumSnappy: 1,
  }
  const busy: Partial<Controls> = {
    drumSnare: stepMask(2),
    drumHat: stepMask(2),
    drumClap: stepMask(2),
    drumBell: stepMask(2),
  }
  // The kick has a step to itself, one after the step that did the drawing, so
  // what is being read is what the bus had left rather than what the other four
  // put on the step with it.
  const kickAlone = (o: Partial<Controls>) =>
    lowEnergy(
      soloVoice(o, 1).subarray(Math.round(0.25 * SR), Math.round(0.55 * SR)),
      70,
    )
  expect(kickAlone({ ...board, ...busy })).toBeLessThan(kickAlone(board) * 0.9)
  // With the bus stiff there is nothing to share and the kick lands the same.
  const stiff = (o: Partial<Controls>) => kickAlone({ ...o, drumAccentSag: 0 })
  expect(stiff({ ...board, ...busy })).toBeGreaterThan(stiff(board) * 0.95)
})

// Half the snare is a transistor's hiss and half is two tuned networks, and the
// trimmer reaches one of them. Which is what makes it the kit's trimmer rather
// than the kick's.
test('the trimmer reaches the snare that has tone in it and not the one that doesn’t', () => {
  const snare: Partial<Controls> = { drumSnare: stepMask(2), drumBpm: 60 }
  const tone = soloVoice({ ...snare, drumSnappy: 0 }, 1)
  const toneUp = soloVoice({ ...snare, drumSnappy: 0, drumTune: 2 }, 1)
  expect(bin(tone, 185)).toBeGreaterThan(3 * bin(toneUp, 185))
  expect(bin(toneUp, 370)).toBeGreaterThan(3 * bin(tone, 370))
  const hiss = soloVoice({ ...snare, drumSnappy: 1 }, 1)
  expect(soloVoice({ ...snare, drumSnappy: 1, drumTune: 2 }, 1)).toEqual(hiss)
})

// Same charge either way — the one-shot decides where it goes, not how much of
// it there is. Narrow, it arrives as a spike the coupling cap passes as a click
// and the network takes cleanly; wide, it is a shove spread across a good part
// of a cycle, which the cap blocks and the network partly cancels.
test('a narrow one-shot is a click and a wide one is neither', () => {
  const sharp = struck({ drumPulse: 0.05 }, 0.6)
  const wide = struck({ drumPulse: 8 }, 0.6)
  expect(lowEnergy(sharp)).toBeGreaterThan(2 * lowEnergy(wide))
  expect(bin(sharp, 2500)).toBeGreaterThan(4 * bin(wide, 2500))
})

// The cowbell, the two hats and the cymbal are four voices made of one part.
// What follows is the consequences of that being true rather than four voices
// that happen to sound related.

test('one chain sets the whole metal bank, so the trimmer moves all of it', () => {
  const bell: Partial<Controls> = { drumBell: stepMask(2), drumBpm: 60 }
  const stock = soloVoice(bell, 1)
  const wide = soloVoice({ ...bell, drumSpread: 1 }, 1)
  expect(bin(stock, 540)).toBeGreaterThan(4 * bin(wide, 540))
  expect(bin(wide, 638)).toBeGreaterThan(4 * bin(stock, 638))
  // The bank's own chain and nothing else's: the voices off the noise
  // transistor and the voices built on networks are untouched.
  const snare: Partial<Controls> = { drumSnare: stepMask(2), drumBpm: 60 }
  expect(soloVoice({ ...snare, drumSpread: 1 }, 1)).toEqual(soloVoice(snare, 1))
})

// Nothing on the board resets the bank — a trigger opens an amplifier and that
// is all it does. The cowbell is where this is readable, because it is the one
// metal voice with no noise source anywhere near it: two hits a step apart come
// out as two different waveforms only if the oscillators under them went on
// turning while nothing was sounding.
test('the metal bank never stops, so no two hits catch it in the same place', () => {
  const grab = (step: number) => {
    const x = soloVoice({ drumBell: stepMask(step) }, 0.6)
    const at = onsets(x)[0]!
    return x.slice(at, at + Math.round(0.02 * SR))
  }
  const a = grab(2)
  const b = grab(3)
  const apart = Math.sqrt(
    a.reduce((sum, v, i) => sum + (v - b[i]!) ** 2, 0) / a.length,
  )
  expect(apart).toBeGreaterThan(0.3 * rms(a))
})

// The same trimmer test the snare has, on the kit's other two-source voice.
test('the trimmer reaches the hat made of metal and not the one made of hiss', () => {
  const hat: Partial<Controls> = { drumHat: stepMask(2), drumBpm: 60 }
  const hiss = soloVoice({ ...hat, drumMetal: 0 }, 1)
  expect(soloVoice({ ...hat, drumMetal: 0, drumTune: 2 }, 1)).toEqual(hiss)
  const metal = soloVoice({ ...hat, drumMetal: 1 }, 1)
  expect(soloVoice({ ...hat, drumMetal: 1, drumTune: 2 }, 1)).not.toEqual(metal)
})

// Two sources with nothing in common, so the pot between them has to fade on
// power: an amplitude fade would leave the middle of the travel down on both
// ends of it, which is where a hat wants to sit.
test('the pot on the hat crossfades rather than steps', () => {
  const hat: Partial<Controls> = { drumHat: stepMask(2) }
  // The hit rather than the render: a hat is over in a few tens of
  // milliseconds and the silence after it weighs nothing either way.
  const level = (metal: number) => {
    const x = soloVoice({ ...hat, drumMetal: metal }, 1)
    const at = onsets(x)[0]!
    return rms(x.subarray(at, at + Math.round(0.04 * SR)))
  }
  expect(level(1) / level(0)).toBeGreaterThan(0.9)
  expect(level(1) / level(0)).toBeLessThan(1.1)
  expect(level(0.5)).toBeGreaterThan(0.85 * Math.min(level(0), level(1)))
})

test('the cymbal’s tone pot is a tone control and not a second volume', () => {
  const cym: Partial<Controls> = { drumCym: stepMask(2), drumBpm: 60 }
  const dark = soloVoice({ ...cym, drumCymTone: 0 }, 1.5)
  const bright = soloVoice({ ...cym, drumCymTone: 1 }, 1.5)
  expect(rms(bright) / rms(dark)).toBeGreaterThan(0.8)
  expect(rms(bright) / rms(dark)).toBeLessThan(1.25)
  // What moves is where the weight of the band is, which is a ratio and not a
  // level: the wiper takes the same amount of signal off two different taps.
  const tilt = (x: Float32Array) => bin(x, 2500) / bin(x, 8000)
  expect(tilt(dark)).toBeGreaterThan(3 * tilt(bright))
})

test('the open hat and the cymbal are the same bank held open longer', () => {
  const tail = (o: Partial<Controls>) =>
    rms(soloVoice({ ...o, drumBpm: 60 }, 1.6).subarray(Math.round(0.6 * SR)))
  expect(tail({ drumOpen: stepMask(2) })).toBeGreaterThan(
    4 * tail({ drumHat: stepMask(2) }),
  )
  expect(tail({ drumCym: stepMask(2) })).toBeGreaterThan(
    tail({ drumOpen: stepMask(2) }),
  )
})

// One cap under both hats, which is what a hi-hat pedal is. A closed step does
// not silence a ringing open one — it drains what is left of it in a hurry.
test('a hat step is a foot on the pedal rather than a mute', () => {
  const at: Partial<Controls> = {
    drumBpm: 240,
    drumOpen: stepMask(2),
    drumDecay: 3,
  }
  const tail = (x: Float32Array) =>
    rms(x.subarray(Math.round(0.4 * SR), Math.round(0.9 * SR)))
  const open = tail(soloVoice(at, 1))
  const choked = tail(soloVoice({ ...at, drumHat: stepMask(4) }, 1))
  const closedOnly = tail(
    soloVoice({ ...at, drumOpen: 0, drumHat: stepMask(4) }, 1),
  )
  expect(choked).toBeLessThan(open * 0.3)
  // And what is left down there is the closed hat's own tail, not the open
  // hat's: the pedal came down, it did not open again.
  expect(choked).toBeLessThan(closedOnly * 3)
})

// One converter, eight voices, and a chip in front of it that is not fast
// enough to pretend otherwise. It works through whatever is sounding a voice at
// a time and writes the ladder once it has been round them all, so the kit's
// own sample rate is the slot divided into a pass — and a pass is as long as
// the step is busy.
const STACKED: Partial<Controls> = {
  drumKick: stepMask(2),
  drumSnare: stepMask(2),
  drumHat: stepMask(2),
  drumClap: stepMask(2),
  drumTom: stepMask(2),
  drumBell: stepMask(2),
}

test('the converter’s rate is the kit’s business rather than a voice’s', () => {
  const kick: Partial<Controls> = { drumKick: stepMask(2) }
  // Twelve microseconds is well under a sample on its own and three samples
  // with the kit stacked on the step, so the same slot is nothing to one voice
  // and a staircase to six of them.
  expect(soloVoice({ ...kick, drumSlot: 12 }, 1)).toEqual(soloVoice(kick, 1))
  expect(soloVoice({ ...STACKED, drumSlot: 12 }, 1)).not.toEqual(
    soloVoice(STACKED, 1),
  )
})

test('a wide slot is a lid on the kit, not a filter on a voice', () => {
  const stock = highEnergy(soloVoice(STACKED, 1))
  const held = highEnergy(soloVoice({ ...STACKED, drumSlot: 60 }, 1))
  expect(held).toBeLessThan(stock * 0.5)
})

// A slot is a count off the chip's own oscillator, like the tempo and the
// envelopes, so it stretches as the cells go down. Measured against what the
// same board does with the chip keeping up, because flat batteries take the top
// off the kit by themselves and that is not what is being asked about here.
test('a flat kit is a coarse kit', () => {
  const lid = (o: Partial<Controls>) =>
    highEnergy(soloVoice({ ...STACKED, ...o, drumSlot: 25 }, 1)) /
    highEnergy(soloVoice({ ...STACKED, ...o }, 1))
  expect(lid({ chipBattery: 0.75 })).toBeLessThan(lid({}) * 0.95)
})

// The pedal is a resistor across a cap, and a resistor across a cap is a wire
// you can move. What it does anywhere else is what it does across the hats.
test('the choke wire moves, and the hats keep their pedal wherever it goes', () => {
  const at: Partial<Controls> = {
    drumBpm: 240,
    drumCym: stepMask(2),
    drumKick: stepMask(4),
  }
  // Two steps after the kick, in the band the cymbal has to itself: the kick
  // rings on down there for most of a second and none of it is up here.
  const tail = (x: Float32Array) =>
    highEnergy(x.subarray(Math.round(0.4 * SR), Math.round(0.9 * SR)), 2000)
  const free = tail(soloVoice(at, 1))
  const cut = tail(soloVoice({ ...at, drumChoke: 5 }, 1))
  expect(cut).toBeLessThan(free * 0.5)

  // And with the wire soldered somewhere else entirely, a hat step still cuts a
  // ringing open hat: that pair is wired in the metal, not on the panel.
  const hats: Partial<Controls> = {
    drumBpm: 240,
    drumOpen: stepMask(2),
    drumDecay: 3,
    drumChoke: 2,
  }
  const open = tail(soloVoice(hats, 1))
  const pedal = tail(soloVoice({ ...hats, drumHat: stepMask(4) }, 1))
  expect(pedal).toBeLessThan(open * 0.3)
})
