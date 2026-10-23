import {
  DEFAULT_CONTROLS,
  sameControls,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import {
  asLen,
  asMask,
  CYCLE,
  DRUM_VOICES,
  GRID_ROWS,
  heardStep,
  quantizeStep,
  stepBit,
  STEPS,
  type DrumMaybeKey,
  type DrumStepKey,
} from '../drums.ts'
import { TRACKS } from '../dsp/stages/fourTrack.ts'
import { YOURS } from '../dsp/stages/roms.ts'
import { PEAK_BINS, peaksOf } from '../dsp/stages/sampler.ts'
import workletUrl from '../dsp/worklet.ts?worker&url'
import { errorText } from '../errorText.ts'
import {
  EMPTY_HISTORY,
  record,
  stepBack,
  stepForward,
  type History,
} from '../history.ts'
import { createStore, type Store } from '../listeners.ts'
import { snap } from '../scale.ts'
import {
  asTuneLen,
  foldNote,
  HOLD,
  MONO_SEQ_STEP_KEYS,
  REST,
  TUNE_LANE_KEYS,
  laneForNote,
  type TuneStepKey,
} from '../tune.ts'
import {
  LOAD_SECONDS,
  fetchItem,
  roll,
  searchText,
  type Pool,
  type Rolled,
} from './archive.ts'
import { Glide } from './glide.ts'
import { SEQ_DESTS } from './messages.ts'
import {
  MAX_SOURCES,
  N_PARAMS,
  N_TAPS,
  STEM_FILES,
  packParams,
} from './params.ts'
import {
  landingTick,
  msUntilTick,
  type CounterReport,
  type PhraseLock,
} from './phraseClock.ts'
import { openTake, sweepTakes } from './takeSink.ts'
import { encodeWav, pcmMono, pcmStereo } from './wav.ts'

import type {
  FromWorklet,
  NoteDest,
  RecMsg,
  RetroMsg,
  SeqDest,
  ToWorklet,
} from './messages.ts'
import type { Take, WavSink } from './takeSink.ts'

export const RETRO_S = 30
const noop = () => {}
const DRIFT_TAP_S = 2.5
// How far ahead of its downbeat a waiting change is written, to cover the hop
// to the worklet, and how near the downbeat the meter has to come before the
// timer is set rather than waiting on the next report.
const QUEUE_LEAD_MS = 6
const QUEUE_WAKE_MS = 40

const QUEUE_SLOTS = ['board', 'pattern'] as const
type QueueSlot = (typeof QUEUE_SLOTS)[number]

interface Queued {
  land: () => void
  seconds: number
  tick: number
  after?: () => void
}
const DRIFT_TRAIL = 12
// Below this a stem is silence, and silence gets no file: a fader left down is
// six seconds of nothing to drag into a session and wonder about. Not exactly
// zero, because a source can leave dc dust behind a fader on its way to zero.
const STEM_FLOOR = 1e-4

interface Rec {
  take: Take
  master: WavSink
  stems: WavSink[]
  frames: number
  live: number
  full: ReturnType<Take['limit']> | ''
}

const LIMIT_NOUN = {
  storage: 'browser storage',
  memory: 'memory',
  size: 'wav file size',
}

// How long before a take runs out of room that the page starts saying so.
const LOW_ROOM_S = 10 * 60

/** What to tell the player while a take has `left` seconds of room, or '' while
    it has plenty. */
export function roomNote(left: number, limit: keyof typeof LIMIT_NOUN): string {
  if (left >= LOW_ROOM_S) return ''
  const noun = LIMIT_NOUN[limit]
  if (left < 60) return `under a minute of ${noun} left`
  return `about ${Math.round(left / 60)} min of ${noun} left`
}

// Where a source stops counting as sounding, and how fast its needle falls to
// get there. The floor is about 60 dB down — quieter than anything anybody is
// listening for and loud enough to ignore the dc dust a fader leaves behind on
// its way to zero. The fall is the desk's, so the map and the meters beside the
// faders decide a channel is quiet at the same moment.
export const SOUND_FLOOR = 1e-3
const SOUND_FALL = 0.86

export interface Meter {
  peak: number
  scope: Float32Array
  tick: number
  drumClock: number
  drumStepMs: number
  /** Voices the kit fired since the last meter, as the bit order of a step. */
  hits: number
  /** Where the tune's own counter is standing and how far through that step,
      which is the clock a note played into the memory lands on. */
  tunePos: number
  tuneFrac: number
  monoSeqPos: number
  monoSeqFrac: number
  monoSeqStepMs: number
  tuneStepMs: number
  duck: number
  rail: number
  reboots: number
  rail2: number
  reboots2: number
  /** What each source, the mic and the bus peaked at over the last meter — see
      the chain's taps. Read by the mixer's meters, which draw straight to the
      DOM off it rather than through a render. */
  taps: Float32Array
  /** Which position the chain is running at each step of its walk, and which
      steps have a joint open — what Solder is doing to the path, which no
      control on the board says. See the chain's own walk. */
  walk: Uint8Array
  dropped: number
  /** The reel the sampler is playing: its length in seconds (0 with nothing
      threaded), where the head stands over it, whether it is turning, and its
      envelope. Read by the reel, which draws off it every frame. */
  sampleSecs: number
  samplePos: number
  samplePlaying: boolean
  sampleTaking: boolean
  sampleUndo: number
  samplePeaks: Float32Array
  /** The stretch of reel that came round last block. The two knobs until a wire
      off the bay lands on the markers, and the wire's answer after that. */
  sampleIn: number
  sampleOut: number
  /** The four-track's loops: heads, lap times, envelopes and wear. See the
      worklet's meter post. */
  fourHeads: Float32Array
  fourLaps: Float32Array
  fourPeaks: Float32Array
  fourShed: Float32Array
}

// Which sources are putting something on the bus, as a bit per tap, from the
// peaks the worklet posts. Rise is instant and fall is not, which is what every
// meter with a needle in it does and for the same reason: the taps come back as
// the peak since the last post, so a kick read that way is one post at full and
// then nothing, and a mask taken straight off them would call a kit playing a
// pattern silent between its own hits.
//
// `hold` is what each needle is falling from, and this writes back into it.
export function soundingMask(taps: Float32Array, hold: Float32Array): number {
  let mask = 0
  for (let k = 0; k < hold.length; k++) {
    const held = Math.max(taps[k] ?? 0, hold[k]! * SOUND_FALL)
    hold[k] = held
    if (held > SOUND_FLOOR) mask |= 1 << k
  }
  return mask
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

// How much of a board lives between the hits: level on meter posts with no kit
// hit against level on posts with one. Echo, spring and feedback tails score;
// a dry kit and a board pinned on the limiter do not. With nothing hitting it
// falls back on the edge.
export function tailScore(
  ducks: number[],
  peaks: number[],
  hits: number[],
): number {
  let head = 0
  let heads = 0
  let tail = 0
  let tails = 0
  for (const [i, p] of peaks.entries()) {
    if (hits[i]) {
      head += p
      heads++
    } else {
      tail += p
      tails++
    }
  }
  if (heads === 0 || tails === 0) return edgeScore(ducks, peaks)
  const duck = ducks.reduce((a, v) => a + v, 0) / ducks.length
  return Math.min(tail / tails / (head / heads + 1e-6), 1) - duck
}

export type HuntJudge = 'edge' | 'tail'

// The chip's note report folded into what the panel already believes. It posts
// every 16 ms whether or not anything changed, and a store that turned over that
// often would re-render the keyboard sixty times a second to draw the same keys
// — so an unchanged report hands back the set that came in, and the caller can
// tell by identity that there is nothing to say.
//
// The report arrives as the worklet's whole buffer, because slicing it to
// length would allocate on the audio thread. Only the first `count` entries are
// this report; past that is the last one's, and reading it would light keys that
// have stopped sounding and never let them go dark.
export function mergeNotes(
  now: ReadonlySet<number>,
  notes: Int16Array,
  count = notes.length,
): ReadonlySet<number> {
  const n = Math.min(count, notes.length)
  if (n === 0) return now.size === 0 ? now : new Set()
  // Whether the report says what the panel already has, worked out without
  // building anything: the report arrives sixty times a second and mostly
  // repeats itself, and a subarray and a Set per post — twice over, for the two
  // chips — is four collections a frame to find out that nothing moved. The
  // sets match when every note reported is already lit and the two hold the same
  // number of distinct notes, which for nine of them is cheaper to count than to
  // allocate.
  let known = true
  let distinct = 0
  for (let i = 0; i < n; i++) {
    const note = notes[i]!
    known &&= now.has(note)
    let repeat = false
    for (let j = 0; j < i; j++) repeat ||= notes[j] === note
    if (!repeat) distinct++
  }
  if (known && distinct === now.size) return now
  const next = new Set<number>()
  for (let i = 0; i < n; i++) next.add(notes[i]!)
  return next
}

const FRAME_FALLBACK_MS = 50

// Runs `run` on the next animation frame, or after FRAME_FALLBACK_MS when no
// frame comes: a hidden tab pauses animation frames, and MIDI, drift and a hunt
// still have to reach the worklet. Returns a cancel.
function nextFrame(run: () => void): () => void {
  let done = false
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    done = true
    cancelAnimationFrame(frame)
    clearTimeout(timer)
  }
  const go = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    run()
  }
  frame = requestAnimationFrame(go)
  if (!done) timer = setTimeout(go, FRAME_FALLBACK_MS)
  return cancel
}

