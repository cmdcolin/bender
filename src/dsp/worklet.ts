import type { ToWorklet } from '../engine/messages'
import { MAX_SOURCES, N_PARAMS, packParams } from '../engine/params'
import { DEFAULT_CONTROLS } from '../controls'
import { buildBender, type BuiltChain } from './build'
import { Smoother } from './smoother'
import { ToyChip } from './stages/toyChip'
import { BLOCK, type StereoBlock } from './stage'

const SCOPE_LEN = 512 // a power of two, so the ring wraps on a mask
const SCOPE_MASK = SCOPE_LEN - 1
const REC_CHUNK = 1 << 15 // frames per posted slab (~0.7 s at 48 k)
// Blocks between meter posts. Everything downstream draws off a frame callback,
// so posting faster than a frame buys nothing and costs the audio thread a 2 kB
// buffer, a copy and a hand across the wire — twice over, at the old rate.
const METER_EVERY = 6 // ~16 ms at 48 k

class BenderProcessor extends AudioWorkletProcessor {
  private target = new Float32Array(N_PARAMS)
  private built: BuiltChain
  private smoother: Smoother
  private io: StereoBlock
  private micMono = new Float32Array(BLOCK)
  private scope = new Float32Array(SCOPE_LEN)
  private scopeOut = new Float32Array(SCOPE_LEN)
  private scopePos = 0
  private meterCountdown = METER_EVERY
  // The chip's note report, written into per meter post and handed over as it
  // stands. Slicing it to length would have been one small array sixty times a
  // second on the thread that cannot afford a collection, so the count rides
  // along instead and the reader takes that many.
  private chipNotes = new Int16Array(ToyChip.MAX_SOUNDING)
  // The FM chip's four channels, reported beside the toy's: two keybeds on the
  // panel, two lists of what is sounding.
  private fmNotes = new Int16Array(4)
  private peak = 0
  private duck = 0
  private recording = false
  private recL = new Float32Array(REC_CHUNK)
  private recR = new Float32Array(REC_CHUNK)
  private recFill = 0
  private recStems = false
  // The six source tapes, one mono slab each, standing whether anybody ever
  // records stems or not. 768 kB of the worklet's heap sitting idle is the
  // price of never allocating them: the alternative is 768 kB drawn on the
  // audio thread the first time a stem take is armed, and a collector run on
  // this thread is a hole in the sound wherever it lands.
  private stemSlabs = Array.from(
    { length: MAX_SOURCES },
    () => new Float32Array(REC_CHUNK),
  )

  constructor() {
    super()
    // Seeded off the clock, so the noise, the faults and the reboots are this
    // session's rather than the same stream every page load. A board is still a
    // board — what it does is reproducible — but a take is a take.
    this.built = buildBender(sampleRate, (Date.now() ^ 0x5bd1) >>> 0)
    this.smoother = new Smoother(sampleRate, BLOCK)
    this.io = {
      l: new Float32Array(BLOCK),
      r: new Float32Array(BLOCK),
      n: BLOCK,
    }
    this.target.set(packParams(DEFAULT_CONTROLS))
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => {
      const msg = e.data
      switch (msg.kind) {
        case 'params':
          this.target.set(msg.pack)
          break
        case 'sample':
          this.built.sampler.setBuffer(msg.mono, msg.peaks)
          break
        case 'seek':
          this.built.sampler.seek(msg.frac)
          break
        case 'noteOn':
          if (msg.dest === 'fm')
            this.built.fmChip.noteOn(msg.semitone, msg.gain)
          else this.built.toyChip.noteOn(msg.semitone, msg.gain)
          break
        case 'noteOff':
          if (msg.dest === 'fm') this.built.fmChip.noteOff(msg.semitone)
          else this.built.noteOff(msg.semitone)
          break
        case 'drumHit':
          this.built.toyDrum.strike(msg.bits, msg.gain)
          break
        case 'record':
          if (msg.on) {
            this.recFill = 0
            this.recStems = !!msg.stems
            this.built.chain.capturing = this.recStems
            this.recording = true
          } else if (this.recording) {
            this.recording = false
            this.built.chain.capturing = false
            this.flushRec(true)
          }
          break
        case 'transport':
          this.built.transport.tune = msg.tune
          this.built.transport.drums = msg.drums
          break
        case 'panic':
          this.built.chain.panic()
          break
      }
    }
  }

  // Hand the take's audio to the main thread a slab at a time; it owns the
  // growing tape, the worklet only ever holds one chunk.
  //
  // Posted without transfer, so the two slab buffers are allocated once and
  // written over for the whole take. Transferring meant a fresh 128 kB pair off
  // the audio thread's heap every 0.7 s, and a collector run on this thread is
  // a hole in the sound.
  //
  // The serializer still copies the slabs, and it copies them here — postMessage
  // serializes synchronously on the thread that calls it. What that buys is the
  // kind of cost: a 128 kB memcpy every 0.7 s is 13 µs in a block that has
  // 2.7 ms, and it lands where the schedule can see it, where an allocation
  // lands whenever the collector decides.
  private flushRec(done: boolean) {
    const n = this.recFill
    this.recFill = 0
    this.port.postMessage({
      kind: 'rec',
      l: this.recL,
      r: this.recR,
      n,
      done,
      // Six more slabs on the same terms, and only when the take asked for
      // them: the serializer's copy goes from 128 kB every 0.7 s to 900 kB,
      // which is 80 µs in a block that has 2700.
      stems: this.recStems ? this.stemSlabs : undefined,
    })
  }

