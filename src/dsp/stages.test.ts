import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { packParams } from '../engine/params'
import { buildBender, buildChain, type BuiltChain } from './build'
import { DEST } from './modbus'
import { ToyRail } from './toyRail'
import { BLOCK, type StereoBlock } from './stage'

function makeIo(): StereoBlock {
  return { l: new Float32Array(BLOCK), r: new Float32Array(BLOCK), n: BLOCK }
}

const SR = 48000

function rms(x: Float32Array): number {
  return Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length)
}

// Positive-going crossings per second — the pitch of anything roughly periodic.
function pitchHz(x: Float32Array): number {
  let cycles = 0
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1]! <= 0 && x[i]! > 0) cycles++
  }
  return (cycles * SR) / x.length
}

// How much of one frequency is in there, by correlation — enough to tell a
// harmonic apart from the note that made it.
function bin(x: Float32Array, hz: number): number {
  let re = 0
  let im = 0
  for (let i = 0; i < x.length; i++) {
    const w = (2 * Math.PI * hz * i) / SR
    re += x[i]! * Math.cos(w)
    im += x[i]! * Math.sin(w)
  }
  return Math.hypot(re, im) / x.length
}

// Peak over rms: a clean sine sits at √2 and clipping flattens it toward 1.
function crest(x: Float32Array): number {
  return x.reduce((a, v) => Math.max(a, Math.abs(v)), 0) / rms(x)
}

function sine(hz: number, seconds: number, amp = 0.6): Float32Array {
  const buf = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < buf.length; i++)
    buf[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR)
  return buf
}

// Cases that need the sampler, the mic or a stopped transport render through
// the built bender rather than the bare chain.
function renderBender(
  overrides: Partial<Controls>,
  seconds: number,
  setup?: (built: BuiltChain) => void,
  micFill?: (mic: Float32Array, offset: number) => void,
): Float32Array {
  const built = buildBender(SR)
  setup?.(built)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const mic = new Float32Array(BLOCK)
  const blocks = Math.ceil((seconds * SR) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    micFill?.(mic, b * BLOCK)
    built.chain.process(io, p, micFill ? mic : undefined)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return out
}

const tail = (x: Float32Array, seconds = 0.5) =>
  x.subarray(x.length - seconds * SR)

// How much of the signal sits down where the kick lives.
function lowEnergy(x: Float32Array, hz = 120): number {
  const c = 1 - Math.exp((-2 * Math.PI * hz) / SR)
  let y = 0
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    y += c * (x[i]! - y)
    sum += y * y
  }
  return Math.sqrt(sum / x.length)
}

// Play the keyboard with the ROM sequencer stopped, so only the keys sound.
const playKeys = (
  overrides: Partial<Controls>,
  script: (chip: BuiltChain['toyChip']) => void,
  seconds = 0.5,
) => renderBender(overrides, seconds, built => script(built.toyChip))

function render(overrides: Partial<Controls>, seconds = 0.5): Float32Array {
  const sr = 48000
  const chain = buildChain(sr)
  const p = packParams({ ...DEFAULT_CONTROLS, ...overrides })
  const io = makeIo()
  const blocks = Math.ceil((seconds * sr) / BLOCK)
  const out = new Float32Array(blocks * BLOCK)
  for (let b = 0; b < blocks; b++) {
    chain.process(io, p)
    out.set(io.l.subarray(0, BLOCK), b * BLOCK)
  }
  return out
}

test('default board makes sound (the toy chip demo tune)', () => {
  const out = render({}, 1)
  const rms = Math.sqrt(out.reduce((a, x) => a + x * x, 0) / out.length)
  expect(rms).toBeGreaterThan(0.005)
})

test('all-mixes-zero equals no bends: same output with slots emptied', () => {
  const base: Partial<Controls> = { chipLevel: 0.5 }
  const a = render(base)
  const b = render({
    ...base,
    bendSlot0: 0,
    bendSlot1: 0,
    bendSlot2: 0,
    bendSlot3: 0,
    bendSlot4: 0,
  })
  expect(a).toEqual(b)
})

test('deterministic: same params render bit-identically twice', () => {
  const look: Partial<Controls> = {
    chipStarve: 0.8,
    drumLevel: 0.7,
    drumRetrigHz: 90,
    crushMix: 0.7,
    bits: 4,
    glitchMix: 0.6,
    dlyMix: 0.4,
    fbAmt: 1.1,
  }
  expect(render(look, 1)).toEqual(render(look, 1))
})

