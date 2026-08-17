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
  /** Which step the drum sequencer is on, for the grid's playhead. */
  step: number
}

// One slab of recorded output; the last one of a take arrives with done set.
export interface RecMsg {
  kind: 'rec'
  l: Float32Array
  r: Float32Array
  done: boolean
}

export type FromWorklet = MeterMsg | RecMsg