  // The block onto the tape, in whatever piece of it fits before the slab is
  // full. The tape used to ride inside the loop that also drew the trace and
  // took the peak, one sample at a time, testing for the slab boundary as it
  // went; with seven tracks on it the boundary is worth finding once and
  // copying up to, and the walk it costs only happens while a take is running.
  //
  // A slab always ends where a block ends — REC_CHUNK is a whole number of
  // blocks — so the loop runs once for every block the host asks for in full.
  // It goes round twice for a short block that straddles the seam, which is
  // the case that has to be right rather than fast.
  private lay(l: Float32Array, r: Float32Array, n: number) {
    const stems = this.recStems ? this.built.chain.stems : undefined
    let at = 0
    while (at < n) {
      const take = Math.min(n - at, REC_CHUNK - this.recFill)
      const fill = this.recFill
      for (let i = 0; i < take; i++) {
        this.recL[fill + i] = l[at + i]!
        this.recR[fill + i] = r[at + i]!
      }
      if (stems) {
        for (let k = 0; k < MAX_SOURCES; k++) {
          const slab = this.stemSlabs[k]!
          const base = k * BLOCK + at
          for (let i = 0; i < take; i++) slab[fill + i] = stems[base + i]!
        }
      }
      this.recFill = fill + take
      at += take
      if (this.recFill === REC_CHUNK) this.flushRec(false)
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]
    if (!out || !out[0]) return true
    const n = out[0].length
    const io = this.io
    io.n = n

    const mic = inputs[0]?.[0]
    if (mic) {
      const mic2 = inputs[0]?.[1]
      for (let i = 0; i < n; i++) {
        this.micMono[i] = mic2 ? 0.5 * (mic[i]! + mic2[i]!) : mic[i]!
      }
    } else {
      this.micMono.fill(0, 0, n)
    }

    this.smoother.step(this.target)
    this.built.chain.process(
      io,
      this.smoother.cur,
      mic ? this.micMono : undefined,
    )

    // subarray builds a view object, and a view object on the audio thread is
    // garbage on the audio thread. A full block is what the host asks for
    // essentially always, so the copy that needs no view is the one to take.
    const l = io.l
    const r = io.r
    if (n === BLOCK) {
      out[0].set(l)
      if (out[1]) out[1].set(r)
    } else {
      out[0].set(l.subarray(0, n))
      if (out[1]) out[1].set(r.subarray(0, n))
    }

    // One pass for the trace and the peak: two walks over the same 128 samples
    // were two loop set-ups and two passes over the same line.
    let scopePos = this.scopePos
    let peak = this.peak
    for (let i = 0; i < n; i++) {
      const v = l[i]!
      this.scope[scopePos] = v
      scopePos = (scopePos + 1) & SCOPE_MASK
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
    }
    this.scopePos = scopePos
    this.peak = peak

    if (this.recording) this.lay(l, r, n)

    this.duck = Math.max(this.duck, this.built.chain.duck)
    if (--this.meterCountdown <= 0) {
      this.meterCountdown = METER_EVERY
      // Unrolled from wherever the write head stands into a buffer this owns.
      // It used to be a fresh 2 kB array transferred away sixty times a second
      // — 128 kB/s of garbage on the one thread that cannot afford a collection.
      // Posting it untransferred costs a 2 kB copy in the serializer instead,
      // which is nothing sixty times a second; it is unrolled into a second
      // buffer because the write head moves on while the ring is still the
      // ring, and the reader wants it laid out oldest first.
      const scope = this.scopeOut
      const ring = this.scope
      const head = scopePos
      for (let i = 0; i < SCOPE_LEN; i++)
        scope[i] = ring[(head + i) & SCOPE_MASK]!
      const rail = this.built.rail
      const sampler = this.built.sampler
      const sounding = this.built.toyChip.soundingNotes(this.chipNotes)
      const fmSounding = this.built.fmChip.soundingNotes(this.fmNotes)
      this.port.postMessage({
        kind: 'meter',
        peak,
        scope,
        tick: this.built.toyDrum.tick,
        hits: this.built.toyDrum.takeFired(),
        tunePos: this.built.toyChip.tunePos,
        tuneFrac: this.built.toyChip.tuneFrac,
        duck: this.duck,
        rail: rail.v,
        reboots: rail.rebootCount,
        notes: this.chipNotes,
        noteCount: sounding,
        fmNotes: this.fmNotes,
        fmNoteCount: fmSounding,
        // The chain's own buffer, posted untransferred like the scope and the
        // note report, and cleared here — the peaks are held between reads, so
        // whoever reads them is the only thing that may clear them.
        taps: this.built.chain.taps,
        walk: this.built.chain.walk,
        dropped: this.built.chain.dropped,
        sampleSecs: sampler.frames / sampleRate,
        samplePos: sampler.head,
        samplePlaying: sampler.rolling,
        samplePeaks: sampler.peaks,
        sampleIn: sampler.windowIn,
        sampleOut: sampler.windowOut,
      })
      this.peak = 0
      this.duck = 0
      this.built.chain.taps.fill(0)
    }
    return true
  }
}

registerProcessor('bender', BenderProcessor)
