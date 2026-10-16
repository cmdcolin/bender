// 16-bit PCM in a canonical 44-byte-header RIFF file. Two channels for the
// master, one for a stem — see the recorder for why a stem is mono.

export const WAV_HEADER = 44

/** The master: the stereo pair, interleaved. */
export function encodeWav(
  chunks: { l: Float32Array; r: Float32Array }[],
  sr: number,
): Blob {
  const frames = chunks.reduce((n, c) => n + c.l.length, 0)
  const pcm = chunks.map(c => pcmStereo(c.l, c.r, c.l.length))
  return new Blob([wavHeader(frames * 4, 2, sr), ...pcm], {
    type: 'audio/wav',
  })
}

/** One source's stem, which arrives as a run of slabs the way the master does. */
export function encodeMonoWav(chunks: Float32Array[], sr: number): Blob {
  const frames = chunks.reduce((n, c) => n + c.length, 0)
  const pcm = chunks.map(c => pcmMono(c, c.length))
  return new Blob([wavHeader(frames * 2, 1, sr), ...pcm], {
    type: 'audio/wav',
  })
}

/** The header for `bytes` of sample data. */
export function wavHeader(
  bytes: number,
  channels: number,
  sr: number,
): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(WAV_HEADER)
  const view = new DataView(buf)
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(at + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * channels * 2, true) // byte rate
  view.setUint16(32, channels * 2, true) // block align
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, bytes, true)
  return new Uint8Array(buf)
}

/** The first `n` frames of a stereo pair, interleaved. */
export function pcmStereo(
  l: Float32Array,
  r: Float32Array,
  n: number,
): Int16Array<ArrayBuffer> {
  const out = new Int16Array(n * 2)
  for (let i = 0; i < n; i++) {
    out[2 * i] = pcm16(l[i]!)
    out[2 * i + 1] = pcm16(r[i]!)
  }
  return out
}

/** The first `n` samples of one channel. */
export function pcmMono(x: Float32Array, n: number): Int16Array<ArrayBuffer> {
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) out[i] = pcm16(x[i]!)
  return out
}

function pcm16(x: number): number {
  const clamped = Math.max(-1, Math.min(1, x))
  return Math.round(clamped * (clamped < 0 ? 32768 : 32767))
}
