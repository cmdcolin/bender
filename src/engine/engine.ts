import workletUrl from '../dsp/worklet.ts?worker&url'
import { CONTROL_KEYS, DEFAULT_CONTROLS, type ControlKey, type Controls } from '../controls'
import { ENUM_KEYS } from '../ui/controls'
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
  readonly playing = createStore(false)
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
    this.post({ kind: 'transport', playing: this.playing.get() })
    this.running.set(true)
  }

  private post(msg: ToWorklet, transfer?: Transferable[]) {
    this.node?.port.postMessage(msg, transfer ?? [])
  }

  set(key: ControlKey, value: number) {
    this.cancelMorph()
    this.controls.set({ ...this.controls.get(), [key]: value })
    this.flushSoon()
  }

  patch(partial: Partial<Controls>) {
    this.cancelMorph()
    this.controls.set({ ...this.controls.get(), ...partial })
    this.flushSoon()
  }

  private morphRaf = 0

  private cancelMorph() {
    if (this.morphRaf) cancelAnimationFrame(this.morphRaf)
    this.morphRaf = 0
  }

  // Glide the board into a new look, phosphene-style: numeric controls ease
  // over `seconds`, enums cut at the start.
  morphTo(target: Controls, seconds = 1.2) {
    this.cancelMorph()
    const from = this.controls.get()
    const start = performance.now()
    const cut: Partial<Controls> = {}
    for (const k of ENUM_KEYS) cut[k] = target[k]
    this.controls.set({ ...from, ...cut })
    this.flushSoon()
    const tick = () => {
      const t = Math.min((performance.now() - start) / (seconds * 1000), 1)
      const e = t * t * (3 - 2 * t)
      const next = { ...this.controls.get() }
      for (const k of CONTROL_KEYS) {
        if (ENUM_KEYS.has(k)) continue
        next[k] = from[k] + (target[k] - from[k]) * e
      }
      this.controls.set(next)
      this.dirty = true
      this.flushSoon()
      this.morphRaf = t < 1 ? requestAnimationFrame(tick) : 0
    }
    this.morphRaf = requestAnimationFrame(tick)
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
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
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

  // The demo song never starts itself — the user presses play.
  setPlaying(playing: boolean) {
    this.playing.set(playing)
    this.post({ kind: 'transport', playing })
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
