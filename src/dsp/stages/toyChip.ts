import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { voiceMask } from '../trigbus'
import { softclip } from '../util/softclip'
import { Burst } from '../util/burst'
import { Drunk } from '../util/drift'
import { mulberry32, type Rng } from '../util/rng'
import { ROMS, type Rom } from './roms'

const BASE_HZ = 220
const ENV_FLOOR = 0.003

// An envelope that has fallen under the floor stops there, rather than halving
// its way toward zero for the rest of the session.
//
// Everything here already treats the floor as silence — a voice under it is a
// voice free to be stolen, and none of them are summed — so the last stretch
// was inaudible arithmetic. It was not free arithmetic, though: five minutes of
// quiet is all it takes for a decaying double to reach the range the hardware
// stops handling in one piece, and from there every multiply costs twenty times
// what it did. The one stage that is always on doubled in cost the longer the
// toy was left switched on, and stayed doubled.
const fade = (env: number, decay: number) => (env > ENV_FLOOR ? env * decay : 0)

// Every note the divider can strike, as a ratio. The ROM steps, the keys and the
// triads are all whole semitones, so the chip's own pitches are a table — eight
// voices at eight Math.pow calls a sample is the one stage that is always on
// paying for arithmetic it did last sample.
const SEMI_LO = -48
const SEMI = Float64Array.from({ length: 144 }, (_, i) =>
  Math.pow(2, (i + SEMI_LO) / 12),
)
const ratio = (semitone: number) =>
  SEMI[semitone - SEMI_LO] ?? Math.pow(2, semitone / 12)

// The tone selector taps the divider chain at a different width. Narrow pulses
// null different harmonics; none of them is compensated for level, exactly as
// the cheap chips left them.
export const TONE_DUTY = [0.5, 0.25, 0.125, 0.0625]

// Four notes, as the toys of the era had.
const VOICE_TRIM = [0.86, 1.21, 0.97, 1.12]

// A key voice. Silence is its envelope being down, not a sentinel note: the keys
// reach an octave under the toy's own bottom, and a semitone below zero is a
// note like any other.
interface Voice {
  note: number
  phase: number
  env: number
  held: boolean
  started: number
}

// Auto-bass-chord: the accompaniment section the toys ran under the demo song.
// Tonic, dominant, subdominant — three chords is all the cheap ones offered.
const MAJOR_TRIADS = [
  [0, 4, 7],
  [7, 11, 14],
  [5, 9, 12],
]
const MINOR_TRIADS = [
  [0, 3, 7],
  [7, 11, 14],
  [5, 8, 12],
]

const pitchClass = (n: number) => ((n % 12) + 12) % 12

// Each ROM declares its own key, so the triads land in the song's key rather
// than wherever the note numbers happen to start.
const triadsFor = (rom: Rom) =>
  (rom.minor ? MINOR_TRIADS : MAJOR_TRIADS).map(t => t.map(n => n + rom.key))

const BASS_TRIM = 1.05
const CHORD_TRIM = [0.9, 1.15, 1]
// The triad sits under the melody rather than beside it.
const CHORD_GAIN = 0.7

// A jammed output stage sits where the latch left it instead of following the
// rail down.
const LATCH_AMP = 0.85

// How far a capacitor hung on the timing pin can divide the clock: four
// octaves, which is what puts a toy melody under the bottom of its own keyboard
// and turns its squares into something you feel rather than hear.
const CLOCK_DRAG_MAX = 15

// One small output stage carries every voice, so a chord leans on its headroom
// rather than coming out four times louder.
const MIXER_DRIVE = 0.35
const mixVoices = (sum: number) => softclip(sum * MIXER_DRIVE) / MIXER_DRIVE

// A counter can't strike a pulse narrower than one clock tick, so the narrow
// tones widen back toward a square as the note climbs past the divider's
// resolution — the same place a real chip runs out of counts. The output cap
// centres the result, so a narrow tap swings the same peak-to-peak as a square
// but comes out as a spike carrying less of the energy.
const pulse = (phase: number, duty: number, inc: number) => {
  const d = Math.max(duty, inc)
  return phase < d ? 2 * (1 - d) : -2 * d
}

