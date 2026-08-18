// The effect ROM: the CPU spraying writes.
//
// A nature sound on a chip like this is not a sample. There is no sample memory
// on the board and nowhere to put one — it is a little program in the CPU's ROM
// firing register writes at the synthesiser hundreds of times a second. A bird
// call is a stack of short frequency sweeps with a key-on between them; surf is
// the modulator's feedback wound past the point where it stops making harmonics
// and starts making noise, with slow swells written into the level register;
// wind is that same noise under a random walk on the frequency count.
//
// Which makes the effects the highest-traffic thing the bus ever carries, and
// the dataline bend scales with traffic. A note is four writes. A bird call is a
// continuous stream, so every one of those writes arrives wrong and the
// corruption never lets up — and the gesture survives anyway, because the timing
// is the CPU's and nothing here has been done to the CPU. What comes out is the
// shape of a bird call driving a chip that has been told nonsense.
//
// Two things about it that a bent patch cannot do. With the fault set to cut,
// the stale bit carries the previous write's value forward, so on a sweep each
// write is contaminated by the one before it — the corruption is correlated with
// the effect's own motion rather than being a constant offset. And a sweep
// rewrites the frequency registers constantly while never rewriting the patch,
// so the pitch keeps recovering and the timbre stays scarred: two timescales at
// once, which is the register file's persistence made audible.
//
// It is the counterpart to the toy's tune ROM. That one holds notes; this one
// holds register writes.
import type { Rng } from '../util/rng'
import { CAR_HALF, KEY_ON, MOD_HALF, pack, REG, type Voice } from './fmVoices'

/** The channel the CPU keeps for itself while an effect runs. */
export const EFFECT_CH = 3

const FNUM = REG.fnumLo + EFFECT_CH
const KEY = REG.keyBlock + EFFECT_CH
const VOL = REG.instVol + EFFECT_CH

// What a script has to work with, which is what the driver had: the write, a
// noise source, and four bytes of scratch — a walk position, where the current
// sweep started, how much of it is left. Everything else it has to recompute
// from the tick count, because a ROM this size has nowhere to keep it.
export interface Cpu {
  write(addr: number, data: number): void
  rng: Rng
  s: Float64Array
}

export interface Effect {
  name: string
  /** how many times a second the driver gets round its loop */
  hz: number
  /** the eight patch bytes it sends on the way in, and never again */
  patch: number[]
  /** one pass of the script: `tick` counts loops, `t` is seconds since it started */
  run(cpu: Cpu, tick: number, t: number): void
}

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x

// A walk with reflecting walls rather than a clamp, so it keeps visiting the
// ends of the count instead of parking against one.
const reflect = (x: number, lo: number, hi: number) =>
  x > hi ? hi - (x - hi) : x < lo ? lo + (lo - x) : x

// The frequency, as the part laid it out: nine bits of count split across two
// registers, with the top one sharing a byte with the key. Which is why an
// effect is such a good place to hear the crowding — a sweep writes that byte
// hundreds of times a second, and it carries whether the note exists.
const setFreq = (cpu: Cpu, fnum: number, block: number, on: boolean) => {
  const f = clamp(Math.round(fnum), 0, 511)
  cpu.write(FNUM, f & 0xff)
  cpu.write(KEY, ((f >> 8) & 1) | (block << 1) | (on ? KEY_ON : 0))
}

const keyUp = (cpu: Cpu, block: number) => cpu.write(KEY, block << 1)

// Key up then down, because the chip has no other way to be told this is a new
// note — the same pair the driver sends for a note off the keyboard.
const strike = (cpu: Cpu, fnum: number, block: number) => {
  keyUp(cpu, block)
  setFreq(cpu, fnum, block, true)
}

/** The modulator's own volume, counted as attenuation, six bits of it. */
const modLevel = (cpu: Cpu, steps: number) =>
  cpu.write(REG.modLevel, clamp(Math.round(steps), 0, 63))

/** The channel's volume, one nibble at three decibels a step. */
const vol = (cpu: Cpu, steps: number) =>
  cpu.write(VOL, clamp(Math.round(steps), 0, 15))

const patch = (v: Omit<Voice, 'name'>) => pack(v)

// Noise, on a chip with no noise generator: feedback past about five and the
// modulator stops making harmonics and starts making a rush. It is where these
// chips' own drum sounds came from, and it is where all the weather is.
const NOISE_FB = 7

const BIRD_BLOCK = 6
const WEATHER_BLOCK = 4
const SIREN_BLOCK = 3
const CRICKET_BLOCK = 7