// An iPhone with its ring switch on silent mutes Web Audio as an ambient sound.
// Safari 16.4 and later let a page say it plays media, which keeps it audible.
function playThroughSilentSwitch() {
  const session: unknown = Reflect.get(navigator, 'audioSession')
  if (typeof session === 'object' && session !== null)
    Reflect.set(session, 'type', 'playback')
}

// Owns the AudioContext, the worklet node and the control values. The UI
// writes controls here; the engine coalesces them into one packed post per
// frame.
export class Engine {
  readonly controls = createStore<Controls>({ ...DEFAULT_CONTROLS })

  /** The rate the audio thread is running at, or the usual one before it is up. */
  sampleRate() {
    return this.ctx?.sampleRate ?? 48000
  }

  readonly meter: Store<Meter> & { set: (m: Meter) => void } =
    createStore<Meter>({
      peak: 0,
      scope: new Float32Array(512),
      tick: 0,
      drumClock: 0,
      drumStepMs: 0,
      hits: 0,
      tunePos: 0,
      tuneFrac: 0,
      monoSeqPos: 0,
      monoSeqFrac: 0,
      monoSeqStepMs: 0,
      tuneStepMs: 0,
      duck: 0,
      rail: 1,
      reboots: 0,
      rail2: 1,
      reboots2: 0,
      taps: new Float32Array(N_TAPS),
      walk: Uint8Array.from([0, 1, 2, 3, 4, 5]),
      dropped: 0,
      sampleSecs: 0,
      samplePos: 0,
      samplePlaying: false,
      sampleTaking: false,
      sampleUndo: 0,
      samplePeaks: new Float32Array(PEAK_BINS),
      sampleIn: 0,
      sampleOut: 1,
      fourHeads: new Float32Array(TRACKS),
      fourLaps: new Float32Array(TRACKS),
      fourPeaks: new Float32Array(TRACKS * PEAK_BINS),
      fourShed: new Float32Array(TRACKS * PEAK_BINS),
    })
  /** A hit played by hand writes the step it lands on. Off by default and never
      remembered: a machine that is recording you is a machine you asked to. */
  readonly drumRecord = createStore(false)
  /** The last hit recording took: its voices, the counter step it went to, and
      when. */
  readonly drumTaken = createStore<{
    bits: number
    tick: number
    at: number
  } | null>(null)
  /** And the same switch on the keyboard: what you play goes into the memory,
      on the step the chip is standing on. Off by default, for the same reason. */
  readonly tuneRecord = createStore(false)
  readonly seqRecord = createStore(false)
  /** The last note recording took: which memory, the step it went to, and
      when. */
  readonly noteTaken = createStore<{
    memory: 'tune' | 'seq'
    step: number
    at: number
  } | null>(null)
  readonly running = createStore(false)
  /** Why the audio engine cannot play: the worklet would not load, or its
      processor threw. '' while it is fine. */
  readonly fault = createStore('')
  readonly micOn = createStore(false)
  /** Why the microphone would not open, or '' while it has not failed. */
  readonly micError = createStore('')
  /** Why the last dropped file did not load, or '' when it did. */
  readonly sampleError = createStore('')
  // The two run lines, separately. The drum machine is its own box: it runs
  // without the demo song, which is what anybody who wanted to write a pattern
  // and hear it always expected of it.
  readonly songPlaying = createStore(false)
  readonly drumsPlaying = createStore(false)
  // Four spare patterns for the kit, next to the one on the grid — a place to
  // park a verse while you draw a chorus, not a preset: nothing seeds them and
  // nothing shares them, so a slot means nothing until you've put something in
  // it. Held here rather than in the grid's own state so a slot survives the
  // section closing and reopening, the way the running switches above it do.
  readonly drumSlots = createStore<(Partial<Controls> | null)[]>([
    null,
    null,
    null,
    null,
  ])
  readonly recording = createStore(false)
  readonly recSeconds = createStore(0)
  /** Why the last take could not be saved, or '' when it could. */
  readonly recError = createStore('')
  /** How much room the take has left once that is running short, or why the
      last take stopped early; '' otherwise. */
  readonly recNote = createStore('')
  /** Whether a take comes back as one file or as one per source plus the
      master. UI state rather than a control on the board: it changes nothing
      about what the instrument does, and a board control rides in the link, in
      every preset, in the undo walk and through a morph — none of which have
      anything to say about which files land in the downloads folder. It sits
      beside the mic switch and the two arm buttons, which are the other
      settings that are about you rather than about the circuit. */
  readonly recStems = createStore(false)
  readonly sampleName = createStore<string | null>(null)
  /** What a roll off archive.org is doing, or null when it is not doing one. */
  readonly archiveStep = createStore<string | null>(null)
  /** Where the sample on the tape came from, so the panel can credit it. */
  readonly archiveSource = createStore<{ id: string; title: string } | null>(
    null,
  )
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
  // Which candidate the hunt is on, one-based, and how many there are — the
  // panel says so while it listens, because a hunt is eight seconds of the
  // board cutting to strangers and the only thing that makes that read as work
  // rather than as a fault is a count going up. Null between hunts.
  readonly huntStep = createStore<{ board: number; of: number } | null>(null)
  /** The last hunt's candidates, best first, to pick another one from. */
  readonly hunted = createStore<Controls[]>([])
  /** True while the board is nudging itself along on a timer. */
  readonly drifting = createStore(false)
  /** Bars a whole-board change waits for while the kit runs, so it lands on
      the downbeat of the next run; 0 lands it at once. */
  readonly phraseLock = createStore<PhraseLock>(0)
  /** The counter tick a change waiting on the phrase lock lands on. */
  readonly waiting = createStore<{ tick: number } | null>(null)
  /** Controls pushed while a throw is held. They reach the audio thread over
      the board and never touch the board, the link or the walk. */
  readonly held = createStore<ReadonlyMap<string, Partial<Controls>>>(new Map())
  // Which semitones are down under a hand: the on-screen keys, the computer
  // keyboard, a controller on the wire. Held here rather than read back off the
  // chip because it is exact and immediate — the keys light on the press, not on
  // the next meter, and they light on a board whose audio has not started.
  readonly keysDown = createStore<ReadonlySet<number>>(new Set())
  // And what the chip says it is sounding, which is the rest of the board: the
  // ROM's tune, the backing under it, a note a drum hit struck through the
  // trigger patch. Yours show up in here too, a meter late.
  readonly chipNotes = createStore<ReadonlySet<number>>(new Set())
  // The same pair for the FM chip's keybed: what a hand is holding down on it,
  // and what its channels are sounding — which is its own keys, the toy's gate
  // wherever that jumper is still on, and whatever the kit's lines struck.
  readonly fmKeysDown = createStore<ReadonlySet<number>>(new Set())
  readonly fmNotes = createStore<ReadonlySet<number>>(new Set())
  // And the same pair again for the home keyboard, whose four voices one key
  // can fill on its own once the chord button is down.
  readonly pcmKeysDown = createStore<ReadonlySet<number>>(new Set())
  readonly pcmNotes = createStore<ReadonlySet<number>>(new Set())
  readonly monoKeysDown = createStore<ReadonlySet<number>>(new Set())
  readonly monoNotes = createStore<ReadonlySet<number>>(new Set())
  // Which sources are actually putting something on the bus, as a bit per
  // SOURCE_TAPS slot. A run switch says a sequencer is walking; this says the
  // fader in front of it is up and the machine behind it is making a sound,
  // which is a different question and the one the map wanted — the FM chip has
  // no switch to read at all, a sampler with nothing threaded has one that
  // lies, and a fader at zero is silence whatever is running.
  //
  // A mask rather than a set, so an unchanged report costs a number compare:
  // this is worked out sixty times a second and the map it feeds is a hundred
  // and seventy-nine elements to rebuild.
  readonly sounding = createStore(0)

