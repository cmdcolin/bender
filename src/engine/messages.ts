import type { WildPack } from '../dsp/arc.ts'
import type { UndoTape } from '../dsp/stages/sampler.ts'
import type { NoteDest } from '../machines.ts'

export interface ParamsMsg {
  kind: 'params'
  pack: Float32Array
}

export interface WildMsg {
  kind: 'wild'
  wild: WildPack | null
}

export interface SampleMsg {
  kind: 'sample'
  mono: Float32Array
  /** The clip's envelope, drawn on the main thread on the way over: scanning a
      minute and a half of audio is several audio blocks long, and the block is
      where the sampler would otherwise have to do it. */
  peaks: Float32Array
  undo: UndoTape
}

/** A blank cassette in the four-track: every loop wiped and its wear gone.
    What is on the tape is not a control, so this travels as a gesture. */
export interface FourBlankMsg {
  kind: 'fourBlank'
}

/** Drop the play head somewhere on the reel, 0..1 over the whole of it. Where
    the head stands is not a control — it is where the tape has got to — so it
    travels as a gesture rather than in the param pack. */
export interface SeekMsg {
  kind: 'seek'
  frac: number
}

/** Close the first take where the head stands, so the loop is as long as the
    take was. Where the head stands is the worklet's to say, so this travels as
    a gesture and the cut lands on the block it arrives in. */
export interface CloseTakeMsg {
  kind: 'closeTake'
}

/** Swap the reel with the copy made when the record head was last armed. */
export interface UndoTakeMsg {
  kind: 'undoTake'
}

/** Which keybed a note came off. The toy's gate is the default and reaches the
    machines on its gate line too wherever those jumpers are still soldered on;
    the others are the beds drawn under it, each wired only to its own chip. */
export type { NoteDest }

/** The machines the second melody can play, in the order of its Plays on choice. */
export const SEQ_DESTS = [
  'mono',
  'fm',
  'pcm',
  'lead',
] as const satisfies readonly NoteDest[]
export type SeqDest = (typeof SEQ_DESTS)[number]

export interface NoteMsg {
  kind: 'noteOn' | 'noteOff'
  semitone: number
  dest?: NoteDest
  /** How hard the gate arrives, 0 to 1. The toy's own keys are switches and
      always send 1; a wire soldered onto the gate — the trigger patch, or a
      controller — is what can strike softly. */
  gain?: number
}

// A hit on the kit from outside the sequencer: a pad struck by hand. `bits` is
// the bit order of a step, so one message can name a whole kit's worth.
export interface DrumHitMsg {
  kind: 'drumHit'
  bits: number
  /** How hard it lands, the way an accented step lands harder than a plain one. */
  gain: number
  /** The step a recorded hit was written to. If the counter has yet to reach
      it, the kit leaves these voices out of it once, so the hit sounds once. */
  skipTick?: number
}

/** A hand on the sheet or the bottle, at x and y as fractions of its face. */
export interface StruckHitMsg {
  kind: 'struckHit'
  target: 'sheet' | 'bottle'
  x: number
  y: number
  gain: number
}

/** Prattle speaking its phrase from the top. */
export interface TalkMsg {
  kind: 'talk'
}

/** An effect button going down or coming up, on the toy's deck or Glint's. */
export interface SfxMsg {
  kind: 'sfx'
  sfx: number
  on: boolean
  dest: 'toy' | 'fm'
}

// Both run lines in one message: they are two switches on one desk, and the
// worklet has no use for knowing which of them the hand moved.
export interface TransportMsg {
  kind: 'transport'
  tune: boolean
  drums: boolean
}

export interface RecordMsg {
  kind: 'record'
  on: boolean
  /** Whether this take runs the per-source tape as well as the master. Settled
      when the take is armed and never mid-take: six tracks that start half way
      through are six files nobody can line up. */
  stems?: boolean
}

/** Writes the panel's line back over whatever a fault left in a memory's RAM. */
export interface LineRestoreMsg {
  kind: 'lineRestore'
  card: 'mono' | 'lead'
}

export interface PanicMsg {
  kind: 'panic'
}

/** Post whatever the rolling tape holds right now, however short the slab. */
export interface RetroFlushMsg {
  kind: 'retroFlush'
}

/** Params to land when the kit's counter reaches tick `at`: `pack` holds the
    values, and `mask` marks which of them the cue writes. */
export interface CueMsg {
  kind: 'cue'
  id: number
  at: number
  pack: Float32Array
  mask: Uint8Array
}

export interface UncueMsg {
  kind: 'uncue'
}

/** Whether the live view is watching each source's bands. */
export interface BandsMsg {
  kind: 'bands'
  on: boolean
}

export type ToWorklet =
  | ParamsMsg
  | CueMsg
  | UncueMsg
  | SampleMsg
  | SeekMsg
  | CloseTakeMsg
  | UndoTakeMsg
  | FourBlankMsg
  | NoteMsg
  | DrumHitMsg
  | StruckHitMsg
  | TalkMsg
  | SfxMsg
  | TransportMsg
  | RecordMsg
  | PanicMsg
  | LineRestoreMsg
  | RetroFlushMsg
  | WildMsg
  | BandsMsg