export class ToyChip implements Stage {
  label = 'toyChip'
  private phase = 0
  private pos = 0
  private note = -1
  private stepClock = 0
  private env = 0
  private voices: Voice[] = VOICE_TRIM.map(() => ({
    note: 0,
    phase: 0,
    env: 0,
    held: false,
    started: 0,
  }))
  private voiceClock = 0
  private triads = MAJOR_TRIADS
  private lastRom: Rom | undefined
  private chord = MAJOR_TRIADS[0]!
  private bassNote = 0
  private bassFifth = false
  private bassPhase = 0
  private bassEnv = 0
  private chordPhase = [0, 0, 0]
  private chordEnv = 0
  private gateState = 1
  private gateClock = 0
  private clockWalk = 0
  private lastReboot = 0
  private wasPlaying = false
  // The gate, waiting to go out on the bus. A flag rather than a sentinel note:
  // the keys reach under the toy's bottom key, so there is no note number left
  // over to mean "nothing struck".
  private keyPending = false
  private keyNote = 0
  private lastTiming = 0
  private envDecay = 1
  private rng: Rng
  // The crystal's own wander, and the counter's habit of slipping in runs
  // rather than at a steady rate.
  private drift = new Drunk()
  private counterFault: Burst

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
    seed = 101,
  ) {
    this.rng = mulberry32(seed)
    this.counterFault = new Burst(sr, 1.1)
  }

  // The toy's own keys are switches: they pass no gain and strike at full. A
  // wire onto the gate can arrive at any level, which is what the trigger patch
  // has always done and what a controller's velocity is.
  noteOn(semitone: number, gain = 1) {
    this.strike(semitone, gain).held = true
  }

  // A voice struck and let go. The keys hold theirs down; a trigger line
  // soldered onto the gate does not, so what it strikes decays like a ROM note.
  private strike(semitone: number, gain: number): Voice {
    const v = this.pick(semitone)
    v.note = semitone
    v.env = gain
    v.held = false
    v.started = this.voiceClock++
    this.keyNote = semitone
    this.keyPending = true
    return v
  }

  noteOff(semitone: number) {
    for (const v of this.voices) if (v.note === semitone) v.held = false
  }

  // Retrigger the note if it is already up, else take a silent voice; failing
  // that steal, preferring a released voice and the oldest within its group.
  private pick(semitone: number): Voice {
    for (const v of this.voices) if (v.note === semitone) return v
    for (const v of this.voices) if (!v.held && v.env <= ENV_FLOOR) return v
    let steal = this.voices[0]!
    for (const v of this.voices) {
      if (v.held === steal.held ? v.started < steal.started : !v.held) steal = v
    }
    return steal
  }

  // Also true when only the drums play: this stage owns the shared rail tick.
  when(p: Float32Array) {
    return p[IDX.chipLevel]! > 0 || p[IDX.drumLevel]! > 0
  }

  // Pressing play drops the needle on step 0. Coming back from a brownout is
  // not that tidy: the program counter holds whatever junk was in the latch when
  // the rail went, so the tune comes back from the middle of itself as often as
  // from the top. Rebooting into bar one every time is what made a starving chip
  // sound like a loop.
  private restart(tune: number[], junk = false) {
    this.pos =
      junk && this.rng() < 0.6 ? Math.floor(this.rng() * tune.length) : 0
    this.stepClock = junk ? this.rng() : 0
    const step = tune[this.pos]!
    this.note = step >= 0 ? step : -1
    this.env = step >= 0 ? 1 : 0
    this.chord = this.triads[0]!
    this.bassFifth = false
  }

  // The accompaniment reads the melody instead of a chord button: a chord tone
  // moves it, a passing tone leaves it where it stands.
  private harmonize(note: number) {
    const pc = pitchClass(note)
    const found = this.triads.find(t => t.some(n => pitchClass(n) === pc))
    if (found) this.chord = found
  }

  // The accompaniment section, off whichever clock moved the step: bass on the
  // step, chord stab on the offbeat, the bass alternating root and fifth the way
  // the toys walked it.
  private oomPah() {
    if (this.pos % 2 === 0) {
      this.bassNote = (this.bassFifth ? this.chord[2]! : this.chord[0]!) - 12
      this.bassFifth = !this.bassFifth
      this.bassEnv = 1
    } else {
      this.chordEnv = 1
    }
  }

  // What a hit off the kit's trigger line does to the chip. It strikes a voice
  // rather than the melody oscillator, so it sounds whether or not the demo
  // song is running — the same as your hands do.
  private fromDrum(mode: number, tune: number[], gain: number) {
    switch (mode) {
      // The kit clocks the tune: one hit, one step of the ROM, so a sixteen-step
      // pattern plays the melody and the kick decides where the beat is.
      case 1: {
        this.pos = (this.pos + 1) % tune.length
        const step = tune[this.pos]!
        if (step >= 0) {
          this.note = step
          this.harmonize(step)
          this.strike(step, gain)
        }
        // The whole band walks with the step, so the backing follows the kick
        // rather than a clock the tune is no longer keeping.
        this.oomPah()
        return
      }
      case 2: {
        const step = tune[Math.floor(this.rng() * tune.length)]!
        if (step >= 0) this.strike(step, gain)
        return
      }
      case 3:
        this.strike(this.chord[Math.floor(this.rng() * 3)]!, gain)
        return
      default:
        this.strike(this.note >= 0 ? this.note : this.chord[0]!, gain)
    }
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.chipLevel]!
    const rom = ROMS[Math.round(p[IDX.chipTune]!)] ?? ROMS[0]!
    const tune = rom.steps
    const clockX = p[IDX.chipClockX]!
    const baseStarve = p[IDX.chipStarve]!
    const battery = p[IDX.chipBattery]!
    const spot = Math.round(p[IDX.chipBendSpot]!)
    const pot = p[IDX.chipBendPot]!
    const tone = TONE_DUTY[Math.round(p[IDX.chipTone]!)] ?? TONE_DUTY[0]!
    // bias bend drags the duty cycle up from whatever the tone selector taps
    const duty = spot === 3 ? Math.min(tone + pot * 0.45, 0.98) : tone
    const micToRail = Math.round(p[IDX.micPatch]!) === 1
    const fbToRail = ctx.fbDest === 2
    const modClock = ctx.mod.read(DEST.chipClock)
    // A wire onto the supply itself. Everything else on this board is powered
    // from the rail, so this is the one destination that reaches all of them at
    // once: a kick on it browns the toy out on every hit, the LFO on it is a
    // rail that dies in time.
    const modStarve = ctx.mod.read(DEST.starve)
    const accomp = p[IDX.chipAccomp]!
    // Whichever of the kit's voices is bridged onto the gate, and what it plays.
    const trigMask = voiceMask(Math.round(p[IDX.trigToKeys]!))
    const trigNote = Math.round(p[IDX.trigKeysNote]!)
    const drift = p[IDX.chipDrift]!
    const cluster = p[IDX.faultCluster]!
    const couple = p[IDX.couple]!
    const rail = this.rail
    const maxHz = this.sr * 0.49
    const clipHz = p[IDX.chipClipHz]!
    const clipClock = p[IDX.chipClipClock]!
    rail.setBoard(
      battery,
      ctx.heat,
      p[IDX.chipLatch]!,
      cluster,
      p[IDX.chipCap]!,
    )

    if (rom !== this.lastRom) {
      this.lastRom = rom
      this.triads = triadsFor(rom)
      this.chord = this.triads[0]!
    }

    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.restart(tune, true)
    }
    if (this.transport.tune !== this.wasPlaying) {
      this.wasPlaying = this.transport.tune
      if (this.wasPlaying) this.restart(tune)
    }

    for (let i = 0; i < io.n; i++) {
      this.counterFault.step()
      const latched = rail.latched
      // clock bend: the pot shorts the RC — wildly fast and unstable
      let clock = clockX
      if (spot === 1 && pot > 0) {
        this.clockWalk += (this.rng() - 0.5) * pot * 0.2
        this.clockWalk *= 0.999
        clock *= 1 + pot * 24 * (1 + 0.4 * Math.sin(this.clockWalk))
      }
      // The clip landing on the timing pin instead of the supply, which is the
      // other way to move a clock and by far the larger one. Starving the rail
      // is worth a fraction of an octave before the chip stops running at all;
      // hanging a capacitor off the oscillator divides it, and dividing has no
      // such limit. Four octaves at the top of the knob, travelling at whatever
      // rate the found cap charges — the whole timebase going with it, so the
      // tune, the tempo and the envelopes dive together and the melody arrives
      // somewhere under the bottom of the keyboard.
      if (clipClock > 0)
        clock /= 1 + clipClock * CLOCK_DRAG_MAX * rail.clipTravel
      // The toy runs on its own crystal and it wanders. Nothing pulls it back,
      // so it never settles on a ratio with the drum machine — the two lean past
      // each other and come back for as long as you leave it running.
      if (drift > 0) {
        clock *= 1 + this.drift.step(0.08, this.sr, this.rng) * 0.3 * drift
      }
      if (modClock) clock *= Math.pow(2, modClock[i]! * 3)
      // Flat cells slow the divider itself, so the song runs late as well as low.
      const timing = clock * rail.clockFactor

      // sequencer — the run/stop line freezes it where it stands, and so does a
      // latched die: the counter stops clocking and the note it was on stays on
      if (this.transport.tune && !latched) {
        this.stepClock += (rom.stepHz * timing) / this.sr
      }
      if (this.stepClock >= 1) {
        this.stepClock -= 1
        let next = this.pos + 1
        // counter bend: program counter corruption
        if (
          spot === 2 &&
          this.counterFault.roll(pot * 0.7, cluster, this.rng)
        ) {
          next =
            this.rng() < 0.5 ? this.pos : Math.floor(this.rng() * tune.length)
        }
        this.pos = next % tune.length
        // -2 holds whatever is ringing; -1 drops the voice; anything else strikes
        const step = tune[this.pos]!
        if (step >= 0) {
          this.note = step
          this.env = 1
          this.keyNote = step
          this.keyPending = true
          this.harmonize(step)
        } else if (step === -1) {
          this.note = -1
        }

        this.oomPah()
      }

      // The kit's trigger line, bridged onto the gate. The hit is a block old,
      // which is 2.7 ms and nothing a trigger line has ever been able to tell.
      if (trigMask && Math.round(ctx.trig.drumBits[i]!) & trigMask) {
        this.fromDrum(trigNote, tune, Math.min(ctx.trig.drumGain[i]!, 1))
      }

      // gate bend: the gate line buzzes open and shut
      if (spot === 4 && pot > 0) {
        this.gateClock += ((30 + pot * 400) * (0.5 + this.rng())) / this.sr
        if (this.gateClock >= 1) {
          this.gateClock -= 1
          this.gateState =
            this.rng() < 0.5 + pot * 0.3 ? 1 - this.gateState : this.gateState
        }
      } else {
        this.gateState = 1
      }

      // One envelope generator, timed off the ROM's own step rate the way a
      // cheap chip ties decay to its tempo clock. Only a moving clock — the bend
      // walking, the crystal wandering, or a wire on it — makes that a fresh exp
      // every sample; a latch holds the envelope where it stood along with
      // everything else it froze.
      if (timing !== this.lastTiming) {
        this.lastTiming = timing
        this.envDecay = Math.exp(-(0.8 * rom.stepHz * timing) / this.sr)
      }
      const envDecay = latched ? 1 : this.envDecay
      this.env = fade(this.env, envDecay)
      this.bassEnv = fade(this.bassEnv, envDecay)
      this.chordEnv = fade(this.chordEnv, envDecay)
      for (const v of this.voices) if (!v.held) v.env = fade(v.env, envDecay)

      // A latched output stage is jammed on rather than fading with the supply,
      // so the note doesn't get quieter as the rail goes — it holds its level
      // and dives in pitch until there is no rail left to hold it.
      const amp = latched ? LATCH_AMP : rail.ampFactor

      let out = 0
      if (!rail.booting && !rail.dead) {
        const note = this.transport.tune ? this.note : -1
        if (note >= 0 && this.env > ENV_FLOOR) {
          const hz = Math.min(
            BASE_HZ * ratio(note) * clock * rail.pitchFactor,
            maxHz,
          )
          this.phase = (this.phase + hz / this.sr) % 1
          out += pulse(this.phase, duty, hz / this.sr) * this.env * amp
        }
        let keys = 0
        if (accomp > 0) {
          if (this.bassEnv > ENV_FLOOR) {
            const hz = Math.min(
              BASE_HZ *
                ratio(this.bassNote) *
                clock *
                rail.pitchFactorAt(BASS_TRIM),
              maxHz,
            )
            this.bassPhase = (this.bassPhase + hz / this.sr) % 1
            keys +=
              pulse(this.bassPhase, duty, hz / this.sr) *
              this.bassEnv *
              rail.ampFactorAt(BASS_TRIM) *
              accomp
          }
          if (this.chordEnv > ENV_FLOOR) {
            for (let c = 0; c < 3; c++) {
              const trim = CHORD_TRIM[c]!
              const hz = Math.min(
                BASE_HZ *
                  ratio(this.chord[c]!) *
                  clock *
                  rail.pitchFactorAt(trim),
                maxHz,
              )
              this.chordPhase[c] = (this.chordPhase[c]! + hz / this.sr) % 1
              keys +=
                pulse(this.chordPhase[c]!, duty, hz / this.sr) *
                this.chordEnv *
                rail.ampFactorAt(trim) *
                CHORD_GAIN *
                accomp
            }
          }
        }
        for (let k = 0; k < this.voices.length; k++) {
          const v = this.voices[k]!
          if (v.env <= ENV_FLOOR) continue
          const trim = VOICE_TRIM[k]!
          const hz = Math.min(
            BASE_HZ * ratio(v.note) * clock * rail.pitchFactorAt(trim),
            maxHz,
          )
          v.phase = (v.phase + hz / this.sr) % 1
          keys +=
            pulse(v.phase, duty, hz / this.sr) * v.env * rail.ampFactorAt(trim)
        }
        out = (out + mixVoices(keys)) * this.gateState
        if (spot === 3) out += pot * 0.4
      }

      out *= level * 0.4
      // A loop screaming in the top end draws on the same cells the toy runs
      // off, so a squeal that got away browns out the chip that started it.
      const extra =
        (micToRail ? Math.abs(ctx.mic[i]!) * 2 : 0) +
        (fbToRail ? Math.abs(ctx.fb[i]!) * 2 : 0) +
        couple * Math.max(ctx.bright[i]!, 0) * 0.5
      const starve = modStarve
        ? Math.min(Math.max(baseStarve + modStarve[i]!, 0), 1)
        : baseStarve
      rail.tick(Math.abs(out), starve, extra, clipHz, clipClock)
      ctx.railV[i] = rail.v
      ctx.step[i] = this.stepClock
      // The chip's gate, brought out to the bus whether anything is soldered to
      // it or not: a note struck is a note struck, whether the ROM struck it,
      // your hand struck it or a drum hit came back round and struck it.
      if (this.keyPending) {
        ctx.trig.keyStruck(i, this.keyNote)
        this.keyPending = false
      }
      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.note = -1
    this.phase = 0
    this.env = 0
    this.bassEnv = 0
    this.chordEnv = 0
    for (const v of this.voices) {
      v.note = 0
      v.env = 0
      v.held = false
    }
    this.rail.reset()
  }
}
