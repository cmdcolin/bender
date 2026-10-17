import {
  CAR_HALF,
  KEY_ON,
  MOD_HALF,
  pack,
  REG,
  type Voice,
} from './fmVoices.ts'

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
import type { Rng } from '../util/rng.ts'

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

// A9 down: what the frequency number is counted against. The chip holds nine
// bits of frequency and three of octave, so the nine bits only ever have to
// cover one octave and the block shifts it. Which is why a cut frequency line
// is a lattice rather than a slide — the note lands on the nearest count the
// remaining wires can still express, and the same wrong count every time.
/** What a count of FNUM_FULL is worth at block 0. */
export const FNUM_HZ = 32.7
export const FNUM_FULL = 256

/** The tightest block that reaches a pitch in hertz. */
export const blockOf = (hz: number) =>
  clamp(Math.floor(Math.log2(hz / FNUM_HZ)), 0, 7)
/** The count, unrounded, that reaches a pitch in a given block. */
export const fnumOf = (hz: number, block: number) =>
  (hz / FNUM_HZ / Math.pow(2, block)) * FNUM_FULL

const setHz = (cpu: Cpu, hz: number, on: boolean) => {
  const block = blockOf(hz)
  setFreq(cpu, fnumOf(hz, block), block, on)
}

const strikeHz = (cpu: Cpu, hz: number) => {
  keyUp(cpu, blockOf(hz))
  setHz(cpu, hz, true)
}

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
const BELL_BLOCK = 4

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
      setFreq(cpu, cpu.s[0], WEATHER_BLOCK, true)
      modLevel(cpu, cpu.s[1])
      vol(cpu, cpu.s[2])
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
    // but key-ons. Six strikes and a long gap, so the register carrying the key
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
  {
    // A hammer between two bells, twenty strikes a second, in the old double
    // ring: two bursts and a long gap, the modulator a little off each pass.
    name: 'phone',
    hz: 200,
    patch: patch({
      modMult: 7,
      carMult: 1,
      hold: false,
      level: 22,
      feedback: 2,
      half: 0,
      modAd: [15, 6],
      carAd: [15, 5],
      modSr: [2, 6],
      carSr: [1, 6],
    }),
    run(cpu, tick, t) {
      const at = t % 3
      const ringing = at < 0.4 || (at >= 0.6 && at < 1)
      modLevel(cpu, 18 + cpu.rng() * 8)
      if (!ringing) {
        if (tick % 5 === 0) keyUp(cpu, 5)
        return
      }
      if (tick % 5 === 0) strike(cpu, (tick / 5) % 2 ? 230 : 262, 5)
    },
  },
  {
    // Ding, dong: a chime a major third down, every four seconds, with the
    // driver writing a slow tremolo into the volume between strikes.
    name: 'doorbell',
    hz: 160,
    patch: patch({
      modMult: 5,
      carMult: 1,
      hold: false,
      level: 26,
      feedback: 0,
      half: 0,
      carKsl: 1,
      modAd: [15, 3],
      carAd: [15, 2],
      modSr: [4, 3],
      carSr: [2, 2],
    }),
    run(cpu, tick, t) {
      const at = t % 4
      if (tick % 640 === 0) strike(cpu, 323, BELL_BLOCK)
      else if (tick % 640 === 96) strike(cpu, 256, BELL_BLOCK)
      vol(cpu, 1 + Math.sin(2 * Math.PI * 5 * at))
    },
  },
  {
    // A locomotive pulling away: chuffs of the feedback noise shaped in the
    // volume register, closer together each one, then the whistle. The
    // whistle is the same channel with its feedback written back down, so the
    // script reaches the patch bytes as well as the frequency.
    name: 'steam',
    hz: 200,
    patch: patch({
      modMult: 1,
      carMult: 1,
      hold: true,
      level: 14,
      feedback: NOISE_FB,
      half: 0,
      modAd: [15, 0],
      carAd: [15, 0],
      modSr: [0, 8],
      carSr: [0, 8],
    }),
    run(cpu, tick, t) {
      const CYCLE = 10
      const WHISTLE = 7.5
      const at = t % CYCLE
      if (tick % (CYCLE * 200) === 0) {
        cpu.write(REG.feedback, NOISE_FB)
        modLevel(cpu, 14)
        strike(cpu, 200, WEATHER_BLOCK)
        cpu.s[0] = 0
        cpu.s[1] = 0
      }
      if (at < WHISTLE) {
        // the gap between chuffs falls from half a second to a sixth
        const gap = 0.5 - (at / WHISTLE) * 0.33
        cpu.s[0] = cpu.s[0]! + 1 / 200
        if (cpu.s[0] >= gap) cpu.s[0] = 0
        vol(cpu, (cpu.s[0] / gap) * 15)
        return
      }
      if (cpu.s[1] !== 1) {
        cpu.s[1] = 1
        cpu.write(REG.feedback, 0)
        modLevel(cpu, 36)
        strike(cpu, 180, 5)
      }
      const wobble = Math.sin(2 * Math.PI * 6 * at) * 3
      setFreq(cpu, 180 + Math.min((at - WHISTLE) * 40, 20) + wobble, 5, true)
      vol(cpu, at > CYCLE - 0.3 ? 15 : 0)
    },
  },
  {
    // A room of hands on one channel: the feedback noise struck at random,
    // each clap a fresh pitch and a fast fall in the volume, the rate swelling
    // and dying away over six seconds.
    name: 'applause',
    hz: 300,
    patch: patch({
      modMult: 1,
      carMult: 1,
      hold: true,
      level: 10,
      feedback: NOISE_FB,
      half: 0,
      modAd: [15, 0],
      carAd: [15, 0],
      modSr: [0, 8],
      carSr: [0, 8],
    }),
    run(cpu, _tick, t) {
      const swell = Math.sin((Math.PI * (t % 6)) / 6)
      if (cpu.rng() < swell * 0.25) {
        strikeHz(cpu, 900 + cpu.rng() * 2500)
        cpu.s[0] = cpu.rng() * 4
      } else cpu.s[0] = Math.min(cpu.s[0]! + 2.5, 15)
      vol(cpu, cpu.s[0])
    },
  },
  {
    // Pew: a bright note dropped six octaves in a sixth of a second, three to
    // a burst, the bursts a random distance apart.
    name: 'laser',
    hz: 400,
    patch: patch({
      modMult: 2,
      carMult: 1,
      hold: true,
      level: 12,
      feedback: 4,
      half: 0,
      modAd: [15, 0],
      carAd: [15, 0],
      modSr: [0, 10],
      carSr: [0, 10],
    }),
    run(cpu, tick) {
      const SHOT = 70
      const into = tick - cpu.s[1]!
      if (into === SHOT * 3) {
        keyUp(cpu, 7)
        cpu.s[2] = 40 + Math.floor(cpu.rng() * 200)
      }
      if (into >= SHOT * 3) {
        if (into >= SHOT * 3 + cpu.s[2]!) cpu.s[1] = tick + 1
        return
      }
      const along = (into % SHOT) / SHOT
      if (into % SHOT === 0) strikeHz(cpu, 6000)
      else setHz(cpu, 6000 * Math.pow(2, -6 * Math.sqrt(along)), true)
      modLevel(cpu, 8 + along * 30)
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
