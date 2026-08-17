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

export interface PanicMsg {
  kind: 'panic'
}

export type ToWorklet = ParamsMsg | SampleMsg | NoteMsg | TransportMsg | PanicMsg

export interface MeterMsg {
  kind: 'meter'
  peak: number
  scope: Float32Array
}

export type FromWorklet = MeterMsg
