export interface ParamsMsg {
  kind: 'params'
  pack: Float32Array
}

export interface SampleMsg {
  kind: 'sample'
  mono: Float32Array
  /** The clip's envelope, drawn on the main thread on the way over: scanning a
      minute and a half of audio is several audio blocks long, and the block is
      where the sampler would otherwise have to do it. */
  peaks: Float32Array
}

/** Drop the play head somewhere on the reel, 0..1 over the whole of it. Where
    the head stands is not a control — it is where the tape has got to — so it
    travels as a gesture rather than in the param pack. */
export interface SeekMsg {
  kind: 'seek'
  frac: number
}

/** Which keybed a note came off. The toy's gate is the default and reaches the
    FM chip too wherever that jumper is still soldered on; 'fm' is the other
    keybed, which is soldered to nothing but the chip it is drawn on. */
export type NoteDest = 'toy' | 'fm'

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
}

export interface PanicMsg {
  kind: 'panic'
}

export type ToWorklet =
  | ParamsMsg
  | SampleMsg
  | SeekMsg
  | NoteMsg
  | DrumHitMsg
  | TransportMsg
  | RecordMsg
  | PanicMsg

export interface MeterMsg {
  kind: 'meter'
  peak: number
  scope: Float32Array
  /** Steps the drum sequencer has clocked, for the grid's playheads: each row
      is this modulo its own length. */
  tick: number
  /** Voices the kit has fired since the last meter, as the bit order of a step.
      The grid lights off this, so a hit from the mic, a bridged trigger line or
      a pad shows on the row it struck rather than only in the air. */
  hits: number
  /** Where the tune's step counter is standing, and how far through that step
      it has got — the clock a note played into the memory is quantized against.
      The chip's own, because every bend that drags it is in there. */
  tunePos: number
  tuneFrac: number
  /** How hard the limiter has been leaning since the last meter, 0 to 1. */
  duck: number
  /** The toy supply, 0 at the floor and 1 at full cells — the number the pitch,
      the tempo and the brownouts all come off. */
  rail: number
  /** Times the watchdog has power-cycled the chip, so the panel can flash on a
      reboot rather than try to catch the 70 ms the rail is down for. */
  reboots: number
  /** Every note the chip is sounding, in its own semitones — the tune, the
      backing and the key voices. The panel's keyboard lights off this, which is
      how a note nobody pressed (the ROM's, or one a drum hit struck) reaches the
      screen at all.

      The worklet's own buffer, posted untransferred like the record slabs, so
      `noteCount` says how much of it is this report and the rest is last
      report's. */
  notes: Int16Array
  noteCount: number
  /** The same, for the FM chip's own keybed: what its four channels are holding
      down, whether a hand, the toy's gate or a drum line put them there. */
  fmNotes: Int16Array
  fmNoteCount: number
  /** What each source, the mic and the mix bus itself have peaked at since the
      last meter — the chain's taps, in `SOURCE_TAPS` order with the mic and the
      bus above them. The worklet's own buffer, cleared the moment it is posted
      — the serializer copies it on the way across, so what arrives is this
      read and nothing of the next one. */
  taps: Float32Array
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
  samplePeaks: Float32Array
  /** The stretch of reel that came round last block, 0..1 over the whole of
      it. Not the two knobs: a wire off the bay onto the markers moves the
      window per sample, and the reel draws the tape rather than the controls. */
  sampleIn: number
  sampleOut: number
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
}

export type FromWorklet = MeterMsg | RecMsg
