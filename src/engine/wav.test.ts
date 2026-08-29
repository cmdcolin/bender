import { expect, test } from 'vitest'
import { encodeMonoWav, encodeWav } from './wav'

async function bytes(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

test('wav header describes 16-bit stereo at the given rate', async () => {
  const chunk = { l: new Float32Array(4), r: new Float32Array(4) }
  const v = await bytes(encodeWav([chunk, chunk], 44100))
  expect(
    String.fromCharCode(
      v.getUint8(0),
      v.getUint8(1),
      v.getUint8(2),
      v.getUint8(3),
    ),
  ).toBe('RIFF')
  expect(v.getUint16(22, true)).toBe(2)
  expect(v.getUint32(24, true)).toBe(44100)
  expect(v.getUint16(34, true)).toBe(16)
  expect(v.getUint32(40, true)).toBe(8 * 4)
  expect(v.byteLength).toBe(44 + 8 * 4)
})

test('samples land interleaved, clamped at the rails', async () => {
  const l = new Float32Array([0, 1, -1, 2])
  const r = new Float32Array([-0.5, 0, 0, -3])
  const v = await bytes(encodeWav([{ l, r }], 48000))
  expect(v.getInt16(44, true)).toBe(0)
  expect(v.getInt16(46, true)).toBe(-16384)
  expect(v.getInt16(48, true)).toBe(32767)
  expect(v.getInt16(52, true)).toBe(-32768)
  expect(v.getInt16(56, true)).toBe(32767)
  expect(v.getInt16(58, true)).toBe(-32768)
})

// A stem is one channel — see the recorder for why — so the header has to say
// so in all four places a wav says it, not just the channel count.
test('a mono wav declares one channel all the way through its header', async () => {
  const v = await bytes(encodeMonoWav([new Float32Array(4)], 48000))
  expect(v.getUint16(22, true)).toBe(1)
  expect(v.getUint32(24, true)).toBe(48000)
  expect(v.getUint32(28, true)).toBe(48000 * 2) // byte rate
  expect(v.getUint16(32, true)).toBe(2) // block align
  expect(v.getUint32(40, true)).toBe(4 * 2)
  expect(v.byteLength).toBe(44 + 4 * 2)
})

// The take arrives as a run of slabs and comes out as one file, in order.
test('mono samples land in slab order, clamped at the rails', async () => {
  const v = await bytes(
    encodeMonoWav(
      [new Float32Array([0, -0.5]), new Float32Array([1, -2])],
      44100,
    ),
  )
  expect(v.getInt16(44, true)).toBe(0)
  expect(v.getInt16(46, true)).toBe(-16384)
  expect(v.getInt16(48, true)).toBe(32767)
  expect(v.getInt16(50, true)).toBe(-32768)
})
