// 16-bit stereo PCM in a canonical 44-byte-header RIFF file.
export function encodeWav(chunks: { l: Float32Array; r: Float32Array }[], sr: number): Blob {
  const frames = chunks.reduce((n, c) => n + c.l.length, 0)
  const buf = new ArrayBuffer(44 + frames * 4)
  const view = new DataView(buf)
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + frames * 4, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true) // stereo
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * 4, true) // byte rate
  view.setUint16(32, 4, true) // block align
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, frames * 4, true)

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

function pcm16(x: number): number {
  const clamped = Math.max(-1, Math.min(1, x))
  return Math.round(clamped * (clamped < 0 ? 32768 : 32767))
}