test('starve reboots restart the tune', () => {
  const sr = 48000
  const chain = buildChain(sr)
  const p = packParams({ ...DEFAULT_CONTROLS, chipLevel: 1, chipStarve: 1 })
  const io = makeIo()
  let sawSilentBoot = false
  let sawSound = false
  for (let b = 0; b < Math.ceil((3 * sr) / BLOCK); b++) {
    chain.process(io, p)
    // the safety tail's dc blocker leaves a decaying residue, so "silent"
    // means below anything audible rather than exactly zero
    const peak = Math.max(...io.l.subarray(0, BLOCK).map(Math.abs))
    if (peak < 1e-9) sawSilentBoot = true
    else sawSound = true
  }
  expect(sawSound).toBe(true)
  expect(sawSilentBoot).toBe(true)
})

test('runaway delay feedback stays bounded and audible', () => {
  const out = render(
    { chipLevel: 0.6, dlyMix: 0.6, dlyFb: 1.5, delayMs: 80 },
    3,
  )
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.01)
  expect(Math.max(...tail.map(Math.abs))).toBeLessThanOrEqual(0.891 + 1e-6)
})

test('screech filter self-oscillates past unity resonance', () => {
  const out = render(
    {
      chipLevel: 0,
      crackleAmp: 0.4,
      crackleRate: 20,
      bendSlot0: 6,
      filtMix: 1,
      filtRes: 1.25,
      filtHz: 400,
    },
    2,
  )
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.02)
})

test('feedback patched into the delay still loops', () => {
  const out = render(
    {
      chipLevel: 0.5,
      fbAmt: 1.3,
      fbDest: 3,
      dlyMix: 0.8,
      delayMs: 150,
      dlyFb: 0.7,
    },
    2,
  )
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.01)
})

test('the auto bass-chord puts a bass under the tune', () => {
  // four poles at 160 Hz, steep enough to leave the melody's 220 Hz behind and
  // pass the accompaniment's bass an octave under it
  const lowEnd = (x: Float32Array) => {
    const a = Math.exp((-2 * Math.PI * 160) / SR)
    const z = [0, 0, 0, 0]
    const lp = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      let v = x[i]!
      for (let k = 0; k < z.length; k++) v = z[k] = z[k]! * a + v * (1 - a)
      lp[i] = v
    }
    return rms(lp)
  }
  const dry = render({ chipLevel: 0.6 }, 3)
  const backed = render({ chipLevel: 0.6, chipAccomp: 0.8 }, 3)
  expect(rms(backed)).toBeGreaterThan(rms(dry))
  expect(lowEnd(backed)).toBeGreaterThan(lowEnd(dry) * 2)
})

test('the accompaniment browns out with the chip it runs on', () => {
  // it is the same divider on the same rail, so a starved chip takes it down too
  const quietFraction = (x: Float32Array) =>
    x.reduce((a, v) => a + (Math.abs(v) < 0.01 ? 1 : 0), 0) / x.length
  const running = render({ chipLevel: 1, chipAccomp: 1 }, 3)
  const starved = render({ chipLevel: 1, chipAccomp: 1, chipStarve: 1 }, 3)
  expect(quietFraction(starved)).toBeGreaterThan(quietFraction(running) * 2)
  expect(
    starved.reduce((a, v) => Math.max(a, Math.abs(v)), 0),
  ).toBeLessThanOrEqual(0.891 + 1e-6)
})

test('a chord sounds fuller than one note but nothing like four times louder', () => {
  const one = rms(playKeys({}, chip => chip.noteOn(0)))
  const four = rms(
    playKeys({}, chip => {
      for (const n of [0, 4, 7, 12]) chip.noteOn(n)
    }),
  )
  expect(four).toBeGreaterThan(one * 1.3)
  expect(four).toBeLessThan(one * 2.5)
})

test('a fifth note steals the oldest voice', () => {
  // Both takes end with the player holding only note 0. In the second, note 0's
  // voice went to the fifth note, so every voice is released and rings out.
  const script = (extra: number[]) => (chip: BuiltChain['toyChip']) => {
    for (const n of [0, 4, 7, 12, ...extra]) chip.noteOn(n)
    for (const n of [4, 7, 12, ...extra]) chip.noteOff(n)
  }
  const held = rms(tail(playKeys({}, script([]), 2), 0.1))
  const stolen = rms(tail(playKeys({}, script([16]), 2), 0.1))
  expect(held).toBeGreaterThan(0.05)
  expect(stolen).toBeLessThan(held * 0.1)
})

