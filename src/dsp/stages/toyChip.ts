import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'
import type { Transport } from '../transport'
import { softclip } from '../util/softclip'
import { mulberry32, type Rng } from '../util/rng'
import { ROMS, type Rom } from './roms'

const BASE_HZ = 220
const ENV_FLOOR = 0.003

// The tone selector taps the divider chain at a different width. Narrow pulses
// null different harmonics; none of them is compensated for level, exactly as
// the cheap chips left them.
export const TONE_DUTY = [0.5, 0.25, 0.125, 0.0625]

// Four notes, as the toys of the era had.
const VOICE_TRIM = [0.86, 1.21, 0.97, 1.12]

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
    note: -1,
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
  private rng: Rng

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
    private readonly transport: Transport,
  ) {
    this.rng = mulberry32(101)
  }

  noteOn(semitone: number) {
    const v = this.pick(semitone)
    v.note = semitone
    v.env = 1
    v.held = true
    v.started = this.voiceClock++
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

  private restart(tune: number[]) {
    this.pos = 0
    this.stepClock = 0
    const step = tune[0]!
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

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const level = p[IDX.chipLevel]!
    const rom = ROMS[Math.round(p[IDX.chipTune]!)] ?? ROMS[0]!
    const tune = rom.steps
    const clockX = p[IDX.chipClockX]!
    const starve = p[IDX.chipStarve]!
    const spot = Math.round(p[IDX.chipBendSpot]!)
    const pot = p[IDX.chipBendPot]!
    const tone = TONE_DUTY[Math.round(p[IDX.chipTone]!)] ?? TONE_DUTY[0]!
    // bias bend drags the duty cycle up from whatever the tone selector taps
    const duty = spot === 3 ? Math.min(tone + pot * 0.45, 0.98) : tone
    const micToRail = p[IDX.micPatch] === 1
    const fbToRail = Math.round(p[IDX.fbDest]!) === 2
    const modClock = ctx.mod.read(DEST.chipClock)
    const accomp = p[IDX.chipAccomp]!
    const rail = this.rail
    const maxHz = this.sr * 0.49

    if (rom !== this.lastRom) {
      this.lastRom = rom
      this.triads = triadsFor(rom)
      this.chord = this.triads[0]!
    }

    // a reboot, and pressing play, both drop the needle on step 0
    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      this.restart(tune)
    }
    if (this.transport.playing !== this.wasPlaying) {
      this.wasPlaying = this.transport.playing
      if (this.wasPlaying) this.restart(tune)
    }

    for (let i = 0; i < io.n; i++) {
      // clock bend: the pot shorts the RC — wildly fast and unstable
      let clock = clockX
      if (spot === 1 && pot > 0) {
        this.clockWalk += (this.rng() - 0.5) * pot * 0.2
        this.clockWalk *= 0.999
        clock *= 1 + pot * 24 * (1 + 0.4 * Math.sin(this.clockWalk))
      }
      if (modClock) clock *= Math.pow(2, modClock[i]! * 3)

      // sequencer — the run/stop line freezes it where it stands
      if (this.transport.playing) this.stepClock += (rom.stepHz * clock) / this.sr
      if (this.stepClock >= 1) {
        this.stepClock -= 1
        let next = this.pos + 1
        // counter bend: program counter corruption
        if (spot === 2 && this.rng() < pot * 0.7) {
          next = this.rng() < 0.5 ? this.pos : Math.floor(this.rng() * tune.length)
        }
        this.pos = next % tune.length
        // -2 holds whatever is ringing; -1 drops the voice; anything else strikes
        const step = tune[this.pos]!
        if (step >= 0) {
          this.note = step
          this.env = 1
          this.harmonize(step)
        } else if (step === -1) {
          this.note = -1
        }

        // oom-pah off the same step clock: bass on the step, chord on the
        // offbeat, the bass alternating root and fifth the way the toys walked it
        if (this.pos % 2 === 0) {
          this.bassNote = (this.bassFifth ? this.chord[2]! : this.chord[0]!) - 12
          this.bassFifth = !this.bassFifth
          this.bassEnv = 1
        } else {
          this.chordEnv = 1
        }
      }

      // gate bend: the gate line buzzes open and shut
      if (spot === 4 && pot > 0) {
        this.gateClock += ((30 + pot * 400) * (0.5 + this.rng())) / this.sr
        if (this.gateClock >= 1) {
          this.gateClock -= 1
          this.gateState = this.rng() < 0.5 + pot * 0.3 ? 1 - this.gateState : this.gateState
        }
      } else {
        this.gateState = 1
      }

      // one envelope generator, timed off the ROM's own step rate the way a
      // cheap chip ties decay to its tempo clock
      const envDecay = Math.exp(-(0.8 * rom.stepHz * clock) / this.sr)
      this.env *= envDecay
      this.bassEnv *= envDecay
      this.chordEnv *= envDecay
      for (const v of this.voices) if (!v.held) v.env *= envDecay

      let out = 0
      if (!rail.booting && !(starve > 0 && rail.stalled)) {
        const note = this.transport.playing ? this.note : -1
        if (note >= 0 && this.env > ENV_FLOOR) {
          const hz = Math.min(BASE_HZ * Math.pow(2, note / 12) * clock * rail.pitchFactor, maxHz)
          this.phase = (this.phase + hz / this.sr) % 1
          out += pulse(this.phase, duty, hz / this.sr) * this.env * rail.ampFactor
        }
        let keys = 0
        if (accomp > 0) {
          if (this.bassEnv > ENV_FLOOR) {
            const hz = Math.min(
              BASE_HZ * Math.pow(2, this.bassNote / 12) * clock * rail.pitchFactorAt(BASS_TRIM),
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
                BASE_HZ * Math.pow(2, this.chord[c]! / 12) * clock * rail.pitchFactorAt(trim),
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
          if (v.note < 0 || v.env <= ENV_FLOOR) continue
          const trim = VOICE_TRIM[k]!
          const hz = Math.min(
            BASE_HZ * Math.pow(2, v.note / 12) * clock * rail.pitchFactorAt(trim),
            maxHz,
          )
          v.phase = (v.phase + hz / this.sr) % 1
          keys += pulse(v.phase, duty, hz / this.sr) * v.env * rail.ampFactorAt(trim)
        }
        out = (out + mixVoices(keys)) * this.gateState
        if (spot === 3) out += pot * 0.4
      }

      out *= level * 0.4
      const extra =
        (micToRail ? Math.abs(ctx.mic[i]!) * 2 : 0) + (fbToRail ? Math.abs(ctx.fb[i]!) * 2 : 0)
      rail.tick(Math.abs(out), starve, extra)
      ctx.railV[i] = rail.v
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
      v.note = -1
      v.env = 0
      v.held = false
    }
    this.rail.reset()
  }
}
