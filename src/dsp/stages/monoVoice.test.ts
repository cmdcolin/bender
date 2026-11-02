import { describe, expect, it } from 'vitest'

import { MonoVoice, SYNC, WAVE, type MonoPatch } from './monoVoice.ts'

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

  it('lets a held note decaying to no sustain land on zero', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, { aD: 0.01, aS: 0, fD: 0.01, fS: 0 })
    v.noteOn(36)
    const x = new Float32Array(SR)
    for (let s = 0; s < 20; s++) v.render(x, 0, x.length)
    const { aEnv, fEnv } = v as unknown as {
      aEnv: { level: number }
      fEnv: { level: number }
    }
    expect(aEnv.level).toBe(0)
    expect(fEnv.level).toBe(0)
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

  it('swings about zero with feedback at 1 and drive at 4', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, { loop: 1, drive: 4, emphasis: 1.1, cutoff: 800 })
    v.noteOn(57)
    const x = new Float32Array(3 * SR)
    v.render(x, 0, x.length)
    const tail = x.subarray(2 * SR)
    const mean = tail.reduce((s, y) => s + y, 0) / tail.length
    let crossings = 0
    for (let i = 1; i < tail.length; i++)
      if (tail[i - 1]! < 0 !== tail[i]! < 0) crossings++
    expect(Math.abs(mean)).toBeLessThan(0.1)
    expect(crossings).toBeGreaterThan(20)
    expect(Math.abs(Reflect.get(v, 'last'))).toBeLessThan(10)
  })

  it('keeps out to pitch and out to gate finite and under full scale at every extreme', () => {
    for (const loopPitch of [0.5, 1])
      for (const choke of [0, 0.5, 1])
        for (const loop of [0, 1]) {
          const x = play(
            {
              loopPitch,
              choke,
              loop,
              drive: 4,
              emphasis: 1.1,
              cutoff: 12000,
              linFm: 4,
              sync: SYNC.hard,
            },
            57,
            1,
          )
          expect(x.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(
            true,
          )
        }
  })

  it('breaks up the period of an open note with out to pitch', () => {
    const open = { cutoff: 2500, emphasis: 0.9, drive: 2, contour: 1 }
    const repeat = (x: Float32Array) => {
      const at = SR
      const n = 2048
      let best = 0
      for (let lag = 48; lag <= 1200; lag++) {
        let c = 0
        let e0 = 0
        let e1 = 0
        for (let i = 0; i < n; i++) {
          c += x[at + i]! * x[at + i + lag]!
          e0 += x[at + i]! ** 2
          e1 += x[at + i + lag]! ** 2
        }
        best = Math.max(best, c / Math.sqrt(e0 * e1))
      }
      return best
    }
    expect(repeat(play(open, 57, 1.5))).toBeGreaterThan(0.95)
    expect(repeat(play({ ...open, loopPitch: 1 }, 57, 1.5))).toBeLessThan(0.8)
  })

  it('stutters a held note with out to gate', () => {
    const closes = (choke: number) => {
      const v = new MonoVoice(SR)
      Object.assign(v.patch, { loop: 1, drive: 4, emphasis: 1.1, choke })
      v.noteOn(57)
      const aEnv = Reflect.get(v, 'aEnv') as { stage: number }
      const x = new Float32Array(128)
      let count = 0
      let was = aEnv.stage
      for (let b = 0; b < SR / 128; b++) {
        v.render(x, 0, 128)
        if (aEnv.stage === 3 && was !== 3) count++
        was = aEnv.stage
      }
      return count
    }
    expect(closes(0)).toBe(0)
    expect(closes(0.7)).toBeGreaterThan(5)
  })

  it('leaves the gate closed for a key struck while out to gate holds it', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, { loop: 1, drive: 4, emphasis: 1.1, choke: 0.7 })
    v.noteOn(57)
    const x = new Float32Array(1)
    let n = 0
    while (!Reflect.get(v, 'choked') && n < SR) {
      v.render(x, 0, 1)
      n++
    }
    expect(Reflect.get(v, 'choked')).toBe(true)
    v.noteOff(57)
    v.noteOn(60)
    const aEnv = Reflect.get(v, 'aEnv') as { stage: number }
    expect(aEnv.stage).toBe(3)
  })

  it('keeps regulator trip finite and under full scale through its cycles', () => {
    const x = play(
      {
        regTrip: 1,
        loop: 1,
        drive: 4,
        emphasis: 1.1,
        cutoff: 12000,
        loopPitch: 1,
        choke: 0.5,
      },
      57,
      30,
    )
    expect(x.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true)
  })

  function regulatorRun(regTrip: number, secs: number) {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, { regTrip })
    v.noteOn(57)
    const reg = Reflect.get(v, 'regulator') as {
      tripped: boolean
      build: number
      rail: number
    }
    const x = new Float32Array(128)
    const trips: number[] = []
    const recoveries: number[] = []
    const peakBuild: number[] = []
    let lowestRail = 1
    let build = 0
    let was = false
    for (let b = 0; b < (secs * SR) / 128; b++) {
      v.render(x, 0, 128)
      if (reg.tripped && !was) {
        trips.push((b * 128) / SR)
        peakBuild.push(build)
      }
      if (!reg.tripped && was) recoveries.push((b * 128) / SR)
      if (reg.tripped) lowestRail = Math.min(lowestRail, reg.rail)
      else build = reg.build
      was = reg.tripped
    }
    return { trips, recoveries, peakBuild, lowestRail }
  }

  it('warms, trips, sputters and runs clean again with regulator trip at full', () => {
    const run = regulatorRun(1, 40)
    expect(run.trips.length).toBeGreaterThanOrEqual(2)
    expect(run.trips[0]).toBeGreaterThan(4)
    expect(run.recoveries.length).toBeGreaterThanOrEqual(2)
    expect(Math.min(...run.peakBuild)).toBeGreaterThan(0.3)
    expect(run.lowestRail).toBeLessThan(0.1)
    for (let i = 0; i < run.recoveries.length; i++)
      expect(run.recoveries[i]! - run.trips[i]!).toBeGreaterThan(2)
  })

  it('starts each regulator cycle clean after it recovers', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, { regTrip: 1 })
    v.noteOn(57)
    const reg = Reflect.get(v, 'regulator') as {
      tripped: boolean
      build: number
    }
    const x = new Float32Array(128)
    let was = false
    let after = -1
    for (let b = 0; b < (30 * SR) / 128 && after < 0; b++) {
      v.render(x, 0, 128)
      if (!reg.tripped && was) after = reg.build
      was = reg.tripped
    }
    expect(after).toBe(0)
  })

  it('cycles the regulator faster at full than near the bottom, and trips at both', () => {
    const low = regulatorRun(0.15, 90).trips.length
    const full = regulatorRun(1, 90).trips.length
    expect(low).toBeGreaterThanOrEqual(1)
    expect(full).toBeGreaterThan(2 * low)
  })

  it('plays again after panic clears a NaN out of its oscillator and sag state', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, OPEN)
    for (const field of ['sagEnv', 'v1', 'v2', 'pinkish'])
      Reflect.set(v, field, NaN)
    Reflect.set(Reflect.get(v, 'osc0'), 'phase', NaN)
    v.panic()
    v.noteOn(45)
    const out = new Float32Array(SR / 4)
    v.render(out, 0, out.length)
    expect(out.every(Number.isFinite)).toBe(true)
    expect(out.some(x => Math.abs(x) > 0.01)).toBe(true)
  })
})
