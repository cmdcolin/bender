// 16-bit PCM in a canonical 44-byte-header RIFF file. Two channels for the
// master, one for a stem — see the recorder for why a stem is mono.

/** The master: the stereo pair, interleaved. */
export function encodeWav(
  chunks: { l: Float32Array; r: Float32Array }[],
  sr: number,
): Blob {
  const frames = chunks.reduce((n, c) => n + c.l.length, 0)
  const { buf, view } = riff(frames, 2, sr)
  let at = 44
  for (const c of chunks) {
    for (let i = 0; i < c.l.length; i++) {
      view.setInt16(at, pcm16(c.l[i]!), true)
      view.setInt16(at + 2, pcm16(c.r[i]!), true)
      at += 4
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** One source's stem, which arrives as a run of slabs the way the master does. */
export function encodeMonoWav(chunks: Float32Array[], sr: number): Blob {
  const frames = chunks.reduce((n, c) => n + c.length, 0)
  const { buf, view } = riff(frames, 1, sr)
  let at = 44
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      view.setInt16(at, pcm16(c[i]!), true)
      at += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

function riff(frames: number, channels: number, sr: number) {
  const bytes = frames * channels * 2
  const buf = new ArrayBuffer(44 + bytes)
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
  return { buf, view }
}

function pcm16(x: number): number {
  const clamped = Math.max(-1, Math.min(1, x))
  return Math.round(clamped * (clamped < 0 ? 32768 : 32767))
}