test('a starving rail collapses the voices raggedly, not in lockstep', () => {
  const rail = new ToyRail(SR)
  rail.v = 0.45
  const amps = [0.86, 1.21].map(t => rail.ampFactorAt(t))
  const pitches = [0.86, 1.21].map(t => rail.pitchFactorAt(t))
  expect(amps[0]).toBeGreaterThan(amps[1]! + 0.05)
  expect(pitches[0]).toBeGreaterThan(pitches[1]! + 0.02)

  rail.v = 1
  // Part tolerance only shows up as the supply sags; a full rail tunes true.
  expect(rail.pitchFactorAt(0.86)).toBeCloseTo(1)
  expect(rail.pitchFactorAt(1.21)).toBeCloseTo(1)
})

test('flat cells hold the rail under full and take the clock down with it', () => {
  const rail = new ToyRail(SR)
  rail.setBattery(0.8)
  for (let i = 0; i < SR; i++) rail.tick(0, 0, 0)
  expect(rail.v).toBeCloseTo(1 - 0.45 * 0.8, 2)
  expect(rail.pitchFactor).toBeLessThan(0.9)
  expect(rail.clockFactor).toBeLessThan(0.9)

  // Nothing flat, nothing drawing: the rail sits at full and keeps time.
  const fresh = new ToyRail(SR)
  fresh.setBattery(0)
  for (let i = 0; i < SR; i++) fresh.tick(0.2, 0, 0)
  expect(fresh.v).toBe(1)
  expect(fresh.clockFactor).toBe(1)
  expect(fresh.dead).toBe(false)
})

test('a flat battery sags under load, and reboots the chip on its own', () => {
  const quiet = new ToyRail(SR)
  const loud = new ToyRail(SR)
  for (const rail of [quiet, loud]) rail.setBattery(1)
  for (let i = 0; i < SR; i++) {
    quiet.tick(0.02, 0, 0)
    loud.tick(0.15, 0, 0)
  }
  expect(loud.v).toBeLessThan(quiet.v - 0.1)

  // No starve anywhere — the cells alone take it past the watchdog threshold.
  const hammered = new ToyRail(SR)
  hammered.setBattery(1)
  for (let i = 0; i < SR; i++) hammered.tick(0.4, 0, 0)
  expect(hammered.rebootCount).toBeGreaterThan(0)
})

test('flat batteries run the tune low, and it keeps running', () => {
  const fresh = render({ chipLevel: 1 }, 3)
  const flat = render({ chipLevel: 1, chipBattery: 0.5 }, 3)
  expect(pitchHz(flat)).toBeLessThan(pitchHz(fresh) * 0.9)
  // Half-dead cells drop the pitch; they don't stop the toy playing.
  expect(rms(flat)).toBeGreaterThan(rms(fresh) * 0.5)
})

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

test('narrow tone taps thin out and survive the divider running out of counts', () => {
  const square = rms(playKeys({ chipTone: 0 }, chip => chip.noteOn(0)))
  const buzz = rms(playKeys({ chipTone: 3 }, chip => chip.noteOn(0)))
  expect(buzz).toBeGreaterThan(0.01)
  expect(buzz).toBeLessThan(square * 0.8)

  // Clocked up past where a 1/16 tap fits between samples, it still sounds.
  const fast = rms(
    playKeys({ chipTone: 3, chipClockX: 16 }, chip => chip.noteOn(12)),
  )
  expect(fast).toBeGreaterThan(0.01)
})

test('no-input feedback bus self-oscillates from nothing', () => {
  const out = render(
    { chipLevel: 0, fbAmt: 1.4, fbDelayMs: 2, crackleAmp: 0.2 },
    2,
  )
  const tail = out.subarray(out.length - 4800)
  const rms = Math.sqrt(tail.reduce((a, x) => a + x * x, 0) / tail.length)
  expect(rms).toBeGreaterThan(0.01)
})

test('a wire soldered to nothing changes nothing', () => {
  const base: Partial<Controls> = { chipLevel: 0.6, filtMix: 1, filtRes: 1.1 }
  const a = render(base, 1)
  const b = render({ ...base, mod0Depth: 1, bodyX: 0.8, modLfoHz: 6 }, 1)
  expect(a).toEqual(b)
})

test('the body pad moves the filter once a wire lands on it', () => {
  const base: Partial<Controls> = {
    chipLevel: 0.6,
    bendSlot0: 6,
    filtMix: 1,
    filtRes: 1.1,
    filtHz: 500,
    bodyX: 0.9,
    mod0Dest: 0,
    mod0Depth: 1,
  }
  const unwired = render(base, 1)
  const wired = render({ ...base, mod0Src: 5 }, 1)
  expect(wired).not.toEqual(unwired)
  expect(pitchHz(tail(wired))).toBeGreaterThan(pitchHz(tail(unwired)))
})

