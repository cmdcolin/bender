import workletUrl from '../dsp/worklet.ts?worker&url'
import { DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { createStore, type Store } from '../listeners'
import type { FromWorklet, ToWorklet } from './messages'
import { packParams } from './params'

export interface Meter {
  peak: number
  scope: Float32Array
}

// Owns the AudioContext, the worklet node and the control values. The UI
// writes controls here; the engine coalesces them into one packed post per
// animation frame.
export class Engine {
  readonly controls = createStore<Controls>({ ...DEFAULT_CONTROLS })
  readonly meter: Store<Meter> & { set: (m: Meter) => void } = createStore<Meter>({
    peak: 0,
    scope: new Float32Array(512),
  })
  readonly running = createStore(false)
  readonly micOn = createStore(false)
  readonly sampleName = createStore<string | null>(null)

  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private micStream: MediaStream | null = null
  private dirty = false
  private rafQueued = false

  async start() {
    if (this.ctx) {
      await this.ctx.resume()
      this.running.set(true)
      return
    }
    const ctx = new AudioContext()
    await ctx.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(ctx, 'bender', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
      if (e.data.kind === 'meter') {
        this.meter.set({ peak: e.data.peak, scope: e.data.scope })
      }
    }
    node.connect(ctx.destination)
    this.ctx = ctx
    this.node = node
    this.post({ kind: 'params', pack: packParams(this.controls.get()) })
    this.running.set(true)
  }

  private post(msg: ToWorklet, transfer?: Transferable[]) {
    this.node?.port.postMessage(msg, transfer ?? [])
  }

  set(key: ControlKey, value: number) {
    this.controls.set({ ...this.controls.get(), [key]: value })
    this.flushSoon()
  }

  patch(partial: Partial<Controls>) {
    this.controls.set({ ...this.controls.get(), ...partial })
    this.flushSoon()
  }

  private flushSoon() {
    this.dirty = true
    if (this.rafQueued) return
    this.rafQueued = true
    requestAnimationFrame(() => {
      this.rafQueued = false
      if (!this.dirty) return
      this.dirty = false
      this.post({ kind: 'params', pack: packParams(this.controls.get()) })
    })
  }

  async enableMic() {
    if (!this.ctx || this.micStream) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.micStream = stream
    const src = this.ctx.createMediaStreamSource(stream)
    src.connect(this.node!)
    this.micOn.set(true)
  }

  async loadSample(file: File) {
    if (!this.ctx) return
    const buf = await this.ctx.decodeAudioData(await file.arrayBuffer())
    const mono = new Float32Array(buf.length)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < buf.length; i++) mono[i]! += data[i]! / buf.numberOfChannels
    }
    this.post({ kind: 'sample', mono }, [mono.buffer])
    this.sampleName.set(file.name)
  }

  noteOn(semitone: number) {
    this.post({ kind: 'noteOn', semitone })
  }

  noteOff(semitone: number) {
    this.post({ kind: 'noteOff', semitone })
  }

  panic() {
    this.patch({ fbAmt: 0, dlyFb: Math.min(this.controls.get().dlyFb, 1) })
    this.post({ kind: 'panic' })
  }
}

export const engine = new Engine()
