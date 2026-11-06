import { ACCENT_GAIN } from '../../drums.ts'
import { IDX } from '../../engine/params.ts'
import { cardKey, type CardPrefix, type CardSuffix } from '../../monoCard.ts'
import { MIC, micInto } from '../micJacks.ts'
import { DEST } from '../modbus.ts'
import { BLOCK } from '../stage.ts'
import { SupplyTap, type Supplies } from '../supplies.ts'
import {
  KEY_BIAS,
  SEQ_TO_LEAD,
  SEQ_TO_MONO,
  voiceMask,
  type SeqLine,
} from '../trigbus.ts'
import { removeAt } from '../util/list.ts'
import { MonoVoice } from './monoVoice.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

// The board counts semitones up from A3, the voice counts MIDI notes.
const A3_MIDI = 57
const OUT_TRIM = 0.6
const FALLBACK_STEP_S = 0.125
const CUTOFF_LANE_OCTAVES = 4
const QUEUE_MAX = 32
// The gate of a sliding step stays down past the step's own length, so the
// next step lands while it is still open, swing and all.
const SLIDE_HOLD = 1.5
// The mic on the mixer's external input, level with a full oscillator.
const MIC_IN_GAIN = 1.5

function withLane(base: number, lane: Float32Array | null) {
  return Math.min(Math.max(base + (lane ? lane[0]! : 0), 0), 1)
}

function cardIdx(prefix: CardPrefix) {
  const at = (suffix: CardSuffix) => IDX[cardKey(prefix, suffix)]
  return {
    level: at('Level'),
    supply: at('Supply'),
    keyGate: at('KeyGate'),
    gate: at('Gate'),
    accent: at('Accent'),
    struck: at('Struck'),
    glide: at('Glide'),
    wave1: at('Wave1'),
    wave2: at('Wave2'),
    wave3: at('Wave3'),
    range1: at('Range1'),
    range2: at('Range2'),
    range3: at('Range3'),
    tune2: at('Tune2'),
    tune3: at('Tune3'),
    osc3: at('Osc3'),
    sync: at('Sync'),
    fm: at('Fm'),
    sweep: at('Sweep'),
    drift: at('Drift'),
    mix1: at('Mix1'),
    mix2: at('Mix2'),
    mix3: at('Mix3'),
    noise: at('Noise'),
    loop: at('Loop'),
    cutoff: at('Cutoff'),
    emph: at('Emph'),
    contour: at('Contour'),
    track: at('Track'),
    drive: at('Drive'),
    fA: at('FA'),
    fD: at('FD'),
    fS: at('FS'),
    fR: at('FR'),
    aA: at('AA'),
    aD: at('AD'),
    aS: at('AS'),
    aR: at('AR'),
    modMix: at('ModMix'),
    modPitch: at('ModPitch'),
    modFilter: at('ModFilter'),
    heat: at('Heat'),
    leak: at('Leak'),
    cap: at('Cap'),
    mismatch: at('Mismatch'),
    droop: at('Droop'),
    dacBit: at('DacBit'),
    sag: at('Sag'),
    loopPitch: at('LoopPitch'),
    choke: at('Choke'),
    regTrip: at('RegTrip'),
    thump: at('Thump'),
    fold: at('Fold'),
  }
}

// Where each build of the card is wired: its controls, its lanes on the bay,
// its mic jack, the memory line it plays, and the Plays on choice that hands it
// Growler's line. Growler's own line can be aimed away; Howler's cannot.
export const GROWLER = {
  label: 'monoSynth',
  k: cardIdx('mono'),
  dest: {
    emph: DEST.monoEmph,
    loopPitch: DEST.monoLoopPitch,
    choke: DEST.monoChoke,
    regTrip: DEST.monoRegTrip,
    pitch: DEST.monoPitch,
    cutoff: DEST.monoCutoff,
  },
  mic: MIC.growlerIn,
  line: 'seq',
  playsOn: SEQ_TO_MONO,
} as const

export const HOWLER = {
  label: 'leadSynth',
  k: cardIdx('lead'),
  dest: {
    emph: DEST.leadEmph,
    loopPitch: DEST.leadLoopPitch,
    choke: DEST.leadChoke,
    regTrip: DEST.leadRegTrip,
    pitch: DEST.leadPitch,
    cutoff: DEST.leadCutoff,
  },
  mic: MIC.howlerIn,
  line: 'leadSeq',
  playsOn: SEQ_TO_LEAD,
} as const

export type Card = typeof GROWLER | typeof HOWLER

// The voice card of a three-oscillator monosynth, wired onto the toy's supply
// and its gate line. Keys from its own bed and a controller arrive with their
// key-ups; strikes off the gate line and the kit's trigger lines have none, so
// the gate closes after a fraction of the toy's sequencer step.
export class MonoSynth implements Stage {
  readonly label: string

