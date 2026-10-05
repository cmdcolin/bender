import { ACCENT_GAIN } from '../../drums'
import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import { BLOCK } from '../stage'
import { KEY_BIAS, voiceMask } from '../trigbus'
import { MonoVoice } from './monoVoice'

import type { Ctx, Stage, StereoBlock } from '../stage'
import type { ToyRail } from '../toyRail'

// The board counts semitones up from A3, the voice counts MIDI notes.
const A3_MIDI = 57
const OUT_TRIM = 0.6
const FALLBACK_STEP_S = 0.125
const CUTOFF_LANE_OCTAVES = 4

// The voice card of a three-oscillator monosynth, wired onto the toy's supply
// and its gate line. Keys from its own bed and a controller arrive with their
// key-ups; strikes off the gate line and the kit's trigger lines have none, so
// the gate closes after a fraction of the toy's sequencer step.
export class MonoSynth implements Stage {
  label = 'monoSynth'

  private readonly voice: MonoVoice
  private readonly buf = new Float32Array(BLOCK)
  private readonly cutoffLane = new Float32Array(BLOCK)
  private readonly queued: { note: number; on: boolean; gain: number }[] = []
  private lastReboot = 0
  private lastNote = A3_MIDI
  private gateNote = -1
  private gateLeft = 0
  private lastPhase = 0
  private sinceWrap = 0
  private stepSamples: number
  private gateLength = 0
  private from = 0
  private pitchLane: Float32Array | null = null
  private cutLane: Float32Array | null = null

  constructor(
    private readonly sr: number,
    private readonly rail: ToyRail,
  ) {
    this.voice = new MonoVoice(sr)
    this.stepSamples = FALLBACK_STEP_S * sr
  }

  when(p: Float32Array) {
    return p[IDX.monoLevel]! > 0
  }

  noteOn(semitone: number, gain = 1) {
    this.queued.push({ note: semitone + A3_MIDI, on: true, gain })
  }

  noteOff(semitone: number) {
    this.queued.push({ note: semitone + A3_MIDI, on: false, gain: 0 })
  }

  soundingNotes(out: Int16Array): number {
    const note = this.voice.sounding
    if (note < 0) return 0
    out[0] = note - A3_MIDI
    return 1
  }

  private patch(p: Float32Array, ctx: Ctx) {
    const v = this.voice.patch
    v.wave[0] = Math.round(p[IDX.monoWave1]!)
    v.wave[1] = Math.round(p[IDX.monoWave2]!)
    v.wave[2] = Math.round(p[IDX.monoWave3]!)
    v.range[0] = Math.round(p[IDX.monoRange1]!)
    v.range[1] = Math.round(p[IDX.monoRange2]!)
    v.range[2] = Math.round(p[IDX.monoRange3]!)
    v.fine[1] = p[IDX.monoTune2]!
    v.fine[2] = p[IDX.monoTune3]!
    v.level[0] = p[IDX.monoMix1]!
    v.level[1] = p[IDX.monoMix2]!
    v.level[2] = p[IDX.monoMix3]!
    v.noise = p[IDX.monoNoise]!
    v.loop = p[IDX.monoLoop]!
    const osc3 = Math.round(p[IDX.monoOsc3]!)
    v.osc3Free = osc3 >= 1
    v.osc3Lo = osc3 === 2
    v.sync = p[IDX.monoSync]! > 0.5
    v.envOsc2 = p[IDX.monoSweep]!
    v.drift = p[IDX.monoDrift]!
    v.cutoff = p[IDX.monoCutoff]!
    const emphLane = ctx.mod.read(DEST.monoEmph)
    v.emphasis = Math.min(
      Math.max(p[IDX.monoEmph]! + (emphLane ? emphLane[0]! * 1.1 : 0), 0),
      1.1,
    )
    v.contour = p[IDX.monoContour]!
    v.track = p[IDX.monoTrack]!
    v.drive = p[IDX.monoDrive]!
    v.fA = p[IDX.monoFA]!
    v.fD = p[IDX.monoFD]!
    v.fS = p[IDX.monoFS]!
    v.fR = p[IDX.monoFR]!
    v.aA = p[IDX.monoAA]!
    v.aD = p[IDX.monoAD]!
    v.aS = p[IDX.monoAS]!
    v.aR = p[IDX.monoAR]!
    v.glide = p[IDX.monoGlide]!
    v.modAmt = 1
    v.modMix = p[IDX.monoModMix]!
    v.modPitch = p[IDX.monoModPitch]!
    v.modFilter = p[IDX.monoModFilter]!
    v.heat = Math.min(p[IDX.monoHeat]! + 0.3 * ctx.heat, 1)
    v.vcaLeak = p[IDX.monoLeak]!
    v.envCap = p[IDX.monoCap]!
    v.mismatch = p[IDX.monoMismatch]!
    v.droop = p[IDX.monoDroop]!
    v.dacBit = Math.round(p[IDX.monoDacBit]!) - 1
    v.sag = p[IDX.monoSag]!
  }

