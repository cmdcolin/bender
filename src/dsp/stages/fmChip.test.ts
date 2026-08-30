import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { FAULT } from '../bus'
import { buildChain } from '../build'
import { BLOCK } from '../stage'
import { ANY_CHOICE } from '../trigbus'
import { SOURCE_TAPS } from '../../engine/params'
import { FM_EFFECT_NAMES } from './fmEffects'
import {
  bin,
  bursts,
  highEnergy,
  lowEnergy,
  makeIo,
  playHeldKey,
  playKeys,
  render,
  renderBender,
  renderStems,
  rms,
  SR,
  tail,
} from '../testRender'
import { FM_VOICE_NAMES, FM_VOICES } from './fmVoices'
import { romIndex } from './roms'

// The toy turned down to nothing, so what comes out is the other chip playing
// the key line the toy brings out.
const FM_ONLY: Partial<Controls> = {
  chipLevel: 0,
  drumLevel: 0,
  fmLevel: 0.8,
  chipTune: romIndex('scale'),
}

/** The key register's own bit, which is the fifth wire on the data bus. */
const KEY_LINE = 5

test('the chip’s key input is soldered onto the toy’s gate line', () => {
  // The toy is turned all the way down, so anything audible here is the other
  // chip playing the demo song off a wire.
  expect(rms(render({ ...FM_ONLY, fmLevel: 0 }, 2))).toBe(0)
  expect(rms(render(FM_ONLY, 2))).toBeGreaterThan(0.02)
})

// And the jumper cut, which is the whole of what the switch does: the tune next
// door goes on playing and this chip stops hearing it.
test('cutting the jumper takes the toy’s gate off the key input', () => {
  expect(rms(render({ ...FM_ONLY, fmKeyGate: 1 }, 2))).toBe(0)
})

// The keys somebody screwed to the chip's own board. They are wired to it and
// to nothing else, so the jumper is none of their business.
test('its own keys play it whichever way the jumper is set', () => {
  for (const fmKeyGate of [0, 1]) {
    const x = renderBender({ ...FM_ONLY, fmKeyGate }, 0.5, built =>
      built.fmChip.noteOn(0),
    )
    expect(rms(x), `jumper ${fmKeyGate}`).toBeGreaterThan(0.02)
  }
})

// A gate carries a level as well as an edge, and its own keys are the same
// wire: what a hand is holding is held, and *Note length* is for everything
// that only ever sends an edge.
test('a hand on its own keys outlasts the length the driver would give it', () => {
  const held = renderBender(
    { ...FM_ONLY, fmVoice: FM_VOICE_NAMES.indexOf('organ'), fmLength: 0.05 },
    1,
    built => built.fmChip.noteOn(0),
  )
  expect(rms(tail(held, 0.2))).toBeGreaterThan(0.02)
})

test('every voice under the buttons is a patch that sounds', () => {
  for (let v = 0; v < FM_VOICES.length; v++) {
    expect(
      rms(render({ ...FM_ONLY, fmVoice: v }, 2)),
      FM_VOICES[v]!.name,
    ).toBeGreaterThan(0.02)
  }
})

// Sideband amplitudes are Bessel functions of the modulation index, so no one
// harmonic climbs with the knob — the second partial is loudest a quarter of the
// way up and gone again by halfway. What climbs is the whole top end together,
// which is why this counts everything above a kilohertz rather than a partial.
const overtones = (w: Float32Array) => {
  const all = rms(w)
  const low = lowEnergy(w, 1000)
  return Math.sqrt(Math.max(all * all - low * low, 0))
}

test('two operators, so the modulator piles harmonics onto the note', () => {
  const at = (fmBright: number) => {
    const x = playKeys(
      { ...FM_ONLY, fmVoice: 0, fmBright, fmLength: 2 },
      chip => chip.noteOn(0),
      0.6,
    )
    return x.subarray(Math.round(0.2 * SR))
  }
  const dull = at(0)
  const bright = at(1)
  expect(bin(dull, 220)).toBeGreaterThan(0.01)
  expect(overtones(bright)).toBeGreaterThan(overtones(dull) * 1.8)
})

// The bend the FM keyboards are known for. A note ends because the processor
// writes one bit of one register back down and the chip sees it change; a wire
// that cannot change is a wire the chip never sees change. Played by hand and
// let go of a third of the way in, so what ends the note is the release write
// and nothing else.
const sustained = (o: Partial<Controls>) =>
  playHeldKey({ ...FM_ONLY, fmVoice: 0, ...o }, 0, 0.3, 2)
const late = (x: Float32Array) => rms(x.subarray(Math.round(1.5 * SR)))