  private readonly voice: MonoVoice
  private readonly buf = new Float32Array(BLOCK)
  private readonly cutoffLane = new Float32Array(BLOCK)
  private readonly queued: { note: number; on: boolean; gain: number }[] = []
  private readonly gateHeld: number[] = []
  private readonly keysDown: number[] = []
  private lastNote = A3_MIDI
  private gateNote = -1
  private gateLeft = 0
  private lastPhase = 0
  private sinceWrap = 0
  private stepSamples: number
  private gateLength = 0
  private slideNext = false
  private from = 0
  private pitchLane: Float32Array | null = null
  private cutLane: Float32Array | null = null
  private ext: Float32Array | null = null

  private readonly sr: number
  private readonly power: SupplyTap
  private readonly card: Card

  constructor(sr: number, supplies: Supplies, card: Card = GROWLER) {
    this.sr = sr
    this.card = card
    this.label = card.label
    this.power = new SupplyTap(supplies)
    this.voice = new MonoVoice(sr)
    this.stepSamples = FALLBACK_STEP_S * sr
  }

  when(p: Float32Array) {
    return p[this.card.k.level]! > 0
  }

  noteOn(semitone: number, gain = 1) {
    const note = semitone + A3_MIDI
    this.dropGateHeld(note)
    this.enqueue(note, true, gain)
  }

  noteOff(semitone: number) {
    this.enqueue(semitone + A3_MIDI, false, 0)
  }

  // With the level at the floor the chain steps over this stage and nothing
  // drains the queue, so it keeps one event per note, latest wins.
  private enqueue(note: number, on: boolean, gain: number) {
    const q = this.queued
    let k = 0
    for (const e of q) if (e.note !== note) q[k++] = e
    q.length = k
    if (k >= QUEUE_MAX) q.shift()
    q.push({ note, on, gain })
  }

  /** The toy's key coming up. It ends only a note the gate is holding, so it
      still reaches one held across a cut jumper and never one on these keys. */
  gateOff(semitone: number) {
    if (this.dropGateHeld(semitone + A3_MIDI)) this.noteOff(semitone)
  }

  private dropGateHeld(note: number): boolean {
    const i = this.gateHeld.indexOf(note)
    if (i < 0) return false
    removeAt(this.gateHeld, i)
    return true
  }

  soundingNotes(out: Int16Array): number {
    const note = this.voice.sounding
    if (note < 0) return 0
    out[0] = note - A3_MIDI
    return 1
  }

  private patch(p: Float32Array, ctx: Ctx) {
    const { k, dest, mic } = this.card
    const v = this.voice.patch
    v.wave[0] = Math.round(p[k.wave1]!)
    v.wave[1] = Math.round(p[k.wave2]!)
    v.wave[2] = Math.round(p[k.wave3]!)
    v.range[0] = Math.round(p[k.range1]!)
    v.range[1] = Math.round(p[k.range2]!)
    v.range[2] = Math.round(p[k.range3]!)
    v.fine[1] = p[k.tune2]!
    v.fine[2] = p[k.tune3]!
    v.level[0] = p[k.mix1]!
    v.level[1] = p[k.mix2]!
    v.level[2] = p[k.mix3]!
    v.noise = p[k.noise]!
    v.loop = p[k.loop]!
    const osc3 = Math.round(p[k.osc3]!)
    v.osc3Free = osc3 >= 1
    v.osc3Lo = osc3 === 2
    v.sync = Math.round(p[k.sync]!)
    v.linFm = p[k.fm]!
    v.envOsc2 = p[k.sweep]!
    v.drift = p[k.drift]!
    v.cutoff = p[k.cutoff]!
    const emphLane = ctx.mod.read(dest.emph)
    v.emphasis = Math.min(
      Math.max(p[k.emph]! + (emphLane ? emphLane[0]! * 1.1 : 0), 0),
      1.1,
    )
    v.contour = p[k.contour]!
    v.track = p[k.track]!
    v.drive = p[k.drive]!
    v.fA = p[k.fA]!
    v.fD = p[k.fD]!
    v.fS = p[k.fS]!
    v.fR = p[k.fR]!
    v.aA = p[k.aA]!
    v.aD = p[k.aD]!
    v.aS = p[k.aS]!
    v.aR = p[k.aR]!
    v.glide = p[k.glide]!
    v.modAmt = 1
    v.modMix = p[k.modMix]!
    v.modPitch = p[k.modPitch]!
    v.modFilter = p[k.modFilter]!
    v.heat = Math.min(p[k.heat]! + 0.3 * ctx.heat, 1)
    v.vcaLeak = p[k.leak]!
    v.envCap = p[k.cap]!
    v.mismatch = p[k.mismatch]!
    v.droop = p[k.droop]!
    v.dacBit = Math.round(p[k.dacBit]!) - 1
    v.sag = p[k.sag]!
    v.accent = p[k.accent]!
    v.loopPitch = withLane(p[k.loopPitch]!, ctx.mod.read(dest.loopPitch))
    v.choke = withLane(p[k.choke]!, ctx.mod.read(dest.choke))
    v.regTrip = withLane(p[k.regTrip]!, ctx.mod.read(dest.regTrip))
    v.thump = p[k.thump]!
    v.fold = p[k.fold]!
    this.ext = micInto(p, ctx, mic)
    v.ext = this.ext ? MIC_IN_GAIN : 0
  }

