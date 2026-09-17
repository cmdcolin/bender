import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls'
import { packParams, SOURCE_TAPS } from '../../engine/params'
import { buildBender, buildChain } from '../build'
import { ModBus } from '../modbus'
import { BLOCK, type Ctx } from '../stage'
import { renderBender, renderStems, rms } from '../testRender'
import { ToyRail } from '../toyRail'
import { TriggerBus } from '../trigbus'
import { MOOD, Pet } from './pet'
import {
  CHIP_HZ,
  formantsToK,
  PET_ADDR_LINES,
  PET_DATA_LINES,
  PHRASE,
  PHRASE_NAMES,
  PHRASE_START,
  ROM_USED,
} from './petRom'

const HUSH: Partial<Controls> = { chipLevel: 0, drumLevel: 0, fmLevel: 0 }
const PET = SOURCE_TAPS.indexOf('pet')

function makeCtx(sr: number): Ctx {
  const buf = () => new Float32Array(BLOCK)
  return {
    sr,
    mic: buf(),
    fb: buf(),
    railV: buf().fill(1),
    sag: buf(),
    droop: buf(),
    env: buf(),
    step: buf(),
    carrier: buf(),
    send: buf(),
    bright: buf(),
    out: buf(),
    heat: 0,
    fbDest: 0,
    mod: new ModBus(sr),
    trig: new TriggerBus(),
  }
}

// The stage on its own bench: a rail nothing ticks, and a block handed in by
// hand with whatever the ears and the trigger line should carry.
function bench(overrides: Partial<Controls> = {}, sr = 8000, seed = 5) {
  const rail = new ToyRail(sr)
  const pet = new Pet(sr, rail, seed)
  const ctx = makeCtx(sr)
  const p = packParams({ ...DEFAULT_CONTROLS, petLevel: 1, ...overrides })
  const io = {
    l: new Float32Array(BLOCK),
    r: new Float32Array(BLOCK),
    n: BLOCK,
  }
  const run = (
    seconds: number,
    each?: (ctx: Ctx, secs: number) => void,
  ): Float32Array => {
    const blocks = Math.ceil((seconds * sr) / BLOCK)
    const out = new Float32Array(blocks * BLOCK)
    for (let b = 0; b < blocks; b++) {
      ctx.trig.swap(BLOCK)
      each?.(ctx, (b * BLOCK) / sr)
      io.l.fill(0)
      io.r.fill(0)
      rail.reported = 0
      pet.process(io, p, ctx)
      out.set(io.l, b * BLOCK)
    }
    return out
  }
  return { pet, rail, ctx, p, run }
}

test('a board with the pet at zero renders the samples it did without one', () => {
  for (const board of [
    {},
    { drumLevel: 0.8, fmLevel: 0.5, oscLevel: 0.2, noiseLevel: 0.1 },
  ]) {
    const p = packParams({ ...DEFAULT_CONTROLS, ...board })
    const render = (withPet: boolean) => {
      const chain = buildChain(48000)
      if (!withPet) chain.sources = chain.sources.filter(s => s.label !== 'pet')
      const io = {
        l: new Float32Array(BLOCK),
        r: new Float32Array(BLOCK),
        n: BLOCK,
      }
      const out = new Float32Array(400 * BLOCK)
      for (let b = 0; b < 400; b++) {
        chain.process(io, p)
        out.set(io.l, b * BLOCK)
      }
      return out
    }
    expect(render(true)).toEqual(render(false))
  }
})

test('the phrase ROM fits its address space and every phrase starts inside it', () => {
  expect(ROM_USED).toBeLessThanOrEqual(1 << PET_ADDR_LINES)
  expect(PHRASE_START).toHaveLength(PHRASE_NAMES.length)
  for (const at of PHRASE_START) expect(at).toBeLessThan(ROM_USED)
})

test('a formant set steps down to reflection coefficients inside the unit circle', () => {
  const k = formantsToK([730, 1090, 2440, 3400, 3750], [70, 90, 150, 200, 250])
  for (const v of k) expect(Math.abs(v)).toBeLessThan(1)
})

test('the pet talks on its own channel once its level is up', () => {
  const { stems } = renderStems({ ...HUSH, petLevel: 1 }, 2)
  expect(rms(stems[PET]!)).toBeGreaterThan(0.01)
  for (const [k, stem] of stems.entries())
    if (k !== PET) expect(stem.every(v => v === 0)).toBe(true)
})

test('a render with the same seed says the same thing', () => {
  const a = renderBender({ ...HUSH, petLevel: 1, petChatter: 1 }, 3)
  const b = renderBender({ ...HUSH, petLevel: 1, petChatter: 1 }, 3)
  expect(a).toEqual(b)
})

