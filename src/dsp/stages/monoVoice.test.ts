import { describe, expect, it } from 'vitest'

import { MonoVoice, SYNC, WAVE, type MonoPatch } from './monoVoice'

const SR = 48000

function play(patch: Partial<MonoPatch>, note: number, secs: number) {
  const v = new MonoVoice(SR)
  Object.assign(v.patch, patch)
  v.noteOn(note)
  const out = new Float32Array(Math.round(secs * SR))
  v.render(out, 0, out.length)
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

  // Osc 2 alone at 1.4 times osc 1: free it runs at 154 Hz, hard sync resets
  // it at 1.4 each cycle so one zero crossing is left, and soft sync passes it
  // at 0.4 and resets it at 0.8, so it runs 2.8 cycles every two of osc 1.
  it.each([
    [SYNC.off, 154],
    [SYNC.hard, 110],
    [SYNC.soft, 165],
  ])('sync mode %d puts osc 2 at %d Hz', (sync, hz) => {
    const x = play(
      {
        ...OPEN,
        level: [0, 1, 0],
        range: [0, 0, 0],
        fine: [0, 12 * Math.log2(1.4), 0],
        sync,
      },
      45,
      1,
    )
    expect(pitch(x)).toBeCloseTo(hz, 0)
  })

  it('soft sync pulls a slave just under an octave up onto it', () => {
    const x = play(
      {
        ...OPEN,
        level: [0, 1, 0],
        range: [0, 0, 0],
        fine: [0, 11, 0],
        sync: SYNC.soft,
      },
      45,
      1,
    )
    expect(pitch(x)).toBeCloseTo(220, 0)
  })

  it('keeps osc 1 at the key pitch under linear FM and changes its shape', () => {
    const patch = (linFm: number) => ({
      ...OPEN,
      wave: [WAVE.saw, WAVE.tri, WAVE.tri] as MonoPatch['wave'],
      level: [1, 0, 0] as MonoPatch['level'],
      range: [0, 0, 0] as MonoPatch['range'],
      fine: [0, 0, 0] as MonoPatch['fine'],
      linFm,
    })
    const plain = play(patch(0), 45, 1)
    const fm = play(patch(0.6), 45, 1)
    expect(pitch(fm)).toBeCloseTo(110, 0)
    let diff = 0
    let level = 0
    for (let i = SR / 2; i < SR; i++) {
      diff += (fm[i]! - plain[i]!) ** 2
      level += plain[i]! ** 2
    }
    expect(Math.sqrt(diff / level)).toBeGreaterThan(0.1)
  })

  it('glides to a legato note', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, {
      ...OPEN,
      level: [1, 0, 0],
      range: [0, 0, 0],
      glide: 0.05,
    })
    v.noteOn(45)
    v.render(new Float32Array(SR / 2), 0, SR / 2)
    v.noteOn(57)
    const x = new Float32Array(SR)
    v.render(x, 0, x.length)
    expect(pitch(x)).toBeCloseTo(220, 0)
  })

  it('goes silent after release unless the VCA leaks', () => {
    const tail = (leak: number) => {
      const v = new MonoVoice(SR)
      Object.assign(v.patch, { vcaLeak: leak })
      v.noteOn(36)
      v.render(new Float32Array(SR / 4), 0, SR / 4)
      v.noteOff(36)
      const x = new Float32Array(SR)
      v.render(x, 0, x.length)
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
          sync: Math.floor(3 * r()),
          linFm: 4 * r(),
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
