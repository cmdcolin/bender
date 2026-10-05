import { describe, expect, it } from 'vitest'

import { MonoVoice, WAVE, type MonoPatch } from './monoVoice'

const SR = 48000

function play(patch: Partial<MonoPatch>, note: number, secs: number) {
  const v = new MonoVoice(SR)
  Object.assign(v.patch, patch)
  v.noteOn(note)
  const out = new Float32Array(Math.round(secs * SR))
  v.render(out)
  return out
}

function pitch(x: Float32Array) {
  let first = -1
  let last = -1
  let n = 0
  for (let i = x.length >> 1; i < x.length; i++) {
    if (x[i - 1]! < 0 && x[i]! >= 0) {
      if (first < 0) first = i
      last = i
      n++
    }
  }
  return ((n - 1) * SR) / (last - first)
}

const OPEN = { emphasis: 0, cutoff: 15000, contour: 0, drift: 0 }

describe('MonoVoice', () => {
  it('plays a saw at the key pitch', () => {
    const x = play({ ...OPEN, level: [1, 0, 0], range: [0, 0, 0] }, 45, 1)
    expect(pitch(x)).toBeCloseTo(110, 0)
  })

  it('drops an octave per range step', () => {
    const x = play({ ...OPEN, level: [1, 0, 0], range: [-2, 0, 0] }, 57, 1)
    expect(pitch(x)).toBeCloseTo(55, 0)
  })

  it.each([55, 220, 880, 3000])(
    'self-oscillates at a %d Hz cutoff with the oscillators down',
    hz => {
      const x = play(
        { level: [0, 0, 0], emphasis: 1.05, cutoff: hz, contour: 0, track: 0 },
        48,
        2,
      )
      expect(pitch(x) / hz).toBeGreaterThan(0.98)
      expect(pitch(x) / hz).toBeLessThan(1.02)
    },
  )

  it('glides to a legato note', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, {
      ...OPEN,
      level: [1, 0, 0],
      range: [0, 0, 0],
      glide: 0.05,
    })
    v.noteOn(45)
    v.render(new Float32Array(SR / 2))
    v.noteOn(57)
    const x = new Float32Array(SR)
    v.render(x)
    expect(pitch(x)).toBeCloseTo(220, 0)
  })

  it('goes silent after release unless the VCA leaks', () => {
    const tail = (leak: number) => {
      const v = new MonoVoice(SR)
      Object.assign(v.patch, { vcaLeak: leak })
      v.noteOn(36)
      v.render(new Float32Array(SR / 4))
      v.noteOff(36)
      const x = new Float32Array(SR)
      v.render(x)
      return Math.max(...x.subarray(SR / 2).map(Math.abs))
    }
    expect(tail(0)).toBeLessThan(1e-3)
    expect(tail(0.5)).toBeGreaterThan(0.05)
  })

  it('keeps random patches finite and under full scale', () => {
    let seed = 7
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let t = 0; t < 30; t++) {
      const x = play(
        {
          wave: [WAVE.narrow, WAVE.saw, WAVE.square],
          emphasis: 1.1 * r(),
          drive: 4 * r(),
          loop: r(),
          cutoff: 20 + 15000 * r() ** 2,
          contour: 5 * r(),
          modAmt: r(),
          modFilter: 4 * r(),
          modPitch: 12 * r(),
          mismatch: r(),
          sync: r() < 0.5,
          heat: r(),
          noise: r(),
          sag: r(),
          envOsc2: 24 * r(),
          vcaLeak: r(),
        },
        24 + Math.floor(48 * r()),
        0.3,
      )
      expect(x.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true)
    }
  })
})