  private ctx: AudioContext | null = null
  private booting: Promise<void> | undefined
  private node: AudioWorkletNode | null = null
  private masterGain: GainNode | null = null
  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private archiveRoll: AbortController | null = null
  private dirty = false
  private flushQueued = false
  // The board on the wire, written over rather than drawn fresh each flush.
  private readonly pack = new Float32Array(N_PARAMS)
  private huntToken = 0
  // When the last meter landed. A hit or a note played in is placed by carrying
  // the counters forward from where that meter said they stood.
  private meterAt = 0
  // What each source's meter is falling from. The taps come back as the peak
  // since the last post, so a kick read that way is one frame at full and then
  // nothing — the same needle the desk draws, held here so a source playing a
  // pattern reads as sounding between its own hits rather than flickering.
  private readonly soundHold = new Float32Array(MAX_SOURCES)

  private driftTimer: ReturnType<typeof setTimeout> | undefined
  private readonly queued = new Map<QueueSlot, Queued>()
  private readonly queueTimers = new Map<
    QueueSlot,
    ReturnType<typeof setTimeout>
  >()
  private driftTap: ReturnType<typeof setInterval> | undefined
  // Where a drift has been, a snapshot every DRIFT_TAP_S, newest last.
  private driftTrail: Controls[] = []

  constructor() {
    this.meter.subscribe(() => {
      this.meterAt = performance.now()
      this.checkQueue()
    })
  }

  async start() {
    this.booting ??= this.boot().catch((e: unknown) => {
      this.booting = undefined
      this.fault.set(`audio did not start: ${errorText(e)}`)
      throw e
    })
    await this.booting
    await this.ctx?.resume()
    this.running.set(this.ctx?.state === 'running')
  }

  // A fresh AudioContext is suspended until the page has seen a gesture, so
  // boot it on load and let the first click or key press take it live.
  //
  // Hands back the way to stop listening, so the caller can drop the two window
  // listeners without waiting for a gesture that may never come — which is also
  // what makes it honest as an effect.
  autostart(): () => void {
    const stop = () => {
      window.removeEventListener('pointerdown', go)
      window.removeEventListener('keydown', go)
    }
    const go = () => {
      this.start().then(() => {
        if (this.running.get()) stop()
      }, noop)
    }
    this.start().catch(noop)
    window.addEventListener('pointerdown', go)
    window.addEventListener('keydown', go)
    return stop
  }

  private async boot() {
    playThroughSilentSwitch()
    void sweepTakes()
    const ctx = new AudioContext()
    try {
      await this.mount(ctx)
    } catch (e) {
      void ctx.close()
      throw e
    }
  }

  private async mount(ctx: AudioContext) {
    await ctx.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(ctx, 'bender', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- assigning onmessage starts the port; a listener would need its own start()
    node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
      const msg = e.data
      if (msg.kind === 'meter') {
        const notes = mergeNotes(this.chipNotes.get(), msg.notes, msg.noteCount)
        if (notes !== this.chipNotes.get()) this.chipNotes.set(notes)
        const fm = mergeNotes(this.fmNotes.get(), msg.fmNotes, msg.fmNoteCount)
        if (fm !== this.fmNotes.get()) this.fmNotes.set(fm)
        const pcm = mergeNotes(
          this.pcmNotes.get(),
          msg.pcmNotes,
          msg.pcmNoteCount,
        )
        if (pcm !== this.pcmNotes.get()) this.pcmNotes.set(pcm)
        const mono = mergeNotes(
          this.monoNotes.get(),
          msg.monoNotes,
          msg.monoNoteCount,
        )
        if (mono !== this.monoNotes.get()) this.monoNotes.set(mono)
        this.meter.set({
          peak: msg.peak,
          scope: msg.scope,
          tick: msg.tick,
          drumClock: msg.drumClock,
          drumStepMs: msg.drumStepMs,
          hits: msg.hits,
          tunePos: msg.tunePos,
          tuneFrac: msg.tuneFrac,
          monoSeqPos: msg.monoSeqPos,
          monoSeqFrac: msg.monoSeqFrac,
          monoSeqStepMs: msg.monoSeqStepMs,
          tuneStepMs: msg.tuneStepMs,
          duck: msg.duck,
          rail: msg.rail,
          reboots: msg.reboots,
          rail2: msg.rail2,
          reboots2: msg.reboots2,
          taps: msg.taps,
          walk: msg.walk,
          dropped: msg.dropped,
          sampleSecs: msg.sampleSecs,
          samplePos: msg.samplePos,
          samplePlaying: msg.samplePlaying,
          sampleTaking: msg.sampleTaking,
          sampleUndo: msg.sampleUndo,
          samplePeaks: msg.samplePeaks,
          sampleIn: msg.sampleIn,
          sampleOut: msg.sampleOut,
          fourHeads: msg.fourHeads,
          fourLaps: msg.fourLaps,
          fourPeaks: msg.fourPeaks,
          fourShed: msg.fourShed,
        })
        const lit = soundingMask(msg.taps, this.soundHold)
        if (lit !== this.sounding.get()) this.sounding.set(lit)
      } else if (msg.kind === 'rec') this.onRecChunk(msg)
      else if (msg.kind === 'retro') this.onRetro(msg)
    }
    const masterGain = ctx.createGain()
    node.connect(masterGain).connect(ctx.destination)
    node.onprocessorerror = () => {
      this.fault.set('the audio engine stopped: reload the page')
      this.running.set(false)
    }
    this.masterGain = masterGain
    ctx.addEventListener('statechange', () => {
      this.running.set(ctx.state === 'running')
      if (ctx.state !== 'running' && ctx.state !== 'closed')
        this.resumeOnGesture(ctx)
    })
    this.ctx = ctx
    this.node = node
    this.post({ kind: 'params', pack: this.packLive() })
    this.postTransport()
  }

