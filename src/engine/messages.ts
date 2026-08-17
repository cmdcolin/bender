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

export interface TransportMsg {
  kind: 'transport'
  playing: boolean
}

export interface RecordMsg {
  kind: 'record'
  on: boolean
}

export interface PanicMsg {
  kind: 'panic'
}

export type ToWorklet = ParamsMsg | SampleMsg | NoteMsg | TransportMsg | RecordMsg | PanicMsg

export interface MeterMsg {
  kind: 'meter'
  peak: number
  scope: Float32Array
}

// One slab of recorded output; the last one of a take arrives with done set.
export interface RecMsg {
  kind: 'rec'
  l: Float32Array
  r: Float32Array
  done: boolean
}

export type FromWorklet = MeterMsg | RecMsg