export const EFFECTS: Effect[] = [
  {
    // A call is a handful of short sweeps and the gaps between them, and the
    // gaps are not on a grid — the ROM has a noise byte for exactly this.
    name: 'bird',
    hz: 220,
    patch: patch({
      modMult: 2,
      carMult: 1,
      hold: true,
      level: 16,
      feedback: 1,
      half: 0,
      modAd: [15, 8],
      carAd: [15, 8],
      modSr: [0, 12],
      carSr: [0, 12],
    }),
    run(cpu, tick) {
      const CALL = 26
      const phase = tick % CALL
      if (phase === 0) {
        cpu.s[0] = cpu.rng() < 0.7 ? 6 + Math.floor(cpu.rng() * 9) : 0
        cpu.s[1] = 280 + cpu.rng() * 150
        cpu.s[2] = (cpu.rng() < 0.75 ? 1 : -1) * (6 + cpu.rng() * 22)
      }
      const len = cpu.s[0]!
      if (len === 0) return
      if (phase === 0) strike(cpu, cpu.s[1]!, BIRD_BLOCK)
      else if (phase <= len)
        setFreq(cpu, cpu.s[1]! + cpu.s[2]! * phase, BIRD_BLOCK, true)
      else if (phase === len + 1) keyUp(cpu, BIRD_BLOCK)
    },
  },
  {
    // One note, struck once and held for as long as the effect runs, with every
    // swell written in as a pair of level bytes. Two rates that never line back
    // up, because a beach does not loop.
    name: 'surf',
    hz: 150,
    patch: patch({
      modMult: 1,
      carMult: 1,
      hold: true,
      level: 22,
      feedback: NOISE_FB,
      half: 0,
      modAd: [10, 0],
      carAd: [7, 0],
      modSr: [0, 6],
      carSr: [0, 6],
    }),
    run(cpu, tick, t) {
      if (tick === 0) strike(cpu, 140, WEATHER_BLOCK)
      const swell =
        0.5 +
        0.25 *
          (Math.sin(2 * Math.PI * 0.17 * t) +
            Math.sin(2 * Math.PI * 0.26 * t + 1.7))
      modLevel(cpu, 40 - swell * 32)
      vol(cpu, (1 - swell) * 6)
      if (tick % 4 === 0) setFreq(cpu, 110 + swell * 70, WEATHER_BLOCK, true)
    },
  },
  {
    // The same noise, wandering instead of swelling: a random walk on the
    // frequency count, with slower ones on the modulator's level and the
    // channel's volume under it. Three walks that share nothing, so a gust
    // never arrives at its loudest and its harshest together.
    name: 'wind',
    hz: 130,
    patch: patch({
      modMult: 1,
      carMult: 1,
      hold: true,
      level: 26,
      feedback: NOISE_FB,
      half: 0,
      modAd: [8, 0],
      carAd: [6, 0],
      modSr: [0, 5],
      carSr: [0, 5],
    }),
    run(cpu, tick) {
      if (tick === 0) {
        strike(cpu, 90, WEATHER_BLOCK)
        cpu.s[0] = 90
        cpu.s[1] = 30
        cpu.s[2] = 4
      }
      cpu.s[0] = reflect(cpu.s[0]! + (cpu.rng() * 2 - 1) * 9, 40, 320)
      cpu.s[1] = reflect(cpu.s[1]! + (cpu.rng() * 2 - 1) * 1.2, 8, 44)
      cpu.s[2] = reflect(cpu.s[2]! + (cpu.rng() * 2 - 1) * 0.35, 0, 9)
      setFreq(cpu, cpu.s[0]!, WEATHER_BLOCK, true)
      modLevel(cpu, cpu.s[1]!)
      vol(cpu, cpu.s[2]!)
    },
  },
  {
    // The one gesture on the board that is nothing but a frequency register
    // being rewritten: three octaves up and back, twice a lap, with the
    // modulator brought up at the top the way a real one gets harsher as it
    // climbs.
    name: 'siren',
    hz: 90,
    patch: patch({
      modMult: 2,
      carMult: 1,
      hold: true,
      level: 18,
      feedback: 2,
      half: 0,
      modAd: [15, 0],
      carAd: [14, 0],
      modSr: [0, 8],
      carSr: [0, 8],
    }),
    run(cpu, tick, t) {
      if (tick === 0) strike(cpu, 70, SIREN_BLOCK)
      const CYCLE = 2.4
      const ramp = (t % CYCLE) / CYCLE
      const tri = ramp < 0.5 ? ramp * 2 : 2 - ramp * 2
      setFreq(cpu, 70 + tri * 400, SIREN_BLOCK, true)
      modLevel(cpu, 34 - tri * 18)
    },
  },
  {
    // The sparse one, and the reason it is worth having: a cricket is nothing
    // but key-ons. Five strikes and a long gap, so the register carrying the key
    // gets hammered and everything else on the bus sits still — which is the
    // effect where a key line that cannot go low is a single tone for good.
    name: 'crickets',
    hz: 260,
    patch: patch({
      modMult: 6,
      carMult: 4,
      hold: true,
      level: 20,
      feedback: 0,
      half: MOD_HALF | CAR_HALF,
      modAd: [15, 12],
      carAd: [15, 12],
      modSr: [0, 14],
      carSr: [0, 14],
    }),
    run(cpu, tick) {
      const CYCLE = 190
      const phase = tick % CYCLE
      if (phase === 0) cpu.s[0] = 340 + Math.floor(cpu.rng() * 80)
      if (phase >= 30) return
      const p = phase % 5
      if (p === 0) strike(cpu, cpu.s[0]!, CRICKET_BLOCK)
      else if (p === 1) setFreq(cpu, cpu.s[0]! + 40, CRICKET_BLOCK, true)
      else if (p === 2) keyUp(cpu, CRICKET_BLOCK)
    },
  },
]

/** off, then one per script — what the effect button steps through. */
export const FM_EFFECT_NAMES = ['off', ...EFFECTS.map(e => e.name)]

// Pressing the effect button, which is eight patch bytes and a volume. The
// patch goes out once and is never sent again, so whatever the wires did to it
// is the sound of the effect until something else writes those registers.
export const loadEffect = (cpu: Cpu, effect: Effect) => {
  for (let i = 0; i < 8; i++) cpu.write(i, effect.patch[i]!)
  vol(cpu, 0)
}

/** Letting the button go: the one write that ends the note the script left on. */
export const stopEffect = (cpu: Cpu) => cpu.write(KEY, 0)
