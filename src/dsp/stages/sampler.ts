import { IDX } from '../../engine/params.ts'
import { DEST } from '../modbus.ts'
import { N_DRUM_VOICES, voiceMask } from '../trigbus.ts'
import { Transient } from '../util/follower.ts'
import { lpCoef, OnePoleLP } from '../util/onepole.ts'
import { octaves } from '../util/pitch.ts'
import { mulberry32, type Rng } from '../util/rng.ts'
import { softclip } from '../util/softclip.ts'

import type { Ctx, Stage, StereoBlock } from '../stage.ts'

// Past the voices and the whole kit, the two lines that aren't the kit at all.
// The offsets are the tail of sampleTrig's own choices, which is a different
// tail from the trigger patch's — a test pins each to the label it decodes.
export const KEY_CHOICE = N_DRUM_VOICES + 2
export const MIC_CHOICE = N_DRUM_VOICES + 3

// How many bins the reel is drawn in. A number of columns rather than a
// resolution: the panel is a few hundred pixels wide however long the tape is,
// so a bin is one column of it and 90 seconds and 4 seconds cost the same.
export const PEAK_BINS = 256

// What the record head does to a tape on the way down. The oxide takes the top
// off whatever passes, so Wear is a low-pass the signal goes through each time
// it is written, sweeping from nearly open to a telephone. Hiss is noise laid
// onto the medium, coloured by the bias lowpass; it goes down with everything
// else, so every lap re-records the last lap's hiss under a fresh one. The
// square keeps the bottom of the knob quiet and full is -26 dBFS.
const WORN_TOP_HZ = 18000
const WORN_FLOOR = 0.05
const HISS_FULL = 0.05
const HISS_COLOR = 0.35

// Hold turns the write up by how far it fell short of what was under the head,
// measured as two slow envelopes. It only ever turns up, so a loud new layer
// goes on untouched, and it stops at double so a loop faded on purpose is not
// pulled back from the floor.
const HOLD_HZ = 10
const HOLD_MAX = 2

// The smallest window the handles can pinch the loop down to. Two frames is a
// tone rather than a loop, and this board is happy to make one — what it must
// not do is divide by nothing.
const MIN_WINDOW = 2

// The longest blank reel the Reel length knob threads.
const MAX_REEL_S = 20

// A take shorter than this is a stutter rather than a loop, and the key that
// closes it is more likely a double press than a decision.
const MIN_TAKE_S = 0.05

// The two markers as frames. They round outward — the in point down, the out
// point up — so a window is never narrower than the tape you asked for, and
// only the in point is held back from the end: an out point clamped off the end
// of the reel is a full-reel loop that splices two frames early, which is a
// click once a lap on material that had none.
const frameIn = (at: number, n: number) =>
  Math.min(Math.max(Math.floor(at * n), 0), n - MIN_WINDOW)
const frameOut = (at: number, n: number, from: number) =>
  Math.min(Math.max(Math.ceil(at * n), from + MIN_WINDOW), n)

/** The envelope of a clip in `PEAK_BINS` bins, for whatever draws the reel. */
export function peaksOf(
  mono: Float32Array,
  out = new Float32Array(PEAK_BINS),
): Float32Array {
  out.fill(0)
  const n = mono.length
  for (let i = 0; i < n; i++) {
    const bin = ((i * PEAK_BINS) / n) | 0
    const v = mono[i]! < 0 ? -mono[i]! : mono[i]!
    if (v > out[bin]!) out[bin] = v
  }
  return out
}

