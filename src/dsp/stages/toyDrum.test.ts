import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import { STEPS } from '../../drums'
import {
  bin,
  lowEnergy,
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
