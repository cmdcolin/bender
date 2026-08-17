declare const sampleRate: number

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: unknown): boolean
}

declare function registerProcessor(
  name: string,
  ctor: new () => AudioWorkletProcessor,
): void