// A dropped audio file at bendable speed: looping through the chain, or waiting
// on a trigger line the way the kit's own voices do. Struck, it is a seventh
// drum voice — whatever you dropped, played from the top on every hit.
//
// It is also the tape, because the record head is on it. Armed, it lays the
// board's own output back down on the spot the play head is reading, so what
// comes round next pass has been through the mix bus, the bends, the pedals and
// the tape machine — and then goes through all of them again. Nothing here
// stands in for generation loss by default: the loop is genuinely re-recorded
// every lap, so what the board does to a signal is what a lap costs, and thirty
// laps of it is thirty laps of the real thing rather than a decay coefficient
// standing in for one. Wear and Hiss add the head's own share to each lap. Which also means a bend in the path makes the loop diverge rather than
// decay, and that is the difference between this and a delay.
export class Sampler implements Stage {
  label = 'sampler'
  private buf: Float32Array | null = null
  private pos = 0
  private playing = true
  private micTrig: Transient
  private readonly wear = new OnePoleLP()
  private readonly hissColor = new OnePoleLP()
  private envOld = 0
  private envLaid = 0
  // A first take is open from the moment the head threads a blank reel until
  // somebody closes it, and the loop is as long as the take was. A take that
  // reaches the end of the reel closes itself there.
  private taking = false
  private armed = false
  // One level of undo, held as the tape's other state: undoing swaps it with
  // the reel, so undoing again is redo.
  private undoBuf: Float32Array
  private undoLen = 0
  private undone = false
  private readonly hissRng: Rng = mulberry32(0x7a9e)
  // What the tape looks like, kept out here for the panel to draw. Written as
  // the head passes rather than rescanned: the record head rewrites the reel
  // under it every lap, and a loop you cannot watch going round is the one
  // thing a loop machine must not be.
  readonly peaks = new Float32Array(PEAK_BINS)
  private binMax = 0
  private binAt = -1
  // Where the window actually stood at the end of the last block, as fractions
  // of the reel. The knobs are only half the answer once a wire is on the
  // markers, and the panel draws the tape rather than the controls.
  private winIn = 0
  private winOut = 1

  private readonly sr: number
  private readonly blank: Float32Array

  constructor(sr: number) {
    this.sr = sr
    this.micTrig = new Transient(sr)
    this.blank = new Float32Array(Math.round(MAX_REEL_S * sr))
    this.undoBuf = new Float32Array(this.blank.length)
  }

  /** Whether the reel is a first take still going on, with no end yet. */
  get open(): boolean {
    return this.taking
  }

  /** 0 with nothing to undo, 1 with a take to undo, 2 with one to redo. */
  get undoState(): number {
    return this.undoLen === 0 ? 0 : this.undone ? 2 : 1
  }

  /** The tape itself, for the one thing on the board that reads it rather
      than plays it: the home keyboard, whose sampled voice walks this buffer
      with its own counter at its own rate. Null with nothing threaded. */
  get mono(): Float32Array | null {
    return this.buf
  }

  /** Frames on the tape, 0 when there is none threaded. */
  get frames(): number {
    return this.buf?.length ?? 0
  }

  /** Where the play head stands, 0..1 over the whole reel. */
  get head(): number {
    const n = this.frames
    return n > 0 ? this.pos / n : 0
  }

  /** Whether the reel is turning, as against a one-shot that has run out. */
  get rolling(): boolean {
    return this.playing
  }

  // The stretch of reel that came round last block, which is what the two knobs
  // say until a wire lands on them and what the wire says after that. A stage
  // the level has skipped keeps the last one: the tape stopped, and this is
  // where it stopped.
  get windowIn(): number {
    return this.winIn
  }

  get windowOut(): number {
    return this.winOut
  }

  // The envelope comes in already worked out where there is somewhere better to
  // work it out: a dropped file is scanned on the main thread on its way over,
  // because a scan of 90 seconds is several audio blocks long and the audio
  // thread has no several blocks to give. Offline callers hand over the buffer
  // alone and pay for the scan where nothing is listening.
  setBuffer(mono: Float32Array, peaks?: Float32Array) {
    this.buf = mono
    this.pos = 0
    this.playing = true
    this.taking = false
    this.undoLen = 0
    this.binAt = -1
    if (peaks) this.peaks.set(peaks)
    else peaksOf(mono, this.peaks)
  }

  /** Drop the needle at a spot on the reel, 0..1 over the whole of it. */
  seek(frac: number) {
    const n = this.frames
    if (n < 2) return
    this.pos = Math.min(Math.max(frac, 0), 0.999999) * n
    this.playing = true
    this.binAt = -1
  }

  // True whenever there is a file and a level, playing or not: a stage skipped is
  // a stage that never sees the hit that would start it. An armed record head
  // counts too — a blank tape with the level down is what you thread before
  // there is anything to hear.
  when(p: Float32Array) {
    return (
      (p[IDX.sampleLevel]! > 0 && this.buf !== null) ||
      p[IDX.loopRec]! > 0 ||
      this.armed ||
      this.taking
    )
  }