  private resumer: AbortController | undefined

  // The browser suspends the context when the page is backgrounded or a call
  // comes in, and only a gesture may bring it back.
  private resumeOnGesture(ctx: AudioContext) {
    this.resumer?.abort()
    const ctl = new AbortController()
    this.resumer = ctl
    const go = () => {
      ctl.abort()
      ctx.resume().catch(noop)
    }
    window.addEventListener('pointerdown', go, { signal: ctl.signal })
    window.addEventListener('keydown', go, { signal: ctl.signal })
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

  private stopMorphTick: (() => void) | null = null
  private morphTarget: Controls | null = null
  private armed: Controls | null = null

  private cancelMorph() {
    this.stopMorphTick?.()
    this.stopMorphTick = null
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
    this.cancelQueue()
    this.armed = null
    this.history.set(step.history)
    this.travel(step.value, seconds)
  }

  // Stop where it has got to and keep the half-way board, which is a board like
  // any other. Grabbing a slider does the same thing, through set().
  stopMorph() {
    this.cancelQueue()
    this.cancelMorph()
  }

  // Every whole-board verb — a preset, random, mutate, reset — comes through
  // here, so the walk covers all of them without each caller having to remember
  // to bank one. With the phrase lock on and the kit running, the change waits
  // to land on the next downbeat of the run, and banks when it sets off.
  morphTo(target: Controls, seconds = 1, forceKeys?: ReadonlySet<ControlKey>) {
    this.stopHunt()
    const land = () => {
      this.bank()
      this.travel(target, seconds, forceKeys)
    }
    if (this.queue('board', { land, seconds })) return
    this.morphNow(target, seconds, forceKeys)
  }

  /** A whole-board change that sets off at once, phrase lock or not. */
  morphNow(target: Controls, seconds = 1, forceKeys?: ReadonlySet<ControlKey>) {
    this.stopHunt()
    this.cancelQueue('board')
    this.bank()
    this.travel(target, seconds, forceKeys)
  }

  private counterReport(): CounterReport {
    const m = this.meter.get()
    return {
      tick: m.tick,
      clock: m.drumClock,
      stepMs: m.drumStepMs,
      ageMs: performance.now() - this.meterAt,
    }
  }

  /** How long a run of the phrase lock lasts at the kit's tempo, in seconds. */
  phraseSeconds(): number {
    return (this.phraseLock.get() * STEPS * this.meter.get().drumStepMs) / 1000
  }

  // One change waits in each slot: a board in one, a pattern in the other, so a
  // preset and a pattern pressed in the same bar land on the same downbeat. A
  // board replacing one still waiting keeps the drift chained to it, so a preset
  // pressed mid-drift lands and the drift carries on from there.
  private queue(slot: QueueSlot, q: Omit<Queued, 'tick'>): boolean {
    if (!this.drumsPlaying.get()) return false
    const tick = landingTick(
      this.counterReport(),
      this.phraseLock.get(),
      q.seconds,
    )
    if (tick === null) return false
    const after = q.after ?? this.queued.get(slot)?.after
    this.cancelQueue(slot)
    this.queued.set(slot, { ...q, after, tick })
    this.showWaiting()
    this.checkQueue()
    return true
  }

  private showWaiting() {
    const ticks = [...this.queued.values()].map(q => q.tick)
    const next = ticks.length ? { tick: Math.min(...ticks) } : null
    if (next?.tick !== this.waiting.get()?.tick) this.waiting.set(next)
  }

  private checkQueue() {
    for (const slot of QUEUE_SLOTS) {
      const q = this.queued.get(slot)
      if (!q || this.queueTimers.has(slot)) continue
      if (!this.drumsPlaying.get()) {
        this.fireQueue(slot)
        continue
      }
      const r = this.counterReport()
      const run = this.phraseLock.get() * STEPS
      const lead = msUntilTick(q.tick, r) - q.seconds * 1000 - QUEUE_LEAD_MS
      // A reboot or a restart put the counter back on zero, and the downbeat it
      // was waiting for is a lap away.
      if (run > 0 && lead > run * r.stepMs + 50) {
        const tick = landingTick(r, this.phraseLock.get(), q.seconds)
        if (tick !== null && tick !== q.tick) {
          q.tick = tick
          this.showWaiting()
        }
        continue
      }
      if (lead < QUEUE_WAKE_MS)
        this.queueTimers.set(
          slot,
          setTimeout(() => this.fireQueue(slot), Math.max(lead, 0)),
        )
    }
  }

  private fireQueue(slot: QueueSlot) {
    const q = this.queued.get(slot)
    this.cancelQueue(slot)
    if (!q) return
    this.armed = null
    q.land()
    this.flush()
    q.after?.()
  }

  private cancelQueue(slot?: QueueSlot) {
    for (const s of slot ? [slot] : QUEUE_SLOTS) {
      const timer = this.queueTimers.get(s)
      if (timer !== undefined) clearTimeout(timer)
      this.queueTimers.delete(s)
      this.queued.delete(s)
    }
    this.showWaiting()
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
  async hunt(
    candidates: Controls[],
    holdMs = 1400,
    judge: HuntJudge = 'edge',
  ): Promise<Controls | null> {
    if (candidates.length === 0) return null
    const token = ++this.huntToken
    this.stopDrift()
    this.bank()
    this.hunting.set(true)
    this.hunted.set([])
    const scored: { board: Controls; score: number }[] = []
    for (const [i, board] of candidates.entries()) {
      if (token !== this.huntToken) return null
      this.huntStep.set({ board: i + 1, of: candidates.length })
      this.writeLive(board)
      const score = await this.audition(holdMs, token, judge)
      if (token !== this.huntToken) return null
      scored.push({ board, score })
    }
    this.hunting.set(false)
    this.huntStep.set(null)
    const ranked = scored
      .toSorted((a, b) => b.score - a.score)
      .map(s => s.board)
    this.hunted.set(ranked)
    const best = ranked[0] ?? null
    if (best) this.writeLive(best)
    return best
  }

  /** Swap in another of the last hunt's boards. The hunt already banked its step. */
  pickHunted(i: number) {
    const board = this.hunted.get()[i]
    if (board) this.writeLive(board)
  }

  // Installation mode: every so often the board sets off for somewhere near
  // where it stands, and it never arrives anywhere it stays. Each leg travels
  // most of the way to the next one, so nothing ever cuts — what you hear is a
  // board that keeps moving rather than a board being replaced.
  //
  // No step is banked. A drift left running overnight would otherwise be a walk
  // of a thousand boards nobody chose, with the one you did choose at the far
  // end of it; the board you set drifting is still one undo away.
  startDrift(next: () => Controls, everyS = 15) {
    this.stopDrift()
    this.stopHunt()
    this.drifting.set(true)
    this.driftTrail = [this.controls.get()]
    this.driftTap = setInterval(() => {
      this.driftTrail = [...this.driftTrail, this.controls.get()].slice(
        -DRIFT_TRAIL,
      )
    }, DRIFT_TAP_S * 1000)
    // Each leg chains the next. Under the phrase lock a leg sets off so as to
    // arrive on a downbeat, and the next leaves for the downbeat after it.
    const leg = () => {
      this.driftTimer = undefined
      this.armed = null
      const seconds = this.phraseSeconds() * 0.85
      if (
        this.queue('board', {
          land: () => this.travel(next(), seconds),
          seconds,
          after: leg,
        })
      )
        return
      this.travel(next(), everyS * 0.85)
      this.driftTimer = setTimeout(leg, everyS * 1000)
    }
    leg()
  }

  stopDrift() {
    if (this.driftTimer !== undefined) clearTimeout(this.driftTimer)
    if (this.queued.get('board')?.after) this.cancelQueue('board')
    if (this.driftTap !== undefined) clearInterval(this.driftTap)
    this.driftTimer = undefined
    this.driftTap = undefined
    if (!this.drifting.get()) return
    this.drifting.set(false)
    // The leg in flight goes with the timer. Stopping says it keeps the board
    // wherever it has got to, and a leg left travelling would spend another
    // twelve seconds carrying it somewhere you did not ask for — which is the
    // drift still running by any name you would use for it.
    this.cancelMorph()
  }

  /** Stop drifting and go back to where the drift was `seconds` ago. */
  driftBack(seconds: number, travel = 1) {
    const back = Math.round(seconds / DRIFT_TAP_S)
    const trail = this.driftTrail
    const then = trail[Math.max(trail.length - back, 0)]
    this.stopDrift()
    if (then) this.morphNow(then, travel)
  }

  /** Cancel a hunt in flight and leave whatever board is playing on the board. */
  stopHunt() {
    if (!this.hunting.get()) return
    this.huntToken++
    this.hunting.set(false)
    this.huntStep.set(null)
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
  private audition(
    ms: number,
    token: number,
    judge: HuntJudge,
  ): Promise<number> {
    return new Promise(resolve => {
      const ducks: number[] = []
      const peaks: number[] = []
      const hits: number[] = []
      let settled = false
      const off = this.meter.subscribe(() => {
        if (!settled) return
        const m = this.meter.get()
        ducks.push(m.duck)
        peaks.push(m.peak)
        hits.push(m.hits)
      })
      const settle = setTimeout(() => (settled = true), Math.min(400, ms / 3))
      setTimeout(() => {
        clearTimeout(settle)
        off()
        const score =
          judge === 'tail'
            ? tailScore(ducks, peaks, hits)
            : edgeScore(ducks, peaks)
        resolve(token === this.huntToken ? score : -Infinity)
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

  // The kit's pattern alone — every row's mask and length, nothing else on the
  // board — copied into a spare slot.
  saveDrumSlot(i: number) {
    const board = this.controls.get()
    const patch: Partial<Controls> = {}
    for (const row of GRID_ROWS) {
      patch[row.key] = board[row.key]
      if (row.maybe) patch[row.maybe] = board[row.maybe]
      patch[row.len] = board[row.len]
    }
    const slots = this.drumSlots.get().slice()
    slots[i] = patch
    this.drumSlots.set(slots)
  }

  // Lands the same way a ROM does: one entry in the walk, so a slot you didn't
  // mean to load is one ctrl+z away from the pattern it replaced.
  loadDrumSlot(i: number) {
    const patch = this.drumSlots.get()[i]
    if (patch) this.writePattern(patch)
  }

  /** A new pattern over the board as it stands, on the next downbeat of the
      phrase lock while the kit runs, else at once. One entry in the walk. */
  writePattern(patch: Partial<Controls>) {
    const land = () => {
      this.armStep()
      this.writeBoard({ ...this.controls.get(), ...patch })
    }
    if (!this.queue('pattern', { land, seconds: 0 })) land()
  }

  // Travel to a new board over `seconds`, or land in one frame at zero. It sets
  // off from the *live* controls, so rolls chain: hitting random again halfway
  // through a morph leaves from where the board actually is rather than snapping
  // back to the last resting board first.
  private travel(
    target: Controls,
    seconds: number,
    forceKeys?: ReadonlySet<ControlKey>,
  ) {
    this.cancelMorph()
    const glide = new Glide(this.controls.get(), target, forceKeys)
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
      this.stopMorphTick = nextFrame(tick)
    }
    this.stopMorphTick = nextFrame(tick)
  }

  private flushSoon() {
    this.dirty = true
    if (this.flushQueued) return
    this.flushQueued = true
    nextFrame(() => {
      this.flushQueued = false
      if (this.dirty) this.flush()
    })
  }

  flush() {
    this.dirty = false
    this.post({ kind: 'params', pack: this.packLive() })
  }

  private packLive(): Float32Array {
    const held = this.held.get()
    if (held.size === 0) return packParams(this.controls.get(), this.pack)
    const live = { ...this.controls.get() }
    for (const patch of held.values()) Object.assign(live, patch)
    return packParams(live, this.pack)
  }

  holdThrow(name: string, patch: Partial<Controls>) {
    this.held.set(new Map(this.held.get()).set(name, patch))
    this.flushSoon()
  }

  letGoThrow(name: string) {
    if (!this.held.get().has(name)) return
    const next = new Map(this.held.get())
    next.delete(name)
    this.held.set(next)
    this.flushSoon()
  }

  private micPending: Promise<void> | null = null

  enableMic(): Promise<void> {
    this.micWanted = true
    this.micError.set('')
    this.micPending ??= this.openMic()
      .catch((e: unknown) => {
        this.micError.set(`microphone: ${errorText(e)}`)
        throw e
      })
      .finally(() => {
        this.micPending = null
      })
    return this.micPending
  }

  toggleMic() {
    if (this.micOn.get()) this.disableMic()
    else this.enableMic().catch(noop)
  }

  private async openMic() {
    if (!this.ctx || this.micStream) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    if (!this.micWanted) {
      for (const track of stream.getTracks()) track.stop()
      return
    }
    this.micStream = stream
    this.micSource = this.ctx.createMediaStreamSource(stream)
    this.micSource.connect(this.node!)
    this.micOn.set(true)
    for (const track of stream.getAudioTracks())
      track.addEventListener(
        'ended',
        () => {
          if (this.micStream === stream) this.disableMic()
        },
        { once: true },
      )
  }

  private micWanted = false

  disableMic() {
    this.micWanted = false
    this.micError.set('')
    this.micSource?.disconnect()
    for (const track of this.micStream?.getTracks() ?? []) track.stop()
    this.micSource = null
    this.micStream = null
    this.micOn.set(false)
  }

  async loadSample(file: File) {
    this.sampleError.set('')
    if (!this.ctx) {
      try {
        await this.start()
      } catch {
        return
      }
    }
    this.cancelRoll()
    this.archiveSource.set(null)
    try {
      await this.decodeOnto(await file.arrayBuffer(), file.name)
    } catch {
      this.sampleError.set(`${file.name} would not decode as audio`)
    }
  }

  // Whatever the bytes came from, the tape takes them the same way: folded to
  // mono, and cut to a length that is a sample rather than an outage — decoded
  // to float32 a half-hour broadcast is 345 MB, and it would go straight across
  // to the audio thread.
  private async decodeOnto(
    data: ArrayBuffer,
    name: string,
    signal?: AbortSignal,
  ) {
    if (!this.ctx) return
    const buf = await this.ctx.decodeAudioData(data)
    if (signal?.aborted) return
    const frames = Math.min(
      buf.length,
      Math.round(LOAD_SECONDS * buf.sampleRate),
    )
    const mono = new Float32Array(frames)
    // The channel count is read once. It is an attribute on the decoded buffer
    // rather than a number in hand, and asking for it inside the loop is a trip
    // across the binding per sample — 135 ms of held-up page for ninety seconds
    // of stereo against 25 ms for the same arithmetic, on a load that already
    // has the tab to itself.
    const channels = buf.numberOfChannels
    for (let ch = 0; ch < channels; ch++) {
      const chan = buf.getChannelData(ch)
      for (let i = 0; i < frames; i++) mono[i]! += chan[i]! / channels
    }
    // Scanned here, where 90 seconds of audio is a few milliseconds nobody is
    // listening to, rather than in the block that would otherwise have to.
    const peaks = peaksOf(mono)
    this.post({ kind: 'sample', mono, peaks }, [mono.buffer, peaks.buffer])
    this.sampleName.set(name)
    if (this.controls.get().sampleLevel === 0) this.set('sampleLevel', 0.7)
  }

  /** Drop the play head on the reel, 0..1 over the whole of it. */
  seekSample(frac: number) {
    this.post({ kind: 'seek', frac })
  }

  /** Ends the first take where the head stands, so the loop is as long as the
      take was. */
  closeTake() {
    this.post({ kind: 'closeTake' })
  }

  /** Swaps the reel with the copy made when the record head was last armed,
      which makes a second press a redo. */
  undoTake() {
    this.post({ kind: 'undoTake' })
  }

  /** A blank cassette in the four-track: every loop wiped, its wear gone. */
  blankFourTrack() {
    this.post({ kind: 'fourBlank' })
  }

  /**
   * A sample rolled off archive.org, so there is something on the tape without
   * you going and finding a file. One roll at a time: a second click while one
   * is in the air cancels the first rather than racing it onto the sampler.
   */
  async rollSample(pool: Pool) {
    await this.bringTape(
      `searching ${pool.label}…`,
      `nothing came back from ${pool.label}`,
      opts => roll({ ...opts, pool, rng: Math.random }),
    )
  }

  /** One item the archive search listed, onto the tape. */
  async loadArchive(item: { id: string; title: string }) {
    await this.bringTape(
      `reading ${item.title}…`,
      `no mp3 came back for ${item.title}`,
      opts => fetchItem(item.id, item.title, opts),
    )
  }

  /** What archive.org has for the words typed, most downloaded first. */
  searchArchive(typed: string) {
    return searchText(typed)
  }

  private async bringTape(
    first: string,
    missing: string,
    bring: (opts: {
      signal: AbortSignal
      onStep: (m: string) => void
    }) => Promise<Rolled | null>,
  ) {
    if (!this.ctx) return
    this.archiveRoll?.abort()
    const ctl = new AbortController()
    this.archiveRoll = ctl
    this.archiveStep.set(first)
    try {
      const got = await bring({
        signal: ctl.signal,
        onStep: m => {
          if (!ctl.signal.aborted) this.archiveStep.set(m)
        },
      })
      if (ctl.signal.aborted) return
      if (!got) {
        this.archiveStep.set(missing)
        return
      }
      await this.decodeOnto(got.data, got.title, ctl.signal)
      if (ctl.signal.aborted) return
      this.archiveSource.set({ id: got.id, title: got.title })
      this.archiveStep.set(null)
    } catch {
      if (!ctl.signal.aborted) this.archiveStep.set('that one would not decode')
    } finally {
      if (this.archiveRoll === ctl) this.archiveRoll = null
    }
  }

  cancelRoll() {
    this.archiveRoll?.abort()
    this.archiveRoll = null
    this.archiveStep.set(null)
  }

  // The take in progress: its sinks, one per file it will save, and a bit per
  // source that has ever risen above the floor. A take only saves files for
  // the sources that had something on them.
  private rec: Rec | null = null

  private onRecChunk(msg: RecMsg) {
    const rec = this.rec
    if (rec && msg.n) {
      rec.master.write(pcmStereo(msg.l, msg.r, msg.n))
      if (msg.stems) this.keepStems(rec, msg.stems, msg.n)
      rec.frames += msg.n
      const sr = this.sampleRate()
      this.recSeconds.set(rec.frames / sr)
      if (this.recording.get()) {
        const bytesPerSecond = (4 + 2 * rec.stems.length) * sr
        this.recNote.set(
          roomNote(rec.take.room() / bytesPerSecond, rec.take.limit()),
        )
      }
    }
    if (rec && this.recording.get()) {
      if (rec.take.room() <= 0) {
        rec.full = rec.take.limit()
        this.stopRecording()
      } else if (rec.take.failure()) {
        this.stopRecording()
      }
    }
    if (msg.done) void this.saveTake()
  }

  // The slabs converted on the way past, because the worklet goes on writing
  // over its buffers the moment this returns. Whether a source is worth a file
  // is settled here too, rather than by walking the whole take again at the end.
  private keepStems(rec: Rec, slabs: Float32Array[], n: number) {
    for (let k = 0; k < MAX_SOURCES; k++) {
      const slab = slabs[k]
      if (!slab) continue
      rec.stems[k]!.write(pcmMono(slab, n))
      if (rec.live & (1 << k)) continue
      for (let i = 0; i < n; i++) {
        if (slab[i]! > STEM_FLOOR || slab[i]! < -STEM_FLOOR) {
          rec.live |= 1 << k
          break
        }
      }
    }
  }

  // A click per stem where there was one. There is no zip here and there is
  // not going to be — the dependency list is four packages — so a stem take is
  // however many downloads it is, named so the folder sorts itself: one stamp,
  // one file per source, and the master under the same stamp. A browser may ask
  // whether this site can download several files at once; that prompt is the
  // cost of not shipping an archiver.
  private async saveTake() {
    const rec = this.rec
    this.rec = null
    if (!rec) return
    const { take, master, stems, frames, live } = rec
    const closed = new Set<WavSink>()
    const shut = async (sink: WavSink) => {
      const file = await sink.close()
      closed.add(sink)
      return file
    }
    try {
      if (!frames) {
        master.discard()
        for (const stem of stems) stem.discard()
        return
      }
      const files = [await shut(master)]
      for (const [k, stem] of stems.entries()) {
        if (live & (1 << k)) files.push(await shut(stem))
        else stem.discard()
      }
      for (const file of files) this.deliver(file)
      this.recNote.set(
        rec.full ? `stopped early: out of ${LIMIT_NOUN[rec.full]}` : '',
      )
    } catch (e) {
      for (const sink of [master, ...stems])
        if (!closed.has(sink)) sink.discard()
      this.recNote.set('')
      this.recError.set(errorText(e))
    } finally {
      take.end()
    }
  }

  /** Where a finished file goes in place of the downloads folder, when a page
      wants to hand it on itself. */
  takeTo: ((file: File) => void) | null = null

  private deliver(file: File) {
    if (this.takeTo) {
      this.takeTo(file)
      return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  private retro: { l: Float32Array; r: Float32Array }[] = []
  private retroWant: 'wav' | 'reel' | null = null

  private onRetro(msg: RetroMsg) {
    const sr = this.sampleRate()
    if (msg.n) {
      this.retro.push({
        l: msg.l.subarray(0, msg.n),
        r: msg.r.subarray(0, msg.n),
      })
      let frames = this.retro.reduce((n, c) => n + c.l.length, 0)
      while (frames - this.retro[0]!.l.length >= RETRO_S * sr) {
        frames -= this.retro.shift()!.l.length
      }
    }
    if (!msg.done || !this.retroWant) return
    const want = this.retroWant
    this.retroWant = null
    if (want === 'wav') {
      this.deliver(
        new File(
          [encodeWav(this.retro, sr)],
          `bender-${stamp()}-last${RETRO_S}s.wav`,
          { type: 'audio/wav' },
        ),
      )
      return
    }
    const frames = this.retro.reduce((n, c) => n + c.l.length, 0)
    const mono = new Float32Array(frames)
    let at = 0
    for (const c of this.retro) {
      for (let i = 0; i < c.l.length; i++)
        mono[at + i] = 0.5 * (c.l[i]! + c.r[i]!)
      at += c.l.length
    }
    const peaks = peaksOf(mono)
    this.post({ kind: 'sample', mono, peaks }, [mono.buffer, peaks.buffer])
    this.sampleName.set(`last ${RETRO_S}s`)
  }

  /** The last half minute of output, kept whether or not anything was recording. */
  keepLast(to: 'wav' | 'reel') {
    if (!this.node) return
    this.retroWant = to
    this.post({ kind: 'retroFlush' })
  }

  startRecording() {
    if (!this.node || this.recording.get() || this.rec) return
    const stems = this.recStems.get()
    const take = openTake(this.sampleRate())
    const at = stamp()
    this.rec = {
      take,
      master: take.wav(
        stems ? `bender-${at}-master.wav` : `bender-${at}.wav`,
        2,
      ),
      stems: stems
        ? STEM_FILES.map(name => take.wav(`bender-${at}-${name}.wav`, 1))
        : [],
      frames: 0,
      live: 0,
      full: '',
    }
    this.recError.set('')
    this.recNote.set('')
    this.recSeconds.set(0)
    this.recording.set(true)
    this.post({ kind: 'record', on: true, stems })
  }

  // Stopping is what saves it: the worklet's last slab carries done, and the
  // files land in the downloads folder.
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

  // What a board arriving already running plays into: a link opens a full
  // circuit nobody has heard yet, so the first sound out of it starts from
  // nothing and climbs rather than landing at whatever level it was left.
  // Every other run line — the two buttons, space — leaves the gain alone,
  // since by then you've already heard the board and know what it does.
  fadeIn(seconds = 1.5) {
    const ctx = this.ctx
    const gain = this.masterGain
    if (!ctx || !gain) return
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + seconds)
  }

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

  /** Every run line up, whatever each was doing. A button that says start has
      to start: the toggle above reads a board that is already running as one to
      stop, and the run lines can be up before anybody has pressed anything —
      a tab puts back what it was running (see runState). */
  runAll() {
    this.setRun(true, true)
  }

  // A key, on one keybed or the other. The memory is the toy's, so only the
  // toy's keys are written into it — the FM chip has no sequencer to record to
  // and a note played on it should not land in somebody else's tune.
  noteOn(semitone: number, gain = 1, dest: NoteDest = 'toy') {
    const note = this.locked(semitone)
    this.struck[dest].set(semitone, note)
    this.post({ kind: 'noteOn', semitone: note, gain, dest })
    this.hold(note, true, dest)
    if (dest === 'toy' && this.tuneRecord.get() && this.songPlaying.get())
      this.writeNote(note)
    if (this.recordsSeq(dest)) this.writeSeqNote(note)
  }

  sfx(dest: 'toy' | 'fm', sfx: number, on: boolean) {
    this.post({ kind: 'sfx', sfx, on, dest })
  }

  noteOff(semitone: number, dest: NoteDest = 'toy') {
    const struck = this.struck[dest]
    const note = struck.get(semitone) ?? this.locked(semitone)
    struck.delete(semitone)
    this.post({ kind: 'noteOff', semitone: note, dest })
    this.hold(note, false, dest)
    if (dest === 'toy' && this.tuneRecord.get() && this.songPlaying.get())
      this.writeHeld(note)
    if (this.recordsSeq(dest)) this.writeSeqHeld(note)
  }

  /** Whether a key, as pressed rather than as the scale lock snapped it, is
      down on `dest`. */
  isStruck(semitone: number, dest: NoteDest): boolean {
    return this.struck[dest].has(semitone)
  }

  // Each key down and the note the lock snapped it to, so the release lets go of
  // that note even after the scale has changed under it.
  private readonly struck: Record<NoteDest, Map<number, number>> = {
    toy: new Map(),
    fm: new Map(),
    pcm: new Map(),
    mono: new Map(),
  }

  // The key line's matrix, taken here rather than down on the wire: the drawn
  // keybeds light what is down, so the key that lights has to be the key that
  // sounds. Recording is on the far side of it too, because what the memory
  // takes is what you heard yourself play.
  private locked(semitone: number) {
    const c = this.controls.get()
    return snap(semitone, c.keyScale, c.keyRoot)
  }

  // Arming the memory puts it on: recording into a memory the chip is not
  // playing is the one state where every light says it is working and nothing
  // you play comes back. Which tune was up is a control like any other, so the
  // walk has it and one undo puts the demo song back.
  armTuneRecord(on: boolean) {
    if (on && this.controls.get().chipTune !== YOURS) {
      this.armStep()
      this.set('chipTune', YOURS)
    }
    this.tuneRecord.set(on)
    if (on) this.setSongPlaying(true)
  }

  /** Arming the second melody puts it on, and aims it at the bed whose rec cap
      was pressed. Keys on any other bed play and are not written. */
  armSeqRecord(on: boolean, dest?: SeqDest) {
    if (on) {
      const c = this.controls.get()
      const to = dest === undefined ? c.monoSeqTo : SEQ_DESTS.indexOf(dest)
      if (c.monoSeqOn !== 1 || c.monoSeqTo !== to) {
        this.armStep()
        this.patch({ monoSeqOn: 1, monoSeqTo: to })
        this.commitStep()
      }
    }
    this.seqRecord.set(on)
    if (on) this.setSongPlaying(true)
  }

  private recordsSeq(dest: NoteDest) {
    return (
      this.seqRecord.get() &&
      this.songPlaying.get() &&
      dest === SEQ_DESTS[Math.round(this.controls.get().monoSeqTo)]
    )
  }

  // Arming runs the kit. Armed and stopped, every hit sounds and none is kept,
  // and nothing about playing says so.
  armDrumRecord(on: boolean) {
    this.drumRecord.set(on)
    if (on) this.setDrumsPlaying(true)
  }

  // The counters run ahead of the ear by everything between the worklet and the
  // speaker, which on Bluetooth is a couple of hundred milliseconds: more than
  // a step at most tempos. A hand plays to what it hears.
  private latencyMs() {
    const ctx = this.ctx
    if (!ctx) return 0
    return ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000
  }

  // Where each key that is down struck — the step, and which of the memory's
  // three lanes took it, so that letting it go spells that note's length out in
  // holds without writing over the lane beside it. A map because a hand plays
  // chords, and the toy sounds four of them.
  private struckAt = new Map<number, { step: number; lane: number }>()

  /** Which step of the memory a note played now belongs to. */
  private tuneStep(): number {
    const m = this.meter.get()
    const { tick, phase } = heardStep({
      tick: m.tunePos,
      clock: m.tuneFrac,
      stepMs: m.tuneStepMs,
      ageMs: performance.now() - this.meterAt,
      latencyMs: this.latencyMs(),
    })
    return quantizeStep(tick, phase, asTuneLen(this.controls.get().tuneLen))
  }

  private seqStruckAt = new Map<number, number>()

  private seqStep(): number {
    const m = this.meter.get()
    const { tick, phase } = heardStep({
      tick: m.monoSeqPos,
      clock: m.monoSeqFrac,
      stepMs: m.monoSeqStepMs,
      ageMs: performance.now() - this.meterAt,
      latencyMs: this.latencyMs(),
    })
    return quantizeStep(tick, phase, asTuneLen(this.controls.get().monoSeqLen))
  }

  private writeSeqNote(semitone: number) {
    const step = this.seqStep()
    const note = foldNote(semitone)
    const key = MONO_SEQ_STEP_KEYS[step]!
    this.seqStruckAt.set(semitone, step)
    this.noteTaken.set({ memory: 'seq', step, at: performance.now() })
    if (this.controls.get()[key] !== note) {
      this.armStep()
      this.set(key, note)
    }
  }

  // Holds for a key let go of later, written under the same entry as its note.
  private writeSeqHeld(semitone: number) {
    const from = this.seqStruckAt.get(semitone)
    if (from === undefined) return
    this.seqStruckAt.delete(semitone)
    const c = this.controls.get()
    const len = asTuneLen(c.monoSeqLen)
    const to = this.seqStep()
    if (to === from) return
    const held: Partial<Controls> = {}
    for (let i = 1; i < len; i++) {
      const at: number = (from + i) % len
      const key = MONO_SEQ_STEP_KEYS[at]!
      if (at === to || c[key] !== REST) break
      held[key] = HOLD
    }
    if (Object.keys(held).length > 0) this.patch(held)
  }

  private stepKey(step: number, lane = 0): TuneStepKey {
    const keys = TUNE_LANE_KEYS[lane]!
    return keys[step % keys.length]!
  }

  // A note played by hand, filed on the step the chip is standing on. One entry
  // in the walk per note, the same as a hit on the kit: a hand that has just
  // played the wrong note wants that note back and nothing else.
  private writeNote(semitone: number) {
    const step = this.tuneStep()
    const c = this.controls.get()
    const note = foldNote(semitone)
    // A chord played in lands as a chord: the melody lane takes the first note
    // and the stacked chips take what your other fingers are holding. With the
    // memory in mono there is one lane, and the last key down is the note on
    // the step — which is what the toy did.
    const lane = laneForNote(c, step, note, Math.round(c.tunePoly) === 1)
    this.struckAt.set(semitone, { step, lane })
    this.noteTaken.set({ memory: 'tune', step, at: performance.now() })
    const key = this.stepKey(step, lane)
    if (c[key] !== note) {
      this.armStep()
      this.set(key, note)
    }
  }

  // The rest of the note. A key held across steps is one long note, which the
  // memory spells as the step it struck on followed by holds — and its length is
  // only known when the key comes up, so that is when the holds are written.
  //
  // Written without banking a step of its own, so the whole note is one entry in
  // the walk: undo takes back the note rather than its tail, and then its head.
  // A step already carrying something is where the run stops — a note somebody
  // else played is not this note's to lengthen.
  private writeHeld(semitone: number) {
    const struck = this.struckAt.get(semitone)
    if (struck !== undefined) {
      this.struckAt.delete(semitone)
      const { step: from, lane } = struck
      const len = asTuneLen(this.controls.get().tuneLen)
      const to = this.tuneStep()
      const held: Partial<Controls> = {}
      // Let go on the step it struck on and the note is that step and no more.
      // The counter says where the memory is, not how many times it has been
      // round, so a key down for no time and one down for exactly a bar are the
      // same reading — and of the two, filling the whole memory with holds off a
      // tap is the one that ruins what you played.
      if (to !== from)
        for (let i = 1; i < len; i++) {
          const at = (from + i) % len
          const key = this.stepKey(at, lane)
          if (at === to || this.controls.get()[key] !== REST) break
          held[key] = HOLD
        }
      if (Object.keys(held).length > 0) this.patch(held)
    }
  }

  // A hit on the kit that no step named: a pad on a controller, or the row's own
  // name on the grid, played by hand. Neither sequencer need be running — the
  // kit answers a finger the way it answers the mic — but the kit does have to
  // be turned up, because Level is the switch that decides the box is there at
  // all.
  //
  // A hit recorded late in a step goes to the next one, which the kit has yet
  // to play, so the kit is told to leave it out once rather than play it twice.
  drumHit(bits: number, gain = 1) {
    if (bits === 0) return
    if (!this.drumRecord.get() || !this.drumsPlaying.get()) {
      this.post({ kind: 'drumHit', bits, gain })
      return
    }
    const tick = this.heardDrumTick()
    this.post({ kind: 'drumHit', bits, gain, skipTick: tick })
    this.writeHit(bits, tick)
    this.drumTaken.set({ bits, tick, at: performance.now() })
  }

  // The counter step a hit played now belongs to, rounded to the nearer. Swing
  // is in it, because a held-back offbeat is a longer step and half of it is
  // somewhere else. Before the worklet has said how long a step is, the tempo
  // knob stands in.
  private heardDrumTick(): number {
    const m = this.meter.get()
    const c = this.controls.get()
    const swing = Math.min(Math.max(c.drumSwing, 0), 0.9)
    const { tick, phase } = heardStep(
      {
        tick: m.tick,
        clock: m.drumClock,
        stepMs: m.drumStepMs || 15000 / Math.max(c.drumBpm, 1),
        ageMs: performance.now() - this.meterAt,
        latencyMs: this.latencyMs(),
      },
      t => (t % 2 === 0 ? 1 + swing * 0.5 : 1 - swing * 0.5),
    )
    return quantizeStep(tick, phase, CYCLE)
  }

  // A hit played by hand, written onto the grid. Each row takes its own column,
  // because each carries its own length — a five-step hat is somewhere else in
  // the bar than the kick is. One entry in the walk per hit: a hand that has
  // just played the wrong pad wants that hit back and nothing else.
  private writeHit(bits: number, tick: number) {
    const controls = this.controls.get()
    // Worked out before anything is written, so the whole hit is one gesture:
    // arming per voice would bank a step per voice, and arming for a hit that
    // lands on steps already written would leave an arm nothing commits — which
    // the next gesture banks instead of the board it set off from.
    const writes: [DrumStepKey | DrumMaybeKey, number][] = []
    for (const [v, voice] of DRUM_VOICES.entries()) {
      if ((bits & (1 << v)) === 0) continue
      const len = asLen(controls[voice.len])
      const bit = stepBit(tick % len)
      const mask = asMask(controls[voice.key])
      if ((mask & bit) === 0) writes.push([voice.key, mask | bit])
      // A hand playing a hit onto a step is asking for that hit, so a step it
      // lands on comes off the dice: what you played back is what you played.
      const dice = asMask(controls[voice.maybe])
      if (dice & bit) writes.push([voice.maybe, dice & ~bit])
    }
    if (writes.length === 0) return
    this.armStep()
    for (const [key, value] of writes) this.set(key, value)
  }

  // Striking a note that is already down is no news to anything watching, so
  // the set only turns over when it really changes.
  private hold(semitone: number, down: boolean, dest: NoteDest) {
    const store =
      dest === 'fm'
        ? this.fmKeysDown
        : dest === 'pcm'
          ? this.pcmKeysDown
          : dest === 'mono'
            ? this.monoKeysDown
            : this.keysDown
    const notes = store.get()
    if (notes.has(semitone) === down) return
    const next = new Set(notes)
    if (down) next.add(semitone)
    else next.delete(semitone)
    store.set(next)
  }

  panic() {
    this.held.set(new Map())
    this.patch({ fbAmt: 0, dlyFb: Math.min(this.controls.get().dlyFb, 1) })
    this.flush()
    this.post({ kind: 'panic' })
    for (const struck of Object.values(this.struck)) struck.clear()
    if (this.keysDown.get().size > 0) this.keysDown.set(new Set())
    if (this.fmKeysDown.get().size > 0) this.fmKeysDown.set(new Set())
    if (this.pcmKeysDown.get().size > 0) this.pcmKeysDown.set(new Set())
    if (this.monoKeysDown.get().size > 0) this.monoKeysDown.set(new Set())
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

function stamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export const engine = new Engine()

// A hot update would build a second engine beside the one holding the audio context.
import.meta.hot?.accept(() => location.reload())