  private strike(note: number, held: boolean, gain = 1) {
    const voice = this.voice
    this.lastNote = note
    voice.noteOn(note, gain)
    if (held) return
    if (this.gateNote >= 0 && this.gateNote !== note) {
      voice.noteOff(this.gateNote)
    }
    this.gateNote = note
    this.gateLeft = this.gateLength
  }

  private run(to: number) {
    if (to <= this.from) return
    this.voice.render(
      this.buf,
      this.from,
      to,
      null,
      this.pitchLane,
      this.cutLane,
    )
    this.from = to
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const rail = this.rail
    const voice = this.voice
    if (rail.rebootCount !== this.lastReboot) {
      this.lastReboot = rail.rebootCount
      voice.allOff()
      this.gateNote = -1
      this.queued.length = 0
    }
    this.patch(p, ctx)
    voice.bend = 12 * Math.log2(rail.pitchFactor)

    for (const q of this.queued) {
      if (q.on) {
        this.lastNote = q.note
        voice.noteOn(q.note, q.gain)
      } else voice.noteOff(q.note)
    }
    this.queued.length = 0

    const pitchLane = ctx.mod.read(DEST.monoPitch)
    const cutLane = ctx.mod.read(DEST.monoCutoff)
    if (cutLane) {
      for (let i = 0; i < io.n; i++) {
        this.cutoffLane[i] = cutLane[i]! * CUTOFF_LANE_OCTAVES
      }
    }

    const gateOn = p[IDX.monoKeyGate]! < 0.5
    const drumMask = voiceMask(Math.round(p[IDX.monoStruck]!))
    const gate = p[IDX.monoGate]!
    this.gateLength = Math.max(gate * this.stepSamples, 1)

    this.from = 0
    this.pitchLane = pitchLane
    this.cutLane = cutLane ? this.cutoffLane : null

    for (let i = 0; i < io.n; i++) {
      const phase = ctx.step[i]!
      this.sinceWrap++
      if (phase < this.lastPhase - 0.5) {
        if (this.sinceWrap > 0.02 * this.sr) this.stepSamples = this.sinceWrap
        this.sinceWrap = 0
      }
      this.lastPhase = phase

      const key = gateOn ? ctx.trig.key[i]! : 0
      const bits =
        drumMask !== 0 ? Math.round(ctx.trig.drumBits[i]!) & drumMask : 0
      const closing = this.gateNote >= 0 && --this.gateLeft <= 0
      if (key === 0 && bits === 0 && !closing) continue

      this.run(i)
      if (key !== 0) {
        this.strike(key - KEY_BIAS + A3_MIDI, ctx.trig.keyHeld[i]! > 0)
      } else if (bits !== 0) {
        const gain = Math.min(ctx.trig.drumGain[i]! / ACCENT_GAIN, 1)
        this.strike(this.lastNote, false, gain)
      } else if (closing) {
        voice.noteOff(this.gateNote)
        this.gateNote = -1
      }
    }
    this.run(io.n)

    const amp = rail.ampFactor * p[IDX.monoLevel]! * OUT_TRIM
    let load = 0
    for (let i = 0; i < io.n; i++) {
      const out = this.buf[i]! * amp
      load += out < 0 ? -out : out
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.reported += load / io.n
  }

  panic() {
    this.voice.panic()
    this.queued.length = 0
    this.gateNote = -1
    this.gateLeft = 0
  }
}
