export interface ParamsMsg {
  kind: 'params'
  pack: Float32Array
}

export interface SampleMsg {
  kind: 'sample'
  mono: Float32Array
}

export interface NoteMsg {
  kind: 'noteOn' | 'noteOff'
  semitone: number
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
  ParamsMsg | SampleMsg | NoteMsg | TransportMsg | RecordMsg | PanicMsg

export interface MeterMsg {
  kind: 'meter'
  peak: number
  scope: Float32Array
  /** Steps the drum sequencer has clocked, for the grid's playheads: each row
      is this modulo its own length. */
  tick: number
  /** How hard the limiter has been leaning since the last meter, 0 to 1. */
  duck: number
  /** The toy supply, 0 at the floor and 1 at full cells — the number the pitch,
      the tempo and the brownouts all come off. */
  rail: number
  /** Times the watchdog has power-cycled the chip, so the panel can flash on a
      reboot rather than try to catch the 70 ms the rail is down for. */
  reboots: number
}

// One slab of recorded output; the last one of a take arrives with done set.
export interface RecMsg {
  kind: 'rec'
  l: Float32Array
  r: Float32Array
  done: boolean
}

export type FromWorklet = MeterMsg | RecMsg
