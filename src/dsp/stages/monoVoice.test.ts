import { describe, expect, it } from 'vitest'

import { bin, lowEnergy, rms } from '../testRender.ts'
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
    expect(Math.abs(v['last'])).toBeLessThan(10)
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

  const REGULATOR_SECS = 50
  const runs = new Map<number, ReturnType<typeof simulateRegulator>>()
  const regulatorRun = (regTrip: number) => {
    const known = runs.get(regTrip)
    const run = known ?? simulateRegulator(regTrip, REGULATOR_SECS)
    runs.set(regTrip, run)
    return run
  }

  function simulateRegulator(regTrip: number, secs: number) {
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
    const run = regulatorRun(1)
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
    const low = regulatorRun(0.15).trips.length
    const full = regulatorRun(1).trips.length
    expect(low).toBeGreaterThanOrEqual(1)
    expect(full).toBeGreaterThan(2 * low)
  })

  const DARK_BASS: Partial<MonoPatch> = {
    wave: [WAVE.saw, WAVE.tri, WAVE.square],
    range: [-1, -1, -2],
    fine: [0, -12, 0],
    level: [0.8, 0.7, 0],
    cutoff: 140,
    emphasis: 0.2,
    drive: 1.6,
    contour: 0.6,
    drift: 0,
  }
  const attack = (x: Float32Array) => rms(x.subarray(0, 0.03 * SR))
  const kick = (patch: Partial<MonoPatch>) => {
    const off = play(patch, 48, 0.6)
    const on = play({ ...patch, thump: 1 }, 48, 0.6)
    return rms(on.map((v, i) => v - off[i]!))
  }

  it('kicks the attack of a dark bass with VCA thump, softer with a slow attack', () => {
    const off = attack(play(DARK_BASS, 48, 0.1))
    const on = attack(play({ ...DARK_BASS, thump: 1 }, 48, 0.1))
    expect(on).toBeGreaterThan(1.2 * off)
    expect(kick({ ...DARK_BASS, aA: 0.3 })).toBeLessThan(0.3 * kick(DARK_BASS))
  })

  function struck(patch: Partial<MonoPatch>, accent: boolean) {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, DARK_BASS, { accent: 1 }, patch)
    v.noteOn(48, 1, accent)
    const out = new Float32Array(0.4 * SR)
    v.render(out, 0, 0.3 * SR)
    v.noteOff(48)
    v.render(out, 0.3 * SR, out.length)
    return out
  }
  const thumped = (
    patch: Partial<MonoPatch>,
    accent: boolean,
    from: number,
    to: number,
  ) => {
    const off = struck(patch, accent).subarray(from * SR, to * SR)
    const on = struck({ ...patch, thump: 1 }, accent).subarray(
      from * SR,
      to * SR,
    )
    return rms(on.map((v, i) => v - off[i]!))
  }

  it('thumps harder on an accent and kicks back on a short release', () => {
    expect(thumped({}, true, 0, 0.05)).toBeGreaterThan(
      1.3 * thumped({}, false, 0, 0.05),
    )
    expect(thumped({ aR: 0.005 }, false, 0.3, 0.36)).toBeGreaterThan(
      3 * thumped({ aR: 0.5 }, false, 0.3, 0.36),
    )
  })

  const LEAD: Partial<MonoPatch> = {
    wave: [WAVE.saw, WAVE.saw, WAVE.tri],
    range: [0, 0, -1],
    fine: [0, 0, 0],
    level: [0.8, 0.6, 0],
    cutoff: 600,
    contour: 2.5,
    drive: 2.5,
    emphasis: 0.3,
    drift: 0,
  }
  const held = (x: Float32Array) => x.subarray(SR, 1.5 * SR)

  it('folds a note into its sub-octave with the folding pair full', () => {
    const off = held(play(LEAD, 60, 1.5))
    const on = held(play({ ...LEAD, fold: 1 }, 60, 1.5))
    const hz = 261.63
    expect(bin(off, hz / 2)).toBeLessThan(0.01 * bin(off, hz))
    expect(bin(on, hz / 2)).toBeGreaterThan(0.3 * bin(on, hz))
  })

  it('reshapes the note without leaving its pitch with the folding pair at half', () => {
    const off = held(play(LEAD, 60, 1.5))
    const half = held(play({ ...LEAD, fold: 0.5 }, 60, 1.5))
    const hz = 261.63
    expect(bin(half, hz / 2)).toBeLessThan(0.01 * bin(half, hz))
    let diff = 0
    for (let i = 0; i < off.length; i++) diff += (half[i]! - off[i]!) ** 2
    expect(Math.sqrt(diff / off.length) / rms(off)).toBeGreaterThan(0.1)
  })

  it('keeps sounding through a held note with both new faults, the emphasis and the drive at full', () => {
    const x = play(
      {
        ...LEAD,
        fold: 1,
        thump: 1,
        drive: 4,
        emphasis: 1.1,
        loop: 1,
        cutoff: 12000,
      },
      60,
      4,
    )
    expect(x.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true)
    for (let t = 0; t < 4; t += 0.1)
      expect(rms(x.subarray(t * SR, (t + 0.1) * SR))).toBeGreaterThan(0.01)
  })

  // `pitch` reads the second half of what it is given.
  const hzBetween = (x: Float32Array, from: number, to: number) =>
    pitch(x.subarray(Math.round((2 * from - to) * SR), Math.round(to * SR)))

  it('moves the pitch of a held key with the cutoff once the output is on the sync input', () => {
    const saw = {
      level: [1, 0, 0] as [number, number, number],
      range: [0, 0, 0] as [number, number, number],
      drift: 0,
      contour: 0,
      track: 0,
    }
    const at = (cutoff: number, loopSync: number) =>
      pitch(play({ ...saw, cutoff, loopSync }, 45, 1))
    expect(at(200, 0)).toBeCloseTo(110, 0)
    expect(at(1600, 0)).toBeCloseTo(110, 0)
    expect(at(200, 0.7)).toBeGreaterThan(125)
    expect(at(1600, 0.7) / at(200, 0.7)).toBeGreaterThan(1.3)
  })

  it('stalls a square bass under its key with the sync threshold at zero', () => {
    const square = {
      wave: [WAVE.square, WAVE.square, WAVE.square] as [number, number, number],
      drift: 0,
    }
    const off = play(square, 36, 2)
    const on = play({ ...square, loopSync: 1 }, 36, 2)
    expect(pitch(on)).toBeLessThan(0.7 * pitch(off))
    expect(lowEnergy(on) / rms(on)).toBeGreaterThan(lowEnergy(off) / rms(off))
    expect(rms(on)).toBeGreaterThan(0.5 * rms(off))
  })

  it('bends the ladder’s own ringing with the output on the cutoff input', () => {
    const ring = {
      level: [0, 0, 0] as [number, number, number],
      emphasis: 1.05,
      cutoff: 220,
      contour: 0,
      track: 0,
      drift: 0,
    }
    const second = (loopCutoff: number) => {
      const x = play({ ...ring, loopCutoff }, 48, 2).subarray(SR)
      const hz = pitch(x)
      return bin(x, 2 * hz) / bin(x, hz)
    }
    expect(second(0)).toBeLessThan(0.01)
    expect(second(0.6)).toBeGreaterThan(0.2)
  })

  it('thickens the low end of a dark bass with the output on the cutoff input', () => {
    const bass = { drift: 0, cutoff: 150, emphasis: 0.6, contour: 1 }
    const low = (loopCutoff: number) => {
      const x = play({ ...bass, loopCutoff }, 36, 2)
      return lowEnergy(x) / rms(x)
    }
    expect(low(1)).toBeGreaterThan(low(0) + 0.02)
  })

  const blocks = (
    patch: Partial<MonoPatch>,
    note: number,
    secs: number,
    then?: { at: number; note: number },
  ) => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, patch)
    v.noteOn(note)
    const out = new Float32Array(Math.round(secs * SR))
    const change = then ? Math.round(then.at * SR) : -1
    for (let i = 0; i < out.length; i += 128) {
      if (then && i <= change && change < i + 128) v.noteOn(then.note)
      v.render(out, i, Math.min(i + 128, out.length))
    }
    return out
  }
  // Osc 3 on lo, two cycles a second, so it strobes the hold at 0.5 s and 1 s.
  const STROBED = {
    ...OPEN,
    level: [1, 0, 0] as [number, number, number],
    range: [0, 0, 2] as [number, number, number],
    fine: [0, 0, 12] as [number, number, number],
    osc3Free: true,
    osc3Lo: true,
  }

  it('keeps a new key waiting for osc 3 with the hold strobed off it', () => {
    const late = { at: 0.1, note: 57 }
    const free = blocks(STROBED, 45, 1, late)
    const strobed = blocks({ ...STROBED, strobe: 1 }, 45, 1, late)
    expect(hzBetween(free, 0.25, 0.45)).toBeCloseTo(220, 0)
    expect(hzBetween(strobed, 0.25, 0.45)).toBeCloseTo(110, 0)
    expect(hzBetween(strobed, 0.6, 0.95)).toBeCloseTo(220, 0)
  })

  it('lets the pitch creep toward the new key between strobes with the hold leaking', () => {
    const x = blocks({ ...STROBED, strobe: 0.5 }, 45, 1, { at: 0.1, note: 57 })
    const early = hzBetween(x, 0.15, 0.25)
    const later = hzBetween(x, 0.35, 0.45)
    expect(early).toBeGreaterThan(115)
    expect(later).toBeGreaterThan(early + 10)
    expect(later).toBeLessThan(215)
  })

  it('drains the strobed hold with pitch droop and refills it on each strobe', () => {
    const x = blocks({ ...STROBED, strobe: 1, droop: 0.5 }, 57, 1.5)
    const filled = hzBetween(x, 0.52, 0.6)
    const drained = hzBetween(x, 0.9, 0.98)
    expect(drained).toBeLessThan(0.65 * filled)
    expect(hzBetween(x, 1.02, 1.1)).toBeGreaterThan(1.5 * drained)
  })

  it('stays finite and inside the rails with all three patches, the emphasis and the drive at full', () => {
    const x = blocks(
      {
        loopSync: 1,
        loopCutoff: 1,
        strobe: 1,
        loopPitch: 1,
        loop: 1,
        emphasis: 1.1,
        drive: 4,
      },
      36,
      4,
    )
    expect(x.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true)
  })

  it('plays again after panic clears a NaN out of its oscillator and sag state', () => {
    const v = new MonoVoice(SR)
    Object.assign(v.patch, OPEN)
    for (const field of ['sagEnv', 'v1', 'v2', 'pinkish', 'ampLow', 'hold'])
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