test('a key line that cannot go low is a note that never ends', () => {
  const clean = sustained({})
  expect(rms(clean.subarray(0, Math.round(0.2 * SR)))).toBeGreaterThan(0.05)
  expect(late(clean)).toBeLessThan(0.001)

  const stuck = sustained({
    fmDataLine: KEY_LINE,
    fmDataFault: FAULT.supply,
  })
  expect(late(stuck)).toBeGreaterThan(0.05)
})

test('a key line that cannot go high is a keyboard that never plays', () => {
  const dead = sustained({ fmDataLine: KEY_LINE, fmDataFault: FAULT.ground })
  expect(rms(dead)).toBe(0)
})

// Note length is what a strike gets, because a strike is all a trigger line
// carries. A hand is the one thing on that wire the gate can still see, so the
// processor lets it decide instead — and a sustaining patch rings for as long as
// the finger is down, well past a length it would have used.
test('a key held is a note held, however short Note length is', () => {
  const held = playHeldKey({ ...FM_ONLY, fmVoice: 0, fmLength: 0.2 }, 0, 1.2, 2)
  const under = rms(held.subarray(Math.round(0.8 * SR), Math.round(1.1 * SR)))
  expect(under).toBeGreaterThan(0.05)
  // and it is the finger that ends it: what is left half a second after the key
  // came up is the organ's own release and nothing playing.
  expect(rms(held.subarray(Math.round(1.8 * SR)))).toBeLessThan(under / 20)
})

test('the demo song gets Note length, since nothing is holding those keys', () => {
  const short = rms(render({ ...FM_ONLY, fmVoice: 0, fmLength: 0.05 }, 2))
  const long = rms(render({ ...FM_ONLY, fmVoice: 0, fmLength: 2 }, 2))
  expect(long).toBeGreaterThan(short * 1.5)
})

// Two param sets, swapped halfway, so the second half is the board after the
// knife has been taken off the bus. Rendered rather than described because the
// claim is about what the chip is still doing once nothing is wrong any more.
function afterTheFault(
  during: Partial<Controls>,
  after: Partial<Controls>,
  seconds: number,
) {
  const chain = buildChain(SR)
  const first = packParams({ ...DEFAULT_CONTROLS, ...FM_ONLY, ...during })
  const second = packParams({ ...DEFAULT_CONTROLS, ...FM_ONLY, ...after })
  const io = makeIo()
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const half = Math.floor(blocks / 2)
  const out = new Float32Array((blocks - half) * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, b < half ? first : second)
    if (b >= half) out.set(io.l.subarray(0, BLOCK), (b - half) * BLOCK)
  }
  return out
}

// What no other bend on this board does. A starved rail is a sound that lasts as
// long as your hand is on the knob; a byte that landed wrong in a register is a
// sound that lasts until something writes that register again — and the
// processor only rewrites the patch when a knob it knows about moves.
test('a byte that landed wrong stays landed after the knife comes off', () => {
  const fault = { fmDataLine: 3, fmDataFault: FAULT.supply }
  const clean = afterTheFault({}, {}, 4)
  const scarred = afterTheFault(fault, {}, 4)
  let sum = 0
  for (let i = 0; i < clean.length; i++) sum += (scarred[i]! - clean[i]!) ** 2
  expect(Math.sqrt(sum / clean.length) / rms(clean)).toBeGreaterThan(0.5)
  // and it is not simply still faulted: the notes themselves come back, because
  // frequency and key go out fresh with every note
  const stillCut = afterTheFault(fault, fault, 4)
  expect(rms(scarred)).toBeGreaterThan(rms(stillCut) * 1.5)
})

// A patch is eight bytes and the panel only ever edits one of them on the way
// past, so what the ratio knobs prove is that the edit lands where the part put
// it: four bits of a flags byte, one operator each.
const held = (o: Partial<Controls>) =>
  playKeys(
    { ...FM_ONLY, fmVoice: 0, fmLength: 2, ...o },
    chip => chip.noteOn(0),
    0.6,
  ).subarray(Math.round(0.2 * SR))

test('the carrier’s ratio moves the note, the modulator’s moves the colour', () => {
  const patched = held({})
  // 2× on the carrier is the same patch an octave up: the operator you hear is
  // the one running at the multiple.
  expect(bin(held({ fmCarRatio: 3 }), 440)).toBeGreaterThan(
    bin(patched, 440) * 4,
  )
  // 7× on the modulator does not move the note at all — it puts the sidebands
  // seven harmonics out, which is the whole of how a two-operator chip makes a
  // bell out of two sines.
  const clang = held({ fmModRatio: 8 })
  expect(bin(clang, 220)).toBeGreaterThan(0.01)
  expect(overtones(clang) / rms(clang)).toBeGreaterThan(
    (overtones(patched) / rms(patched)) * 1.3,
  )
})

