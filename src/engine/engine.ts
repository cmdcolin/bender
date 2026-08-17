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
  tick: number
  duck: number
}

// What a board on the edge of running away sounds like from the main thread.
//
// The limiter is the one thing that knows. A board that never reaches it is
// nowhere near the edge; a board pinned flat against it is past the edge, and
// every setting past that point sounds the same because the ceiling is what you
// are listening to. The edge itself is the board that keeps arriving at the
// ceiling and backing off — so what to look for is not how hard the limiter
// works but how unevenly, which is the spread of its gain reduction rather than
// the mean of it.
//
// A board that is merely audible still beats silence, or a hunt through six
// boards that never quite squeal would land on whichever was quietest.
export function edgeScore(ducks: number[], peaks: number[]): number {
  if (ducks.length === 0) return 0
  const mean = ducks.reduce((a, v) => a + v, 0) / ducks.length
  const sd = Math.sqrt(
    ducks.reduce((a, v) => a + (v - mean) ** 2, 0) / ducks.length,
  )
  const loud = peaks.reduce((a, v) => a + v, 0) / peaks.length
  return sd + 0.12 * Math.min(loud, 1)
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
      tick: 0,
      duck: 0,
    })
  readonly running = createStore(false)
  readonly micOn = createStore(false)
  // The two run lines, separately. The drum machine is its own box: it runs
  // without the demo song, which is what anybody who wanted to write a pattern
  // and hear it always expected of it.
  readonly songPlaying = createStore(false)
  readonly drumsPlaying = createStore(false)
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
  /** True while a hunt is auditioning boards, so its button can say so. */
  readonly hunting = createStore(false)

  private ctx: AudioContext | null = null
  private booting: Promise<void> | undefined
  private node: AudioWorkletNode | null = null
  private micStream: MediaStream | null = null
  private dirty = false
  private rafQueued = false
  private huntToken = 0

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
        this.meter.set({
          peak: msg.peak,
          scope: msg.scope,
          tick: msg.tick,
          duck: msg.duck,
        })
      else if (msg.kind === 'rec') this.onRecChunk(msg)
    }
    node.connect(ctx.destination)
    ctx.onstatechange = () => this.running.set(ctx.state === 'running')
    this.ctx = ctx
    this.node = node
    this.post({ kind: 'params', pack: packParams(this.controls.get()) })
    this.postTransport()
  }

  private post(msg: ToWorklet, transfer?: Transferable[]) {
    this.node?.port.postMessage(msg, transfer ?? [])
  }

  set(key: ControlKey, value: number) {
    this.stopHunt()
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
    this.stopHunt()
    this.bank()
    this.travel(target, seconds)
  }

  // Audition a row of boards and keep the one nearest the edge of running away.
  //
  // Every other roll on the board throws dice and hands you whatever came up.
  // This one listens: it cuts to each candidate, gives it long enough to show
  // what it does, scores it off the limiter and lands on the best of them. You
  // hear it going through them, which is the honest version of the thing — a
  // board can only be judged by playing it, so a search for one has to be
  // audible. Anything else you touch calls it off and keeps whatever is playing.
  //
  // Only one banked step for the whole hunt, taken before the first candidate:
  // the boards it tried on the way are not boards you chose.
  async hunt(candidates: Controls[], holdMs = 1400): Promise<Controls | null> {
    if (candidates.length === 0) return null
    const token = ++this.huntToken
    this.bank()
    this.hunting.set(true)
    let best: Controls | null = null
    let bestScore = -Infinity
    for (const board of candidates) {
      if (token !== this.huntToken) return null
      this.writeLive(board)
      const score = await this.audition(holdMs, token)
      if (token !== this.huntToken) return null
      if (score > bestScore) {
        bestScore = score
        best = board
      }
    }
    this.hunting.set(false)
    if (best) this.writeLive(best)
    return best
  }

  /** Cancel a hunt in flight and leave whatever board is playing on the board. */
  stopHunt() {
    if (!this.hunting.get()) return
    this.huntToken++
    this.hunting.set(false)
  }

  // A board straight onto the rails with no step banked: the hunt owns its own
  // entry in the walk, and the candidates in between are not places you were.
  private writeLive(next: Controls) {
    this.cancelMorph()
    this.controls.set(next)
    this.flushSoon()
  }

  // Listen to one candidate. The first stretch is thrown away: a board that has
  // just been cut to is still the tail of the last one, and a delay line full of
  // somebody else's squeal would score this one.
  private audition(ms: number, token: number): Promise<number> {
    return new Promise(resolve => {
      const ducks: number[] = []
      const peaks: number[] = []
      let settled = false
      const off = this.meter.subscribe(() => {
        if (!settled) return
        const m = this.meter.get()
        ducks.push(m.duck)
        peaks.push(m.peak)
      })
      const settle = setTimeout(() => (settled = true), Math.min(400, ms / 3))
      setTimeout(() => {
        clearTimeout(settle)
        off()
        resolve(token === this.huntToken ? edgeScore(ducks, peaks) : -Infinity)
      }, ms)
    })
  }

  // A board written straight rather than travelled to: a preset chip dragged by
  // hand, where the board follows the pointer and a morph would only fight it.
  // It takes the step armed on the way down, so the whole drag banks one entry
  // in the walk — the board as it stood before the hand landed on the chip.
  writeBoard(next: Controls) {
    this.stopHunt()
    this.commitStep()
    this.cancelMorph()
    this.controls.set(next)
    this.flushSoon()
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

  // Neither sequencer ever starts itself. A preset, a random roll, a link, a
  // click on the map: none of them press play, because a board is a circuit and
  // running it is a separate thing you asked for. The app used to start the tune
  // on half of those, and a machine that breaks into song when you touch it is a
  // toy rather than an instrument.
  private postTransport() {
    this.post({
      kind: 'transport',
      tune: this.songPlaying.get(),
      drums: this.drumsPlaying.get(),
    })
  }

  private setRun(song: boolean, drums: boolean) {
    if (song === this.songPlaying.get() && drums === this.drumsPlaying.get())
      return
    this.songPlaying.set(song)
    this.drumsPlaying.set(drums)
    this.postTransport()
  }

  setSongPlaying(on: boolean) {
    this.setRun(on, this.drumsPlaying.get())
  }

  setDrumsPlaying(on: boolean) {
    this.setRun(this.songPlaying.get(), on)
  }

  // What space puts back. Both to begin with: on a board nobody has run yet,
  // "play" means play the board.
  private lastRun = { song: true, drums: true }

  // Space is one run/stop line over both machines. It stops whatever is running
  // and the next press starts that same thing again, so a board running the kit
  // on its own comes back running the kit on its own rather than breaking into
  // the demo song.
  toggleRun() {
    const song = this.songPlaying.get()
    const drums = this.drumsPlaying.get()
    if (song || drums) {
      this.lastRun = { song, drums }
      this.setRun(false, false)
    } else {
      this.setRun(this.lastRun.song, this.lastRun.drums)
    }
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
