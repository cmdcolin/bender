import { IDX } from '../../engine/params'
import { DEST } from '../modbus'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { octaves } from '../util/pitch'
import { N_DRUM_VOICES, voiceMask } from '../trigbus'
import { Transient } from '../util/follower'
import { softclip } from '../util/softclip'

// Past the voices and the whole kit, the two lines that aren't the kit at all.
// The offsets are the tail of sampleTrig's own choices, which is a different
// tail from the trigger patch's — a test pins each to the label it decodes.
export const KEY_CHOICE = N_DRUM_VOICES + 2
export const MIC_CHOICE = N_DRUM_VOICES + 3

// How many bins the reel is drawn in. A number of columns rather than a
// resolution: the panel is a few hundred pixels wide however long the tape is,
// so a bin is one column of it and 90 seconds and 4 seconds cost the same.
export const PEAK_BINS = 256

// The smallest window the handles can pinch the loop down to. Two frames is a
// tone rather than a loop, and this board is happy to make one — what it must
// not do is divide by nothing.
const MIN_WINDOW = 2

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
// models generation loss: the loop is genuinely re-recorded every lap, so what
// the board does to a signal is what a lap costs, and thirty laps of it is
// thirty laps of the real thing rather than a decay coefficient standing in for
// one. Which also means a bend in the path makes the loop diverge rather than
// decay, and that is the difference between this and a delay.
export class Sampler implements Stage {
  label = 'sampler'
  private buf: Float32Array | null = null
  private pos = 0
  private playing = true
  private micTrig: Transient
  // What the tape looks like, kept out here for the panel to draw. Written as
  // the head passes rather than rescanned: the record head rewrites the reel
  // under it every lap, and a loop you cannot watch going round is the one
  // thing a loop machine must not be.
  readonly peaks = new Float32Array(PEAK_BINS)
  private binMax = 0
  private binAt = -1

  constructor(sr: number) {
    this.micTrig = new Transient(sr)
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

  // The envelope comes in already worked out where there is somewhere better to
  // work it out: a dropped file is scanned on the main thread on its way over,
  // because a scan of 90 seconds is several audio blocks long and the audio
  // thread has no several blocks to give. Offline callers hand over the buffer
  // alone and pay for the scan where nothing is listening.
  setBuffer(mono: Float32Array, peaks?: Float32Array) {
    this.buf = mono
    this.pos = 0
    this.playing = true
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
    return (p[IDX.sampleLevel]! > 0 && this.buf !== null) || p[IDX.loopRec]! > 0
  }

  // Threading a blank tape. Only ever on the way from nothing to armed, so the
  // one allocation lands when you reach for the knob rather than in a block.
  // The length is read here and not again: a reel you have recorded on is the
  // length it is, and a knob that resized it would be throwing the take away.
  private thread(secs: number, sr: number) {
    this.buf = new Float32Array(Math.max(Math.round(secs * sr), 2))
    this.pos = 0
    this.playing = true
    this.binAt = -1
    this.peaks.fill(0)
  }

  private struck(trig: number, ctx: Ctx, i: number): boolean {
    if (trig === MIC_CHOICE) return this.micTrig.process(ctx.mic[i]!, 0.05)
    if (trig === KEY_CHOICE) return ctx.trig.key[i]! > 0
    return (Math.round(ctx.trig.drumBits[i]!) & voiceMask(trig)) !== 0
  }

  process(io: StereoBlock, p: Float32Array, ctx: Ctx) {
    const rec = p[IDX.loopRec]!
    if (rec > 0 && !this.buf) this.thread(p[IDX.loopSecs]!, ctx.sr)
    const buf = this.buf
    if (!buf || buf.length < 2) return
    const n = buf.length
    const level = p[IDX.sampleLevel]!
    const speed = p[IDX.sampleSpeed]!
    const trig = Math.round(p[IDX.sampleTrig]!)
    const oneShot = Math.round(p[IDX.sampleMode]!) === 1
    const erase = p[IDX.loopErase]!

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
        buf[idx] = softclip(buf[idx]! * (1 - erase) + ctx.out[i]! * rec)
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
      if (oneShot && (next >= to || next < from)) this.playing = false
      this.pos = from + ((((next - from) % span) + span) % span)

      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.pos = 0
    this.playing = true
    this.binAt = -1
    this.micTrig.reset()
  }
}