test('the modulator’s decay is what makes a note struck or blown', () => {
  // The bell patch, whose modulator has somewhere to fall to. Collapse it in
  // four milliseconds and what is left ringing is the carrier on its own.
  const bright = (o: Partial<Controls>) => {
    const w = held({ fmVoice: 3, ...o })
    return overtones(w) / rms(w)
  }
  expect(bright({ fmModDecay: 1 })).toBeLessThan(0.35)
  expect(bright({ fmModDecay: 16 })).toBeGreaterThan(0.8)
})

// The kit's trigger lines, clipped onto the key input beside the keyboard's. A
// trigger line carries a strike and nothing else, so the note is this chip's to
// decide — which is what the test can see, because nothing else is playing 220.
test('the kit strikes the chip, and the note is decided at this end', () => {
  const kit: Partial<Controls> = {
    chipLevel: 0,
    drumLevel: 0.5,
    fmLevel: 0.8,
    chipTune: romIndex('scale'),
  }
  const off = render({ ...kit, fmStruck: 0 }, 2)
  const kick = render({ ...kit, fmStruck: 1 }, 2)
  expect(bin(kick, 220)).toBeGreaterThan(bin(off, 220) * 10)
  expect(rms(kick)).toBeGreaterThan(rms(off))
})

// The other bus on the chip, and the opposite bend. The processor never touches
// this one — the operators read it eight times a sample — so nothing lands in a
// register and nothing outlives the knife.
const WAVE_MIRROR = 9
const WAVE_SIGN = 10

test('cutting the wave ROM’s address changes the wave, not the note', () => {
  const at = (o: Partial<Controls>) =>
    playKeys(
      { ...FM_ONLY, fmVoice: 0, fmLength: 2, ...o },
      chip => chip.noteOn(0),
      0.6,
    ).subarray(Math.round(0.2 * SR))
  const clean = at({})
  // The mirror bit is what turns a quarter of a wave into the second quarter.
  // Held, the quarter simply runs again, so the shape repeats twice in the
  // cycle: the note the chip was told is still 220, and what comes out of it is
  // an octave up with a cliff in it.
  const bent = at({ fmWaveLine: WAVE_MIRROR, fmWaveFault: FAULT.ground })
  expect(bin(clean, 440)).toBeLessThan(bin(clean, 220))
  expect(bin(bent, 440)).toBeGreaterThan(bin(bent, 220) * 2)
})

test('a sine with no sign bit has no fundamental left', () => {
  const at = (o: Partial<Controls>) =>
    playKeys(
      { ...FM_ONLY, fmVoice: 0, fmLength: 2, ...o },
      chip => chip.noteOn(0),
      0.6,
    ).subarray(Math.round(0.2 * SR))
  const clean = at({})
  const flat = at({ fmWaveLine: WAVE_SIGN, fmWaveFault: FAULT.ground })
  // Every read comes back off the top half of the table, which is a rectified
  // wave, and a rectified wave is all octave and no fundamental.
  expect(bin(flat, 220)).toBeLessThan(bin(clean, 220) * 0.05)
  expect(bin(flat, 440)).toBeGreaterThan(bin(clean, 440) * 2)
})

test('the wave bend leaves nothing behind when the knife comes off', () => {
  const clean = afterTheFault({}, {}, 4)
  const after = afterTheFault(
    { fmWaveLine: WAVE_MIRROR, fmWaveFault: FAULT.ground },
    {},
    4,
  )
  let sum = 0
  for (let i = 0; i < clean.length; i++) sum += (after[i]! - clean[i]!) ** 2
  // A data line scars the register file and this does not touch it, so the
  // second half of the render is the board it always was.
  expect(Math.sqrt(sum / clean.length) / rms(clean)).toBeLessThan(0.05)
})

// The register the processor only ever writes zero to. That write is on the same
// eight wires as every other, so a line held high is a bit set in a register
// nothing on the chip was meant to set — and the clear that would undo it goes
// out over the same broken wire.
const RACE_LINE = 2

test('a stuck bit in the test register races every envelope', () => {
  const organ = (o: Partial<Controls>) =>
    playKeys(
      { ...FM_ONLY, fmVoice: 0, fmLength: 2, ...o },
      chip => chip.noteOn(0),
      0.6,
    )
  const held = organ({})
  const raced = organ({ fmDataLine: RACE_LINE, fmDataFault: FAULT.supply })
  const early = (x: Float32Array) => rms(x.subarray(0, Math.round(0.02 * SR)))
  const late = (x: Float32Array) => rms(x.subarray(Math.round(0.3 * SR)))
  // The organ patch holds until the key comes up, and the corruption cannot
  // reach the bit that says so — what ends the note is the envelope counter
  // running at a rate no register asked for.
  expect(late(held) / early(held)).toBeGreaterThan(0.5)
  expect(early(raced)).toBeGreaterThan(0.01)
  expect(late(raced) / early(raced)).toBeLessThan(0.05)
})

