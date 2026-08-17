import type { ToWorklet } from '../engine/messages'
import { N_PARAMS, packParams } from '../engine/params'
import { DEFAULT_CONTROLS } from '../controls'
import { buildBender, type BuiltChain } from './build'
import { Smoother } from './smoother'
import { BLOCK, type StereoBlock } from './stage'

const SCOPE_LEN = 512 // a power of two, so the ring wraps on a mask
const SCOPE_MASK = SCOPE_LEN - 1
const REC_CHUNK = 1 << 15 // frames per posted slab (~0.7 s at 48 k)
// Blocks between meter posts. The panel draws off a frame callback, so posting
// faster than a frame buys nothing and costs the audio thread a 2 kB buffer it
// then has to hand across — which is the one allocation here big enough for the
// collector to notice, and a collection here is a gap in the sound.
const METER_EVERY = 6 // ~16 ms at 48 k

class BenderProcessor extends AudioWorkletProcessor {
  private target = new Float32Array(N_PARAMS)
  private built: BuiltChain
  private smoother: Smoother
  private io: StereoBlock
  private micMono = new Float32Array(BLOCK)
  private scope = new Float32Array(SCOPE_LEN)
  private scopePos = 0
  private meterCountdown = METER_EVERY
  private peak = 0
  private duck = 0
  private recording = false
  private recL = new Float32Array(REC_CHUNK)
  private recR = new Float32Array(REC_CHUNK)
  private recFill = 0

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
          this.built.sampler.setBuffer(msg.mono)
          break
        case 'noteOn':
          this.built.toyChip.noteOn(msg.semitone)
          break
        case 'noteOff':
          this.built.toyChip.noteOff(msg.semitone)
          break
        case 'record':
          if (msg.on) {
            this.recFill = 0
            this.recording = true
          } else if (this.recording) {
            this.recording = false
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
  private flushRec(done: boolean) {
    const l = this.recL.slice(0, this.recFill)
    const r = this.recR.slice(0, this.recFill)
    this.recFill = 0
    this.port.postMessage({ kind: 'rec', l, r, done }, [l.buffer, r.buffer])
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

    out[0].set(io.l.subarray(0, n))
    if (out[1]) out[1].set(io.r.subarray(0, n))

    if (this.recording) {
      for (let i = 0; i < n; i++) {
        this.recL[this.recFill] = io.l[i]!
        this.recR[this.recFill] = io.r[i]!
        if (++this.recFill === REC_CHUNK) this.flushRec(false)
      }
    }

    for (let i = 0; i < n; i++) {
      this.scope[this.scopePos] = io.l[i]!
      this.scopePos = (this.scopePos + 1) & SCOPE_MASK
      const a = Math.abs(io.l[i]!)
      if (a > this.peak) this.peak = a
    }
    this.duck = Math.max(this.duck, this.built.chain.duck)
    if (--this.meterCountdown <= 0) {
      this.meterCountdown = METER_EVERY
      // Unrolled from wherever the write head stands, in two runs rather than a
      // modulo per sample.
      const scope = new Float32Array(SCOPE_LEN)
      const head = this.scopePos
      scope.set(this.scope.subarray(head))
      scope.set(this.scope.subarray(0, head), SCOPE_LEN - head)
      const tick = this.built.toyDrum.tick
      const rail = this.built.rail
      this.port.postMessage(
        {
          kind: 'meter',
          peak: this.peak,
          scope,
          tick,
          duck: this.duck,
          rail: rail.v,
          reboots: rail.rebootCount,
        },
        [scope.buffer],
      )
      this.peak = 0
      this.duck = 0
    }
    return true
  }
}

registerProcessor('bender', BenderProcessor)
