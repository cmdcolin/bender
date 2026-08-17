import workletUrl from '../dsp/worklet.ts?worker&url'
import {
  DEFAULT_CONTROLS,
  sameControls,
  type ControlKey,
  type Controls,
} from '../controls'
import {
  EMPTY_HISTORY,
  record,
  stepBack,
  stepForward,
  type History,
} from '../history'
import { createStore, type Store } from '../listeners'
import { Glide } from './glide'
import type { FromWorklet, ToWorklet } from './messages'
import { packParams } from './params'
import { encodeWav } from './wav'

const REC_MAX_S = 600 // a take stops itself at ten minutes

export interface Meter {
  peak: number
  scope: Float32Array
}

// Owns the AudioContext, the worklet node and the control values. The UI
// writes controls here; the engine coalesces them into one packed post per
// animation frame.
export class Engine {
  readonly controls = createStore<Controls>({ ...DEFAULT_CONTROLS })
  readonly meter: Store<Meter> & { set: (m: Meter) => void } =
    createStore<Meter>({
      peak: 0,
      scope: new Float32Array(512),
    })
  readonly running = createStore(false)
  readonly micOn = createStore(false)
  readonly playing = createStore(false)
  readonly recording = createStore(false)
  readonly recSeconds = createStore(0)
  readonly sampleName = createStore<string | null>(null)
  // How far a morph has got, 0..1, or null when none is running. A store rather
  // than a value passed down because it moves at the frame rate: subscribed to
  // by the one button that draws it, so a 30s morph costs that button per frame
  // and not the whole panel.
  readonly morphProgress = createStore<number | null>(null)
  // The walk over boards you have been through. A store because the buttons that
  // offer it have to grey out and light up as it fills; it changes once per
  // gesture, not per frame.
  readonly history = createStore<History<Controls>>(EMPTY_HISTORY)

  private ctx: AudioContext | null = null
  private booting: Promise<void> | undefined
  private node: AudioWorkletNode | null = null
  private micStream: MediaStream | null = null
  private dirty = false
  private rafQueued = false

  async start() {
    this.booting ??= this.boot()
    await this.booting
    await this.ctx?.resume()
    this.running.set(this.ctx?.state === 'running')
  }

  // A fresh AudioContext is suspended until the page has seen a gesture, so
  // boot it on load and let the first click or key press take it live.
  autostart() {
    void this.start()
    const go = () => {
      void this.start().then(() => {
        if (!this.running.get()) return
        window.removeEventListener('pointerdown', go)
        window.removeEventListener('keydown', go)
      })
    }
    window.addEventListener('pointerdown', go)
    window.addEventListener('keydown', go)
  }

  private async boot() {
    const ctx = new AudioContext()
    await ctx.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(ctx, 'bender', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
      const msg = e.data
      if (msg.kind === 'meter')
        this.meter.set({ peak: msg.peak, scope: msg.scope })
      else if (msg.kind === 'rec') this.onRecChunk(msg)
    }
    node.connect(ctx.destination)
    ctx.onstatechange = () => this.running.set(ctx.state === 'running')
    this.ctx = ctx
    this.node = node
    this.post({ kind: 'params', pack: packParams(this.controls.get()) })
    this.post({ kind: 'transport', playing: this.playing.get() })
  }

  private post(msg: ToWorklet, transfer?: Transferable[]) {
    this.node?.port.postMessage(msg, transfer ?? [])
  }

