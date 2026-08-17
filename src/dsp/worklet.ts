import type { ToWorklet } from '../engine/messages'
import { N_PARAMS, packParams } from '../engine/params'
import { DEFAULT_CONTROLS } from '../controls'
import { buildBender, type BuiltChain } from './build'
import { Smoother } from './smoother'
import { BLOCK, type StereoBlock } from './stage'

const SCOPE_LEN = 512
const METER_EVERY = 3 // blocks between meter posts (~8 ms at 48 k)

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

  constructor() {
    super()
    this.built = buildBender(sampleRate)
    this.smoother = new Smoother(sampleRate, BLOCK)
    this.io = { l: new Float32Array(BLOCK), r: new Float32Array(BLOCK), n: BLOCK }
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
        case 'panic':
          this.built.chain.panic()
          break
      }
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
    this.built.chain.process(io, this.smoother.cur, mic ? this.micMono : undefined)

    out[0].set(io.l.subarray(0, n))
    if (out[1]) out[1].set(io.r.subarray(0, n))

    for (let i = 0; i < n; i++) {
      this.scope[this.scopePos] = io.l[i]!
      this.scopePos = (this.scopePos + 1) % SCOPE_LEN
      const a = Math.abs(io.l[i]!)
      if (a > this.peak) this.peak = a
    }
    if (--this.meterCountdown <= 0) {
      this.meterCountdown = METER_EVERY
      const scope = new Float32Array(SCOPE_LEN)
      for (let i = 0; i < SCOPE_LEN; i++) {
        scope[i] = this.scope[(this.scopePos + i) % SCOPE_LEN]!
      }
      this.port.postMessage({ kind: 'meter', peak: this.peak, scope }, [scope.buffer])
      this.peak = 0
    }
    return true
  }
}

registerProcessor('bender', BenderProcessor)