test('the lattice stays finite and bounded under every bus fault and K-bit flip', () => {
  let loudest = 0
  let broken = 0
  const listen = (overrides: Partial<Controls>) => {
    const { pet, run } = bench({ petMotor: 0, ...overrides })
    const out = run(0.6, () => {
      if (pet.phrase < 0) pet.say(PHRASE.yawn)
    })
    for (const v of out) {
      if (!Number.isFinite(v)) broken++
      else loudest = Math.max(loudest, Math.abs(v))
    }
  }
  for (let line = 0; line <= PET_ADDR_LINES; line++)
    for (let fault = 0; fault < 4; fault++)
      listen({ petAddrLine: line, petAddrFault: fault, petKBits: 1 })
  for (let line = 0; line <= PET_DATA_LINES; line++)
    for (let fault = 0; fault < 4; fault++)
      for (const petKBits of [0, 0.5, 1])
        for (const petHold of [0, 0.9])
          listen({
            petDataLine: line,
            petDataFault: fault,
            petAddrLine: 3,
            petKBits,
            petHold,
          })
  for (const petRate of [0.25, 4])
    for (const petPitch of [0.25, 4]) listen({ petRate, petPitch, petKBits: 1 })
  expect(broken).toBe(0)
  expect(loudest).toBeGreaterThan(0.1)
  expect(loudest).toBeLessThan(2)
})

const phrase = (overrides: Partial<Controls>, seconds = 2) => {
  const { pet, run } = bench({ petMotor: 0, petChatter: 0, ...overrides })
  pet.say(PHRASE.hello)
  let spoke = 0
  const out = run(seconds, (_, secs) => {
    if (pet.phrase >= 0) spoke = secs
  })
  return { out, spoke }
}

test('flipped K bits drive the lattice into a clamped screech', () => {
  expect(rms(phrase({ petKBits: 1 }).out)).toBeGreaterThan(
    2 * rms(phrase({}).out),
  )
})

test('a knife on either bus changes what the chip reads out of the ROM', () => {
  const clean = phrase({}).out
  expect(phrase({ petDataLine: 3, petDataFault: 1 }).out).not.toEqual(clean)
  expect(phrase({ petAddrLine: 2, petAddrFault: 2 }).out).not.toEqual(clean)
})

test('frame hold repeats frames and stretches the phrase', () => {
  expect(phrase({ petHold: 0.6 }, 4).spoke).toBeGreaterThan(
    1.5 * phrase({}, 4).spoke,
  )
})

test('left in silence the pet grows sleepy and falls asleep', () => {
  const { pet, run } = bench({ petChatter: 0 })
  expect(pet.mood).toBe(MOOD.awake)
  run(22)
  expect(pet.mood).toBe(MOOD.sleepy)
  run(10)
  expect(pet.mood).toBe(MOOD.asleep)
})

test('noise at the mic wakes a sleeping pet, and a shout scares it', () => {
  const { pet, run } = bench({ petChatter: 0 })
  run(35)
  expect(pet.mood).toBe(MOOD.asleep)
  run(0.5, ctx => {
    for (let i = 0; i < BLOCK; i++) ctx.mic[i] = (i % 7) / 30 - 0.1
  })
  expect(pet.mood).toBe(MOOD.awake)
  run(0.5, ctx => {
    for (let i = 0; i < BLOCK; i++) ctx.mic[i] = i % 2 ? 0.9 : -0.9
  })
  expect(pet.mood).toBe(MOOD.scared)
  run(8, ctx => ctx.mic.fill(0))
  expect(pet.mood).toBe(MOOD.awake)
})

test('a kit hit tickles the pet chatty, and a drum roll scares it', () => {
  const { pet, run } = bench()
  run(3, (ctx, secs) => {
    if (Math.abs(secs - 1) < 0.01) ctx.trig.drumFired(0, 1, 1)
  })
  expect(pet.mood).toBe(MOOD.chatty)

  const rolled = bench()
  rolled.run(3, (ctx, secs) => {
    if (secs > 1 && secs < 2) ctx.trig.drumFired(0, 1, 1)
  })
  expect(rolled.pet.mood).toBe(MOOD.scared)

  const asleep = bench({ petChatter: 0 })
  asleep.run(35)
  expect(asleep.pet.mood).toBe(MOOD.asleep)
  asleep.run(0.2, (ctx, secs) => {
    if (secs === 0) ctx.trig.drumFired(0, 1, 1)
  })
  expect(asleep.pet.mood).toBe(MOOD.awake)
})

