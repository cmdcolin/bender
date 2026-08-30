import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams } from '../../engine/params'
import { FAULT } from '../bus'
import { buildChain } from '../build'
import { BLOCK } from '../stage'
import { ANY_CHOICE } from '../trigbus'
import { SOURCE_TAPS } from '../../engine/params'
import { FM_EFFECT_NAMES } from './fmEffects'
import type { BuiltChain } from '../build'
import {
  bin,
  bursts,
  deviation,
  envelope,
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
import {
  FM_VOICE_NAMES,
  FM_VOICES,
  keyScaleNum,
  kslGain,
  KSR,
  pack,
  REG,
  RHY,
  ROM_PATCH_BYTES,
  ROM_VOICE_NAMES,
  ROM_VOICES,
  scaledRate,
} from './fmVoices'
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

// The bank is put where the panel says it should be by a write the driver sends
// with every patch, the way it clears the test register with every patch — so
// the same wire that can hold the bank shut can hold it open, and the zero
// meaning "no drums" arrives meaning the opposite.
test('a wire under the mode bit can switch the bank on with nobody asking', () => {
  const mode = (o: Partial<Controls>) => {
    let chip: BuiltChain['fmChip'] | undefined
    renderBender({ ...KIT_BOARD, ...o }, 1, built => (chip = built.fmChip))
    return (chip!.rhythmReg() & RHY.on) !== 0
  }
  expect(mode({ fmRhythm: 0 })).toBe(false)
  expect(mode({ fmRhythm: 1 })).toBe(true)
  expect(
    mode({ fmRhythm: 0, fmDataLine: MODE_LINE, fmDataFault: FAULT.supply }),
  ).toBe(true)
  expect(
    mode({ fmRhythm: 1, fmDataLine: MODE_LINE, fmDataFault: FAULT.ground }),
  ).toBe(false)
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

// The bits the register map had no reader for. Six of the eight data wires did
// something on this chip and two barely did, because the flags bytes read five
// of their eight, the volume byte four, and the shape and key bytes five. What
// sits in those gaps on the part is the hardware a patch shares rather than
// owns: one LFO, the key scaling, and which of the die's own instruments a
// channel is playing.

/** A note on the chip's own keys, off its stem so the toy is not in it. */
const fmNote = (o: Partial<Controls>, note: number, seconds = 0.6) =>
  renderStems({ ...FM_ONLY, fmKeyGate: 1, ...o }, seconds, built =>
    built.fmChip.noteOn(note),
  ).stems[FM_TAP]!

const voice = (name: string) => FM_VOICE_NAMES.indexOf(name)

test('key scaling wires the octave into the level', () => {
  // Two octaves of one patch as a ratio against itself, so what is compared is
  // how much each voice gives up on the way up rather than how loud either of
  // them is. The bell's carrier is scaled and the organ's is not.
  const spread = (v: number) =>
    rms(fmNote({ fmVoice: v }, 24)) / rms(fmNote({ fmVoice: v }, 0))
  expect(spread(voice('bell'))).toBeLessThan(0.7 * spread(voice('organ')))
})

test('the scaling table is flat at nothing and steeper by the octave', () => {
  for (let block = 0; block < 8; block++)
    expect(kslGain(0, block, 400), `block ${block}`).toBe(1)
  // Three decibels an octave, which is half the level across two of them.
  expect(kslGain(2, 4, 400) / kslGain(2, 2, 400)).toBeCloseTo(0.5, 2)
  expect(kslGain(3, 5, 400)).toBeLessThan(kslGain(2, 5, 400))
})

test('rate scaling shortens the note at the top of the keyboard', () => {
  // Against itself again: key scaling takes level off the high note too, and a
  // note's tail over its own head is the measurement that does not care.
  const shape = (v: number, note: number) => {
    const x = fmNote({ fmVoice: v }, note)
    return (
      rms(x.subarray(Math.round(0.25 * SR))) /
      rms(x.subarray(0, Math.round(0.05 * SR)))
    )
  }
  const marimba = voice('marimba')
  expect(shape(marimba, 24)).toBeLessThan(0.6 * shape(marimba, 0))
  // A patch without the bit counts the same rate wherever it is played.
  const piano = voice('e.piano')
  expect(shape(piano, 24)).toBeGreaterThan(0.7 * shape(piano, 0))
})

test('the key-scale number is the key register’s low nibble, not a calculation', () => {
  // Block five with the count's top bit set is what the die reads off those
  // four wires, and it reads the same four whether the scaling bit is on or not.
  const key = (5 << 1) | 1
  expect(keyScaleNum(key)).toBe(11)
  expect(scaledRate(4, key, KSR)).toBe(9)
  expect(scaledRate(4, key, 0)).toBe(4)
  // Nothing counts past the end of the table.
  expect(scaledRate(14, 0x0f, KSR)).toBe(15)
})

// Where the level is going up and down, scanned off the envelope rather than
// assumed — the LFO's rate is the question in both tests below, and one of them
// is about it being somewhere other than where it was built to be.
const ENV_STEP = 0.005
const wobble = (x: Float32Array) => {
  const env = envelope(x.subarray(Math.round(0.4 * SR)), ENV_STEP)
  const mean = env.reduce((a, v) => a + v, 0) / env.length
  for (let i = 0; i < env.length; i++) env[i]! -= mean
  let best = 0
  let at = 0
  for (let hz = 1; hz <= 8; hz += 0.05) {
    const v = bin(env, hz * ENV_STEP * SR)
    if (v > best) {
      best = v
      at = hz
    }
  }
  return { hz: at, depth: best / mean }
}

const organ = (o: Partial<Controls>) =>
  fmNote({ fmVoice: voice('organ'), ...o }, 0, 2)

// One switch wires both operators to the LFO, because one LFO serving the whole
// die is one button on the case — and a modulator going up and down is a
// brightness going up and down, which moves the meter the other way from the
// carrier doing the same thing. They very nearly cancel at the rate they are
// both running at, and what is left over is at twice it. So the tremolo is
// measured with the modulator turned off: what remains is the carrier alone.
const tremolo = (o: Partial<Controls>) => organ({ fmLfo: 2, fmBright: 0, ...o })

test('the die’s LFO is a wobble no register asked for', () => {
  const on = wobble(tremolo({}))
  const off = wobble(tremolo({ fmLfo: 0 }))
  expect(on.hz).toBeCloseTo(3.7, 0)
  expect(on.depth).toBeGreaterThan(20 * off.depth)
})

test('the wobble counts off the same divider as everything else', () => {
  // Nothing sets the LFO's rate, so the only thing that can move it is the
  // supply — and a starved board slows the tremolo down with the pitch, the
  // envelopes and the tempo.
  expect(wobble(tremolo({ chipStarve: 0.45 })).hz).toBeLessThan(
    0.8 * wobble(tremolo({})).hz,
  )
})

test('vibrato is the only detune on a chip with no detune register', () => {
  expect(deviation(organ({ fmLfo: 1 }), organ({}))).toBeGreaterThan(0.05)
  // And the button reaches the chip the only way anything does. The wire that
  // carries the bit held low is a button that does nothing at all — the patch
  // arrives without it and the die has no other way to be told.
  const cut = { fmDataLine: 7, fmDataFault: FAULT.ground }
  expect(deviation(organ({ fmLfo: 1, ...cut }), organ(cut))).toBe(0)
})

// The instrument nibble, at the top of the register that also carries how loud
// the channel is. The driver writes zero there with every note it sends,
// because zero means the eight bytes it has just finished sending.
const instOf = (o: Partial<Controls>) => {
  let seen: number[] = []
  renderBender(
    { ...FM_ONLY, fmKeyGate: 1, ...o },
    0.5,
    built => built.fmChip.noteOn(0),
    undefined,
    built => {
      seen = built.fmChip.instRegs()
    },
  )
  return seen
}

test('a wire under the volume register hands a channel the die’s own patch', () => {
  expect(instOf({})).toEqual([0, 0, 0, 0])
  // D7 held high is the top bit of every byte the processor sends, and in this
  // register that bit is half the instrument number.
  const bent = { fmDataLine: 8, fmDataFault: FAULT.supply }
  expect(instOf(bent).some(n => n > 0)).toBe(true)
  expect(rms(fmNote(bent, 0))).toBeGreaterThan(0.005)
})

test('the die holds fifteen patches and the case has buttons for eight', () => {
  expect(ROM_PATCH_BYTES).toHaveLength(15)
  expect(ROM_VOICE_NAMES.slice(0, FM_VOICE_NAMES.length)).toEqual(
    FM_VOICE_NAMES,
  )
  // Seven sounds sitting on the board wired to nothing: no button reaches them
  // and the processor has no reason to name them.
  expect(ROM_VOICE_NAMES.slice(FM_VOICE_NAMES.length)).toHaveLength(7)
  expect(new Set(ROM_PATCH_BYTES.map(b => b.join(','))).size).toBe(15)
  // And none of them is a patch that cannot sound. A carrier that never opens
  // or a modulator attenuated to nothing is an instrument the knife would hand
  // you as silence, which is the one thing this bend is not for.
  for (const v of ROM_VOICES) {
    const bytes = pack(v)
    expect(bytes[REG.modLevel]! & 0x3f, v.name).toBeLessThan(63)
    expect(bytes[REG.carAttack]! >> 4, v.name).toBeGreaterThan(0)
    expect(bytes[REG.carSustain]! & 0x0f, v.name).toBeGreaterThan(0)
  }
})