  private strike(
    note: number,
    held: boolean,
    gain = 1,
    length = this.gateLength,
    accent = false,
  ) {
    const voice = this.voice
    this.lastNote = note
    this.slideNext = false
    voice.noteOn(note, gain, accent)
    if (held) {
      if (!this.gateHeld.includes(note)) this.gateHeld.push(note)
      return
    }
    if (this.gateNote >= 0 && this.gateNote !== note) {
      this.release(this.gateNote)
    }
    this.gateNote = note
    this.gateLeft = length
  }

  private sing(line: SeqLine, i: number, p: Float32Array) {
    const note = line.key[i]! - KEY_BIAS + A3_MIDI
    const span = line.span[i]!
    const accent = line.accent[i]! > 0
    const slides = line.slide[i]! > 0
    const length = Math.max(
      slides ? span * SLIDE_HOLD : span * p[this.card.k.gate]!,
      1,
    )
    const from = this.gateNote
    if (this.slideNext && from >= 0) {
      if (note !== from) {
        this.voice.noteOn(note, 1, accent, true)
        this.release(from)
        this.gateNote = note
        this.lastNote = note
      }
      this.gateLeft = length
    } else {
      this.strike(note, false, 1, length, accent)
    }
    this.slideNext = slides
  }

  /** The gate letting go of a note, which a key still down on it outlasts. */
  private release(note: number) {
    if (!this.gateHeld.includes(note) && !this.keysDown.includes(note)) {
      this.voice.noteOff(note)
    }
  }

  private run(to: number) {
    if (to <= this.from) return
    this.voice.render(
      this.buf,
      this.from,
      to,
      this.ext,
      this.pitchLane,
      this.cutLane,
    )
    this.from = to
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const { k, dest, line, playsOn } = this.card
    const rail = this.power.pick(p[k.supply]!)
    const voice = this.voice
    if (this.power.rebooted()) {
      voice.allOff()
      this.gateNote = -1
      this.queued.length = 0
      this.gateHeld.length = 0
      this.keysDown.length = 0
    }
    this.patch(p, ctx)
    voice.bend = 12 * Math.log2(rail.pitchFactor)

    for (const q of this.queued) {
      const down = this.keysDown.indexOf(q.note)
      if (q.on) {
        this.lastNote = q.note
        if (down < 0) this.keysDown.push(q.note)
        voice.noteOn(q.note, q.gain)
      } else {
        if (down >= 0) removeAt(this.keysDown, down)
        voice.noteOff(q.note)
      }
    }
    this.queued.length = 0

    const pitchLane = ctx.mod.read(dest.pitch)
    const cutLane = ctx.mod.read(dest.cutoff)
    if (cutLane) {
      for (let i = 0; i < io.n; i++) {
        this.cutoffLane[i] = cutLane[i]! * CUTOFF_LANE_OCTAVES
      }
    }

    const lineKeys = ctx.trig.keyLine(p[k.keyGate]!)
    const lineHeld = ctx.trig.heldLine(p[k.keyGate]!)
    const aimed = Math.round(p[IDX.monoSeqTo]!) === playsOn
    const own = line === 'seq' && !aimed ? null : ctx.trig[line]
    const lent = line !== 'seq' && aimed ? ctx.trig.seq : null
    const drumMask = voiceMask(Math.round(p[k.struck]!))
    const gate = p[k.gate]!
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

      const key = lineKeys ? lineKeys[i]! : 0
      const sung =
        own && own.key[i]! !== 0
          ? own
          : lent && lent.key[i]! !== 0
            ? lent
            : null
      const bits =
        drumMask !== 0 ? Math.round(ctx.trig.drumBits[i]!) & drumMask : 0
      const closing = this.gateNote >= 0 && --this.gateLeft <= 0
      if (key === 0 && !sung && bits === 0 && !closing) continue

      this.run(i)
      if (key !== 0) {
        this.strike(key - KEY_BIAS + A3_MIDI, lineHeld[i]! > 0)
      } else if (sung) {
        this.sing(sung, i, p)
      } else if (bits !== 0) {
        const gain = Math.min(ctx.trig.drumGain[i]! / ACCENT_GAIN, 1)
        this.strike(this.lastNote, false, gain)
      } else if (closing) {
        this.release(this.gateNote)
        this.gateNote = -1
      }
    }
    this.run(io.n)

    const amp = rail.ampFactor * p[k.level]! * OUT_TRIM
    let load = 0
    for (let i = 0; i < io.n; i++) {
      const out = this.buf[i]! * amp
      load += out < 0 ? -out : out
      io.l[i]! += out
      io.r[i]! += out
    }
    rail.drawing += load / io.n
  }

  panic() {
    this.voice.panic()
    this.queued.length = 0
    this.gateHeld.length = 0
    this.keysDown.length = 0
    this.gateNote = -1
    this.gateLeft = 0
    this.slideNext = false
  }
}