  set(key: ControlKey, value: number) {
    if (this.controls.get()[key] !== value) this.commitStep()
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
  private morphTarget: Controls | null = null
  private armed: Controls | null = null

  private cancelMorph() {
    if (this.morphRaf) cancelAnimationFrame(this.morphRaf)
    this.morphRaf = 0
    this.morphTarget = null
    if (this.morphProgress.get() !== null) this.morphProgress.set(null)
  }

  // The board to bank: where it has settled, or where a morph in flight is
  // taking it. The two differ only mid-morph, and there the destination is the
  // honest answer — a tween is a frame, not a board. Bank the frame and the
  // board you were stepping out of is unreachable, since redo would land on an
  // arbitrary point along the path to it. Not the same as where a gesture sets
  // off *from*: a morph departs from the live controls, deliberately, because
  // chaining off the tween is the point of a long one.
  private toBank(): Controls {
    return this.morphTarget ?? this.controls.get()
  }

  private bank() {
    this.armed = null
    this.history.set(record(this.history.get(), this.toBank(), sameControls))
  }

  // Arm a step without taking one. A slider drag is one gesture and wants one
  // entry in the walk, not one per pointer move, so the UI arms on the way down
  // and the first write that actually moves something banks the board as it was
  // before the whole gesture. Arming twice over is free; arming and then moving
  // nothing costs no entry at all, which is what makes a click that lands a
  // slider back where it started leave no dead step to press undo through.
  armStep() {
    this.armed ??= this.toBank()
  }

  private commitStep() {
    const armed = this.armed
    if (armed === null) return
    this.armed = null
    this.history.set(record(this.history.get(), armed, sameControls))
  }

  // Both directions are the same move: take the step the walk offers, if any.
  //
  // Through the morph, so a step back arrives however the row says boards
  // arrive. Undo is the verb this is least obviously right for — a take-back
  // wants to be instant — but the walk is a walk through board space, and at a
  // long morph the way back is as worth hearing as the way out was. Stepping
  // back and forth over one boundary is the cheapest way to find where it sits.
  // At `cut` it is the write it always was.
  undo(seconds = 1) {
    this.walk(stepBack(this.history.get(), this.toBank()), seconds)
  }

  redo(seconds = 1) {
    this.walk(stepForward(this.history.get(), this.toBank()), seconds)
  }

  private walk(
    step: { history: History<Controls>; value: Controls } | null,
    seconds: number,
  ) {
    if (step === null) return
    this.armed = null
    this.history.set(step.history)
    this.travel(step.value, seconds)
  }

  // Stop where it has got to and keep the half-way board, which is a board like
  // any other. Grabbing a slider does the same thing, through set().
  stopMorph() {
    this.cancelMorph()
  }

  // Every whole-board verb — a preset, random, mutate, reset — comes through
  // here, so the walk covers all of them without each caller having to remember
  // to bank one.
  morphTo(target: Controls, seconds = 1) {
    this.bank()
    this.travel(target, seconds)
  }

  // Travel to a new board over `seconds`, or land in one frame at zero. It sets
  // off from the *live* controls, so rolls chain: hitting random again halfway
  // through a morph leaves from where the board actually is rather than snapping
  // back to the last resting board first.
  private travel(target: Controls, seconds: number) {
    this.cancelMorph()
    const glide = new Glide(this.controls.get(), target)
    const land = () => {
      this.cancelMorph()
      this.controls.set(glide.at(this.controls.get(), 1))
      this.flushSoon()
    }
    if (seconds <= 0) {
      land()
      return
    }
    this.morphTarget = target
    const start = performance.now()
    const tick = () => {
      const t = Math.min((performance.now() - start) / (seconds * 1000), 1)
      if (t >= 1) {
        land()
        return
      }
      this.controls.set(glide.at(this.controls.get(), t))
      this.morphProgress.set(t)
      this.flushSoon()
      this.morphRaf = requestAnimationFrame(tick)
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
      for (let i = 0; i < buf.length; i++)
        mono[i]! += data[i]! / buf.numberOfChannels
    }
    this.post({ kind: 'sample', mono }, [mono.buffer])
    this.sampleName.set(file.name)
  }

  private take: { l: Float32Array; r: Float32Array }[] = []

  private onRecChunk(msg: { l: Float32Array; r: Float32Array; done: boolean }) {
    if (msg.l.length) this.take.push({ l: msg.l, r: msg.r })
    const frames = this.take.reduce((n, c) => n + c.l.length, 0)
    const sr = this.ctx?.sampleRate ?? 48000
    this.recSeconds.set(frames / sr)
    if (frames >= sr * REC_MAX_S && this.recording.get()) this.stopRecording()
    if (msg.done) this.saveTake(sr)
  }

  private saveTake(sr: number) {
    const take = this.take
    this.take = []
    if (!take.length) return
    const url = URL.createObjectURL(encodeWav(take, sr))
    const a = document.createElement('a')
    a.href = url
    a.download = `bender-${stamp()}.wav`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  startRecording() {
    if (!this.node || this.recording.get()) return
    this.take = []
    this.recSeconds.set(0)
    this.recording.set(true)
    this.post({ kind: 'record', on: true })
  }

  // Stopping is what saves it: the worklet's last slab carries done, and the
  // file lands in the downloads folder.
  stopRecording() {
    if (!this.recording.get()) return
    this.recording.set(false)
    this.post({ kind: 'record', on: false })
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

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export const engine = new Engine()