test('a sagging rail makes the pet sleepy and then puts it to sleep', () => {
  const { pet, rail, run } = bench()
  rail.v = 0.4
  run(3)
  expect(pet.mood).toBe(MOOD.sleepy)
  run(8)
  expect(pet.mood).toBe(MOOD.asleep)
  run(0.2, (ctx, secs) => {
    if (secs === 0) ctx.trig.drumFired(0, 1, 1)
  })
  expect(pet.mood).toBe(MOOD.sleepy)
})

test('the motor draws on the rail while the pet talks, and stops when it is done', () => {
  const { pet, rail, run } = bench({ petChatter: 0 })
  let drawn = 0
  run(0.3, () => {
    if (pet.phrase >= 0) drawn = Math.max(drawn, rail.reported)
  })
  expect(drawn).toBeGreaterThan(0.2)
  run(3)
  expect(pet.phrase).toBe(-1)
  expect(rail.reported).toBe(0)
})

test('the pet talking sags the keyboard sharing its batteries', () => {
  const sag = (petLevel: number) => {
    const built = buildBender(48000)
    built.transport.tune = true
    const p = packParams({
      ...DEFAULT_CONTROLS,
      chipBattery: 0.5,
      petLevel,
    })
    const io = {
      l: new Float32Array(BLOCK),
      r: new Float32Array(BLOCK),
      n: BLOCK,
    }
    let pitch = 0
    let amp = 0
    const blocks = 375
    for (let b = 0; b < blocks; b++) {
      built.chain.process(io, p)
      pitch += built.rail.pitchFactor / blocks
      amp += built.rail.ampFactor / blocks
    }
    return { pitch, amp }
  }
  const alone = sag(0)
  const talking = sag(1)
  expect(talking.pitch).toBeLessThan(alone.pitch - 0.01)
  expect(talking.amp).toBeLessThan(alone.amp - 0.02)
})

test('the chip clock scales with the rate knob and the rail', () => {
  const frames = (overrides: Partial<Controls>, clockV = 1) => {
    const { pet, rail, run } = bench({ petMotor: 0, ...overrides }, CHIP_HZ)
    ;(rail as unknown as { clockV: number }).clockV = clockV
    pet.say(PHRASE.yawn)
    let secs = 0
    run(6, (_, s) => {
      if (pet.phrase >= 0) secs = s
    })
    return secs
  }
  const stock = frames({ petChatter: 0 })
  expect(frames({ petChatter: 0, petRate: 2 })).toBeLessThan(stock * 0.7)
  expect(frames({ petChatter: 0 }, 0.3)).toBeGreaterThan(stock * 1.3)
})

test('at full Chatter a pet left in silence keeps waking up to talk', () => {
  const { pet, run } = bench({ petChatter: 1 })
  let awake = 0
  for (let s = 0; s < 300; s++) {
    run(1)
    if (pet.mood !== MOOD.asleep) awake++
  }
  expect(awake).toBeGreaterThan(150)
})

test('the mouth and motor readings rise during a phrase and fall back to zero after it', () => {
  const { pet, run } = bench({ petChatter: 0 })
  expect(pet.mouth).toBe(0)
  expect(pet.motor).toBe(0)
  pet.say(PHRASE.hello)
  let mouth = 0
  let motor = 0
  run(0.4, () => {
    mouth = Math.max(mouth, pet.mouth)
    motor = Math.max(motor, pet.motor)
  })
  expect(mouth).toBeGreaterThan(0.2)
  expect(mouth).toBeLessThanOrEqual(1)
  expect(motor).toBeGreaterThan(0.9)
  run(3)
  expect(pet.phrase).toBe(-1)
  expect(pet.mouth).toBe(0)
  expect(pet.motor).toBeLessThan(0.01)
})

test('a poke wakes a sleeping pet', () => {
  const { pet, run } = bench({ petChatter: 0 })
  run(32)
  expect(pet.mood).toBe(MOOD.asleep)
  pet.poke()
  run(0.05)
  expect(pet.mood).toBe(MOOD.awake)
})

test('a poke makes an awake pet chatty, and it laughs', () => {
  const { pet, run } = bench({ petChatter: 0 })
  pet.poke()
  run(0.05)
  expect(pet.mood).toBe(MOOD.chatty)
  expect(pet.phrase).toBe(PHRASE.laugh)
})

test('a quick run of pokes scares the pet', () => {
  const { pet, run } = bench({ petChatter: 0 })
  run(0.2, () => pet.poke())
  expect(pet.mood).toBe(MOOD.scared)
})