  // Threading a blank tape, cut from the reel the constructor laid by so
  // nothing that size allocates inside a block. The length is read here and
  // not again: a reel you have recorded on is the length it is, and a knob that
  // resized it would be throwing the take away.
  private thread(secs: number) {
    const n = Math.min(
      Math.max(Math.round(secs * this.sr), 2),
      this.blank.length,
    )
    this.buf = this.blank.subarray(0, n)
    this.pos = 0
    this.playing = true
    this.taking = true
    this.undoLen = 0
    this.binAt = -1
    this.peaks.fill(0)
  }

  /** Ends a first take where the head stands: the reel is cut to what has
      been played and the head starts it round from the top. */
  closeTake() {
    const buf = this.buf
    if (!this.taking || !buf) return
    const len = Math.min(
      Math.max(Math.floor(this.pos), Math.round(MIN_TAKE_S * this.sr)),
      buf.length,
    )
    this.buf = buf.subarray(0, len)
    this.pos = 0
    this.taking = false
    this.binAt = -1
    peaksOf(this.buf, this.peaks)
  }

  /** Swaps the reel with the copy made when the record head was last armed. */
  undo() {
    const buf = this.buf
    if (!buf || this.undoLen === 0 || buf.length !== this.undoLen) return
    const other = this.undoBuf
    for (let i = 0; i < buf.length; i++) {
      const was = buf[i]!
      buf[i] = other[i]!
      other[i] = was
    }
    this.undone = !this.undone
    this.binAt = -1
    peaksOf(buf, this.peaks)
  }

  private snapshot(buf: Float32Array) {
    if (this.undoBuf.length < buf.length)
      this.undoBuf = new Float32Array(buf.length)
    this.undoBuf.set(buf)
    this.undoLen = buf.length
    this.undone = false
  }