test('the frequency shifter moves a sine by its shift, both ways', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    bendSlot0: 7,
    shiftMix: 1,
    shiftHz: 300,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 1))
  const up = renderBender({ ...look, shiftDir: 0 }, 1, load)
  const down = renderBender({ ...look, shiftDir: 1 }, 1, load)
  expect(pitchHz(tail(up))).toBeCloseTo(800, -2)
  expect(pitchHz(tail(down))).toBeCloseTo(200, -2)
})

test('the tape brake drags everything already on the tape down in pitch', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))
  const free = renderBender(look, 2, load)
  const braked = renderBender({ ...look, tapeBrake: 0.5 }, 2, load)
  expect(pitchHz(tail(free))).toBeCloseTo(400, -2)
  expect(pitchHz(tail(braked))).toBeLessThan(0.85 * pitchHz(tail(free)))
})

test('a sagging supply drags the tape motor with it', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    dlyMix: 1,
    delayMs: 200,
    dlyFb: 0,
    brownAmt: 1,
    brownRate: 0,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(400, 1))
  const free = renderBender(look, 2, load)
  const dragged = renderBender({ ...look, tapeMotorRail: 1 }, 2, load)
  expect(pitchHz(tail(dragged))).toBeLessThan(0.9 * pitchHz(tail(free)))
})

// A 400 Hz sine on the sampler, so what comes back out of the pedal is only
// what the pedal made of it.
const throughPedal = (overrides: Partial<Controls>, amp = 0.4) =>
  renderBender({ chipLevel: 0, sampleLevel: 1, ...overrides }, 1, b =>
    b.sampler.setBuffer(sine(400, 1, amp)),
  )

test('the stompbox is off the board until its mix comes up', () => {
  const base: Partial<Controls> = { chipLevel: 0.6 }
  const a = render(base, 1)
  const b = render({ ...base, stompDrive: 60, stompSag: 1, stompCircuit: 2 }, 1)
  expect(a).toEqual(b)
})

test('drive flattens the wave — and the tone knob keeps the top off', () => {
  const clean = throughPedal({})
  const dirty = throughPedal({ stompCircuit: 1, stompDrive: 34, stompMix: 1 })
  expect(crest(tail(clean))).toBeGreaterThan(1.35)
  expect(crest(tail(dirty))).toBeLessThan(1.15)
  const dark = throughPedal({
    stompCircuit: 1,
    stompDrive: 34,
    stompTone: 0,
    stompMix: 1,
  })
  expect(bin(tail(dark), 2000)).toBeLessThan(bin(tail(dirty), 2000) * 0.5)
})

test('the octave circuit puts the octave on top, the screamer does not', () => {
  const oct = tail(
    throughPedal({ stompCircuit: 4, stompDrive: 30, stompMix: 1 }),
  )
  expect(bin(oct, 800)).toBeGreaterThan(bin(oct, 400) * 2)
  // symmetric clipping makes odd harmonics, so a screamer leaves 400 on top
  const ts = tail(
    throughPedal({ stompCircuit: 0, stompDrive: 30, stompMix: 1 }),
  )
  expect(bin(ts, 400)).toBeGreaterThan(bin(ts, 800) * 2)
})

test('a flat battery sags the pedal, and the board’s own supply drags it too', () => {
  const fresh = throughPedal({ stompCircuit: 2, stompDrive: 30, stompMix: 1 })
  const flat = throughPedal({
    stompCircuit: 2,
    stompDrive: 30,
    stompSag: 1,
    stompMix: 1,
  })
  expect(rms(tail(flat))).toBeLessThan(rms(tail(fresh)) * 0.6)
  // same battery, but this time it is the master brownout pulling it down
  const browned = throughPedal({
    stompCircuit: 2,
    stompDrive: 30,
    stompSag: 1,
    stompMix: 1,
    brownAmt: 1,
    brownRate: 0,
  })
  expect(rms(tail(browned))).toBeLessThan(rms(tail(flat)))
})

test('bias shuts the gate circuit, and a flat battery sets it howling', () => {
  const box: Partial<Controls> = {
    stompCircuit: 5,
    stompDrive: 40,
    stompMix: 1,
  }
  // a note well under where the bias walks the gate to
  const through = rms(tail(throughPedal(box, 0.08)))
  const shut = rms(tail(throughPedal({ ...box, stompBias: 0.8 }, 0.08)))
  expect(through).toBeGreaterThan(0.05)
  expect(shut).toBeLessThan(through * 0.1)

  // nothing at the input at all, and it still finds something to say
  expect(rms(tail(render({ chipLevel: 0, ...box }, 2)))).toBeLessThan(1e-4)
  expect(
    rms(tail(render({ chipLevel: 0, ...box, stompSag: 0.9 }, 2))),
  ).toBeGreaterThan(0.02)
})