test('the chip runs off the toy’s rail, so starving the toy dives it too', () => {
  const hz = (o: Partial<Controls>) => {
    const x = playKeys(
      { ...FM_ONLY, fmVoice: 0, fmLength: 2, ...o },
      chip => chip.noteOn(0),
      0.8,
    )
    const w = x.subarray(Math.round(0.4 * SR))
    return bin(w, 220) > bin(w, 165) ? 220 : 165
  }
  expect(hz({})).toBe(220)
  expect(hz({ chipBattery: 1, chipStarve: 0.35 })).toBe(165)
})

// The percussion bank. Everything the button does it does through the register
// file, so the same wires that carry a patch carry the mode bit and the keys —
// and what the bank is for is that a chip which can only add sines suddenly has
// a bottom octave and a shift register.
const KIT_BOARD: Partial<Controls> = {
  ...FM_ONLY,
  fmRhythm: 1,
  // the gate cut, so only the kit's trigger lines reach the chip
  fmKeyGate: 1,
  fmStruck: ANY_CHOICE,
  drumLevel: 0.5,
  drumBpm: 160,
  drumKick: 0b1000_0010_0000_1000,
  drumSnare: 0b0000_1000_0000_0000,
  drumHat: 0b1010_1010_1010_1010,
}

/** The chip's own stem, so the kit next door is not in the measurement. */
const FM_TAP = SOURCE_TAPS.indexOf('fmChip')
const fmStem = (o: Partial<Controls>) =>
  renderStems({ ...KIT_BOARD, ...o }, 2).stems[FM_TAP]!

test('the bank gives the chip a bottom octave it does not otherwise have', () => {
  const notes = fmStem({ fmRhythm: 0 })
  const kit = fmStem({ drumSnare: 0, drumHat: 0 })
  // Nothing the chip plays as notes reaches down here: the key line hands it
  // 220 Hz and up, and the driver picks the tightest block for every one, so
  // the bass drum's own block is one no note it is ever asked for can reach.
  expect(lowEnergy(notes) / rms(notes)).toBeLessThan(0.25)
  expect(lowEnergy(kit) / rms(kit)).toBeGreaterThan(0.7)
})

test('the two noise slots are the only broadband thing on the chip', () => {
  const notes = fmStem({ fmRhythm: 0 })
  const hat = fmStem({ drumKick: 0, drumSnare: 0 })
  // The hi-hat takes every bit the register puts out; the snare latches one in
  // eight and holds it, so the same generator is sand at one tap and a rattle
  // well under it at the other.
  expect(highEnergy(hat) / rms(hat)).toBeGreaterThan(
    2 * (highEnergy(notes) / rms(notes)),
  )
  const snare = fmStem({ drumKick: 0, drumHat: 0 })
  expect(lowEnergy(snare, 480) / rms(snare)).toBeGreaterThan(
    lowEnergy(hat, 480) / rms(hat),
  )
})

// The mode bit and all three keys cross the data bus in one byte, which is what
// makes the bank worth bending: the button is on the panel and the bit is in
// the register file, and everything between them is wire.
const MODE_LINE = 6
const BASS_LINE = 5

test('a wire under the mode bit is a rhythm button that does nothing', () => {
  const kit = fmStem({})
  const held = fmStem({ fmDataLine: MODE_LINE, fmDataFault: FAULT.ground })
  // The bit cannot rise, so the die never hands the channels over: no bass
  // drum, and the kit's lines come out as notes again — lower ones than they
  // would have, because the same wire is a bit of the frequency on its way past.
  expect(lowEnergy(kit) / rms(kit)).toBeGreaterThan(0.5)
  expect(lowEnergy(held) / rms(held)).toBeLessThan(0.35)
})

test('a wire under a drum key is a drum that never lifts', () => {
  const struck = fmStem({ drumSnare: 0, drumHat: 0 })
  const jammed = fmStem({
    drumSnare: 0,
    drumHat: 0,
    fmDataLine: BASS_LINE,
    fmDataFault: FAULT.supply,
  })
  // Held high the key never falls, so the die never sees the edge that would
  // start the next strike: one bass drum at the top of the run and no more.
  expect(bursts(jammed)).toBeLessThan(bursts(struck))
})

test('an effect and the bank want the same channels, and the effect wins', () => {
  const kit = fmStem({ drumSnare: 0, drumHat: 0 })
  const bird = fmStem({
    drumSnare: 0,
    drumHat: 0,
    fmEffect: FM_EFFECT_NAMES.indexOf('bird'),
  })
  expect(lowEnergy(kit) / rms(kit)).toBeGreaterThan(0.5)
  expect(lowEnergy(bird) / rms(bird)).toBeLessThan(0.2)
})