  private struck(trig: number, ctx: Ctx, i: number): boolean {
    if (trig === MIC_CHOICE) return this.micTrig.process(ctx.mic[i]!, 0.05)
    if (trig === KEY_CHOICE) return ctx.trig.key[i]! > 0
    return (Math.round(ctx.trig.drumBits[i]!) & voiceMask(trig)) !== 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const rec = p[IDX.loopRec]!
    if (rec > 0 && !this.buf) this.thread(p[IDX.loopSecs]!)
    if (this.taking && rec <= 0) this.closeTake()
    if (rec > 0 && !this.armed && !this.taking && this.buf)
      this.snapshot(this.buf)
    this.armed = rec > 0
    const buf = this.buf
    if (!buf || buf.length < 2) return
    const n = buf.length
    const level = p[IDX.sampleLevel]!
    const speed = p[IDX.sampleSpeed]!
    const trig = Math.round(p[IDX.sampleTrig]!)
    const oneShot = Math.round(p[IDX.sampleMode]!) === 1
    const erase = p[IDX.loopErase]!
    const wear = p[IDX.loopWear]!
    const wearCoef = lpCoef(WORN_TOP_HZ * Math.pow(WORN_FLOOR, wear), this.sr)
    const hiss = p[IDX.loopHiss]! * p[IDX.loopHiss]! * HISS_FULL
    const hold = p[IDX.loopHold]!
    const holdCoef = lpCoef(HOLD_HZ, this.sr)

    // The stretch of reel between the two markers, as fractions. Dragged past
    // each other they swap rather than collapse, which is what a pair of
    // markers on one line does — you asked for the tape between them either
    // way.
    const lo = Math.min(p[IDX.loopIn]!, p[IDX.loopOut]!)
    const hi = Math.max(p[IDX.loopIn]!, p[IDX.loopOut]!)

    // The three wires the bay can land on the tape. Read once; a block with
    // none of them wired walks the same loop it always did, with the window
    // worked out ahead of it.
    const modSpeed = ctx.mod.read(DEST.sampleSpeed)
    const modSlide = ctx.mod.read(DEST.loopSlide)
    const modSpan = ctx.mod.read(DEST.loopSpan)
    const marked = modSlide !== null || modSpan !== null
    let from = frameIn(lo, n)
    let to = frameOut(hi, n, from)
    let span = to - from

    for (let i = 0; i < io.n; i++) {
      // Markers are marks on the tape rather than a hand on the transport, so
      // moving them does not drag the head: it plays on where it stands until
      // the window it was in has left it behind, and the wrap below is what
      // catches it. Which is why a wire on the slide reads as the loop jumping
      // around the recording rather than as a scrub.
      if (marked) {
        const stretch = modSpan ? octaves(modSpan[i]! * 2) : 1
        const width = Math.min((hi - lo) * stretch, 1)
        const walk = modSlide
          ? Math.min(Math.max(modSlide[i]!, -lo), 1 - lo - width)
          : 0
        from = frameIn(lo + walk, n)
        to = frameOut(lo + walk + width, n, from)
        span = to - from
      }

      if (trig > 0 && this.struck(trig, ctx, i)) {
        // Backwards, a hit drops the needle at the other end of the window.
        this.pos = speed < 0 ? to - 1 : from
        this.playing = true
      }
      if (!this.playing) continue

      const idx = Math.floor(this.pos)
      const frac = this.pos - idx
      // The sample after the last one in the window is the first one in it:
      // interpolating off the tape outside the markers would put a sliver of
      // what you trimmed back into the splice.
      const a = buf[idx]!
      const b = buf[idx + 1 >= to ? from : idx + 1]!
      const out = (a + frac * (b - a)) * level

      // The heads, in the order a tape passes them: erase takes off what is
      // already there, record lays down what the board put out. Read first, so
      // this lap plays what the last one left rather than what it is being
      // handed — the play head is ahead of the record head, which is the way
      // round every loop machine has them.
      //
      // Saturating, because the medium does. With nothing erased the laps pile
      // up, and a tape that took them linearly would be at ten times full scale
      // in a dozen passes; oxide instead runs out of room and the pile turns
      // into distortion, which is what a loop left running is supposed to
      // become.
      if (rec > 0) {
        let laid = buf[idx]! * (1 - erase) + ctx.out[i]! * rec
        if (wear > 0) laid = this.wear.process(laid, wearCoef)
        if (hold > 0) {
          this.envOld += holdCoef * (Math.abs(buf[idx]!) - this.envOld)
          this.envLaid += holdCoef * (Math.abs(softclip(laid)) - this.envLaid)
          const short = this.envOld / (this.envLaid + 1e-5)
          laid *= Math.pow(Math.min(Math.max(short, 1), HOLD_MAX), hold)
        }
        if (hiss > 0) {
          const white = this.hissRng() * 2 - 1
          laid += hiss * this.hissColor.process(white, HISS_COLOR)
        }
        buf[idx] = softclip(laid)
      }

      // One column of the drawing per pass under the head, committed as the
      // head leaves it. A frozen head commits nothing, which is right — a reel
      // standing still is a reel that has not changed.
      const bin = ((idx * PEAK_BINS) / n) | 0
      const v = buf[idx]! < 0 ? -buf[idx]! : buf[idx]!
      if (bin !== this.binAt) {
        if (this.binAt >= 0) this.peaks[this.binAt] = this.binMax
        this.binAt = bin
        this.binMax = v
      } else if (v > this.binMax) this.binMax = v

      // Off the end of the window is where a loop comes round and a one-shot
      // stops. A one-shot with nothing wired to it is a file that plays once
      // when you drop it.
      //
      // A wire on the speed multiplies rather than adds, because that is what a
      // wire on a capstan does: it drags the transport the tape is already on,
      // so a starve dives the pitch and leaves the direction alone — and a
      // motor parked at the stop stays parked however hard anything pushes it.
      const next =
        this.pos + (modSpeed ? speed * octaves(modSpeed[i]! * 2) : speed)
      if (this.taking && next >= to) this.taking = false
      if (oneShot && (next >= to || next < from)) this.playing = false
      this.pos = from + ((((next - from) % span) + span) % span)

      io.l[i]! += out
      io.r[i]! += out
    }

    this.winIn = from / n
    this.winOut = to / n
  }

  panic() {
    this.pos = 0
    this.playing = true
    this.binAt = -1
    this.micTrig.reset()
  }
}