test('a wire onto the stomp drive turns it up', () => {
  const base: Partial<Controls> = {
    stompCircuit: 1,
    stompDrive: 0,
    stompMix: 1,
    bodyX: 1,
    mod0Dest: 9,
    mod0Depth: 1,
  }
  const unwired = throughPedal(base)
  const wired = throughPedal({ ...base, mod0Src: 5 })
  expect(crest(tail(wired))).toBeLessThan(crest(tail(unwired)) * 0.85)
})

// The sequencer advances before it fires, so step 1 only comes round after a
// whole lap — a solo hit goes somewhere the render will actually reach.
const stepMask = (...steps: number[]) =>
  steps.reduce((m, s) => m | (1 << (15 - s)), 0)

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

const VOICE_KEYS = [
  'drumKick',
  'drumSnare',
  'drumHat',
  'drumClap',
  'drumTom',
  'drumBell',
] as const

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

test('the mic soldered onto the drum trigger fires the kit', () => {
  const clicks = (mic: Float32Array, offset: number) => {
    for (let i = 0; i < mic.length; i++)
      mic[i] = (offset + i) % 12000 < 40 ? 0.9 : 0
  }
  const look: Partial<Controls> = { chipLevel: 0, drumLevel: 1, micLevel: 1 }
  // the sequencer is stopped, so anything we hear came off the trigger line
  const trig = renderBender({ ...look, micPatch: 5 }, 1, undefined, clicks)
  const inert = renderBender({ ...look, micPatch: 4 }, 1, undefined, clicks)
  expect(rms(inert)).toBe(0)
  expect(rms(trig)).toBeGreaterThan(0.01)
})

test('bridged envelope pins put the kick on the snare steps', () => {
  // twelve snares to four kicks, so a full swap moves most of the bar down
  // into the kick
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
  expect(lowEnergy(swapped)).toBeGreaterThan(1.5 * lowEnergy(stock))
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

// Two machines on one desk. The kit used to hang off the demo song's run line,
// so writing a pattern and hearing it meant putting the toy's ROM tune on
// underneath — and stopping the tune stopped the kit.
test('each machine runs on its own run line', () => {
  const both: Partial<Controls> = { chipLevel: 0.8, drumLevel: 0.9 }
  const runLines = (tune: boolean, drums: boolean) =>
    renderBender(both, 1, built => {
      built.transport.tune = tune
      built.transport.drums = drums
    })

  const silent = rms(runLines(false, false))
  const kitOnly = rms(runLines(false, true))
  const tuneOnly = rms(runLines(true, false))
  expect(silent).toBeLessThan(0.001)
  expect(kitOnly).toBeGreaterThan(0.02)
  expect(tuneOnly).toBeGreaterThan(0.02)
  // Neither is the other: the kit on its own has no sustained tone in it, and
  // the tune on its own has no step of the pattern.
  expect(runLines(false, true)).not.toEqual(runLines(true, false))
})

test('an unbridged kit is the kit it always was', () => {
  const look: Partial<Controls> = { chipLevel: 0, drumLevel: 0.9 }
  expect(render({ ...look, drumCrossAmt: 1 }, 1)).toEqual(render(look, 1))
})

test('a ROM step wire rides the sequencer, pushing the clock as each step runs', () => {
  const look: Partial<Controls> = {
    chipLevel: 0.8,
    mod0Dest: DEST.chipClock,
    mod0Depth: 0.6,
  }
  const plain = render(look, 2)
  const wired = render({ ...look, mod0Src: 8 }, 2)
  expect(wired).not.toEqual(plain)
  expect(pitchHz(tail(wired, 1))).toBeGreaterThan(pitchHz(tail(plain, 1)))
})

test('a wire onto the shifter moves the shift itself', () => {
  const look: Partial<Controls> = {
    chipLevel: 0,
    sampleLevel: 1,
    bendSlot0: 7,
    shiftMix: 1,
    shiftHz: 100,
    bodyX: 1,
    mod0Src: 5,
    mod0Dest: DEST.shiftHz,
    mod0Depth: 1,
  }
  const load = (b: BuiltChain) => b.sampler.setBuffer(sine(500, 1))
  // body X pinned at 1 lifts a 100 Hz shift four octaves, to 1600
  expect(pitchHz(tail(renderBender(look, 1, load)))).toBeCloseTo(2100, -2)
})