export interface MeterMsg {
  kind: 'meter'
  peak: number
  scope: Float32Array
  /** Steps the drum sequencer has clocked, for the grid's playheads: each row
      is this modulo its own length. */
  tick: number
  /** How far into the current step the counter has got, in unswung steps, and
      how long an unswung step lasts at the rate it is clocking. */
  drumClock: number
  drumStepMs: number
  /** The id of the last cue the counter landed, 0 before any. */
  cued: number
  /** Voices the kit has fired since the last meter, as the bit order of a step.
      The grid lights off this, so a hit from the mic, a bridged trigger line or
      a pad shows on the row it struck rather than only in the air. */
  hits: number
  /** The strays Wander put on the bar the kit is playing, packed by
      `packStrays`. */
  strays: number
  /** How far into the wild board the arc stands, 0 to 1. */
  arc: number
  /** Where the tune's step counter is standing, and how far through that step
      it has got — the clock a note played into the memory is quantized against.
      The chip's own, because every bend that drags it is in there. */
  tunePos: number
  tuneFrac: number
  monoSeqPos: number
  monoSeqFrac: number
  monoSeqStepMs: number
  leadSeqPos: number
  leadSeqFrac: number
  leadSeqStepMs: number
  /** What each memory's RAM holds, its accent and slide bits, and the steps
      whose cell differs from the panel's. The memories' own buffers, posted
      untransferred like the scope. */
  monoSeqRam: Float32Array
  monoSeqFlags: Uint8Array
  monoSeqDamage: number
  leadSeqRam: Float32Array
  leadSeqFlags: Uint8Array
  leadSeqDamage: number
  tuneStepMs: number
  /** How hard the limiter has been leaning since the last meter, 0 to 1. */
  duck: number
  /** The toy supply, 0 at the floor and 1 at full cells — the number the pitch,
      the tempo and the brownouts all come off. */
  rail: number
  /** Times the watchdog has power-cycled the chip, so the panel can flash on a
      reboot rather than try to catch the 70 ms the rail is down for. */
  reboots: number
  /** The second cells, and their watchdog's count. */
  rail2: number
  reboots2: number
  /** Blocks in which a stage's output went non-finite, and the stage that last
      did it: see the chain's own `faults`. */
  faults: number
  faultStage: string
  /** Every note each keybed's chip is sounding, in `KEYBEDS` order, in its own
      semitones: the toy's tune, backing and key voices, and whatever a hand,
      the toy's gate or a drum line put on the others. The panel's keyboards
      light off this, which is how a note nobody pressed (the ROM's, or one a
      drum hit struck) reaches the screen at all.

      The worklet's own buffers, posted untransferred like the record slabs, so
      `keyNoteCounts` says how much of each is this report and the rest is last
      report's. */
  keyNotes: Int16Array[]
  keyNoteCounts: number[]
  /** What each source, the mic and the mix bus itself have peaked at since the
      last meter — the chain's taps, in `SOURCE_TAPS` order with the mic and the
      bus above them. The worklet's own buffer, cleared the moment it is posted
      — the serializer copies it on the way across, so what arrives is this
      read and nothing of the next one. */
  taps: Float32Array
  /** How far each source's duck vactrol darkened its channel since the last
      meter, 0 to 1, in `SOURCE_TAPS` order. The chain's own buffer, cleared
      once posted like `taps`. */
  ldr: Float32Array
  /** Each source's and the mic's octave bands over the last meter, in tap
      order, `BAND_HZ` wide: see the chain's `bands`. Zero unless the live view
      asked for them. */
  bands: Float32Array
  /** What the bend rack is actually running, which is not what its six controls
      say whenever Solder is up: `walk[k]` is the position the signal reads at
      its kth step, and bit k of `dropped` says that step's joint was open. The
      chain's own buffer, posted untransferred like the scope. */
  walk: Uint8Array
  dropped: number
  /** The reel: how long it is in seconds (0 with no tape threaded), where the
      play head stands over the whole of it, whether it is turning, and what is
      on it. The envelope is the sampler's own buffer, posted untransferred like
      the scope — the record head rewrites the tape every lap, so what it looks
      like is news the same way the trace is. */
  sampleSecs: number
  samplePos: number
  samplePlaying: boolean
  sampleTaking: boolean
  sampleUndo: number
  samplePeaks: Float32Array
  /** The stretch of reel that came round last block, 0..1 over the whole of
      it. Not the two knobs: a wire off the bay onto the markers moves the
      window per sample, and the reel draws the tape rather than the controls. */
  sampleIn: number
  sampleOut: number
  /** The four-track's loops, in loop order: where each head stands over its
      loop, how long a lap takes at the speed the deck is running (0 with no
      tape threaded), and each loop's envelope and wear, `PEAK_BINS` a loop.
      The stage's own buffers, posted untransferred like the reel's. */
  fourHeads: Float32Array
  fourLaps: Float32Array
  fourPeaks: Float32Array
  fourShed: Float32Array
}

// One slab of recorded output; the last one of a take arrives with done set.
// The two arrays are the worklet's own, posted untransferred so the audio
// thread allocates nothing per slab — `n` says how much of them is this slab,
// and copying that much out is the receiver's job.
export interface RecMsg {
  kind: 'rec'
  l: Float32Array
  r: Float32Array
  n: number
  done: boolean
  /** One mono slab per source, in `SOURCE_TAPS` order, on a stem take — the
      worklet's own buffers again, and `n` counts for these too, so the whole
      take stays one set of slabs that all start and end together. Absent on a
      master-only take, which is what the tape does when nobody asked for stems. */
  stems?: Float32Array[]
}

// The output, always, a slab at a time, so the last half minute can be kept
// after the fact. `done` answers a flush.
export interface RetroMsg {
  kind: 'retro'
  l: Float32Array
  r: Float32Array
  n: number
  done: boolean
}

export type FromWorklet = MeterMsg | RecMsg | RetroMsg
