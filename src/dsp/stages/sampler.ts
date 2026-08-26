import { IDX } from '../../engine/params'
import type { Ctx, Stage, StereoBlock } from '../stage'
import { N_DRUM_VOICES, voiceMask } from '../trigbus'
import { Transient } from '../util/follower'
import { softclip } from '../util/softclip'

// Past the voices and the whole kit, the two lines that aren't the kit at all.
// The offsets are the tail of sampleTrig's own choices, which is a different
// tail from the trigger patch's — a test pins each to the label it decodes.
export const KEY_CHOICE = N_DRUM_VOICES + 2
export const MIC_CHOICE = N_DRUM_VOICES + 3

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

  constructor(sr: number) {
    this.micTrig = new Transient(sr)
  }

  setBuffer(mono: Float32Array) {
    this.buf = mono
    this.pos = 0
    this.playing = true
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

    for (let i = 0; i < io.n; i++) {
      if (trig > 0 && this.struck(trig, ctx, i)) {
        // Backwards, a hit drops the needle at the other end of the file.
        this.pos = speed < 0 ? n - 1 : 0
        this.playing = true
      }
      if (!this.playing) continue

      const idx = Math.floor(this.pos)
      const frac = this.pos - idx
      const a = buf[idx % n]!
      const b = buf[(idx + 1) % n]!
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
        const at = idx % n
        buf[at] = softclip(buf[at]! * (1 - erase) + ctx.out[i]! * rec)
      }

      // Off the end is where a loop comes round and a one-shot stops. A one-shot
      // with nothing wired to it is a file that plays once when you drop it.
      const next = this.pos + speed
      if (oneShot && (next >= n || next < 0)) this.playing = false
      this.pos = ((next % n) + n) % n

      io.l[i]! += out
      io.r[i]! += out
    }
  }

  panic() {
    this.pos = 0
    this.playing = true
    this.micTrig.reset()
  }
}
