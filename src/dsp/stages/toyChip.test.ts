import { expect, test } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../../controls.ts'
import { packParams } from '../../engine/params.ts'
import { HOLD, REST, TUNE_LANE_KEYS, TUNE_STEP_KEYS } from '../../tune.ts'
import { buildBender, buildChain, type BuiltChain } from '../build.ts'
import { DEST } from '../modbus.ts'
import { spectrum } from '../spectrum.ts'
import { BLOCK } from '../stage.ts'
import {
  bin,
  deviation,
  makeIo,
  pitchHz,
  playKeys,
  render,
  renderBender,
  rms,
  SR,
  tail,
} from '../testRender.ts'
import { YOURS } from './roms.ts'
import { ToyChip } from './toyChip.ts'

// A memory written out as the controls that carry it. Anything not named is a
// step with nothing on it.
const memory = (steps: Record<number, number>): Partial<Controls> =>
  Object.fromEntries(TUNE_STEP_KEYS.map((key, i) => [key, steps[i] ?? REST]))

// A chord written across the three lanes: the melody lane, then the two chips
// stacked on it. Every step of every lane not named is empty.
const chord = (steps: Record<number, number[]>): Partial<Controls> =>
  Object.fromEntries(
    TUNE_LANE_KEYS.flatMap((keys, lane) =>
      keys.map((key, i) => [key, steps[i]?.[lane] ?? REST]),
    ),
  )

// The board boots with the drum machine running too; these takes measure the
// chip's own tune, so they mute it.
const CHIP_ONLY: Partial<Controls> = { drumLevel: 0 }

test('default board makes sound (the toy chip demo tune)', () => {
  expect(rms(render({}, 1))).toBeGreaterThan(0.005)
})

test('starve reboots restart the tune', () => {
  const chain = buildChain(SR)
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...CHIP_ONLY,
    chipLevel: 1,
    chipStarve: 1,
  })
  const io = makeIo()
  let sawSilentBoot = false
  let sawSound = false
  for (let b = 0; b < Math.ceil((3 * SR) / BLOCK); b++) {
    chain.process(io, p)
    // the safety tail's dc blocker leaves a decaying residue, so "silent"
    // means below anything audible rather than exactly zero
    const peak = Math.max(...io.l.subarray(0, BLOCK).map(Math.abs))
    if (peak < 1e-9) sawSilentBoot = true
    else sawSound = true
  }
  expect(sawSound).toBe(true)
  expect(sawSilentBoot).toBe(true)
})

test('the auto bass-chord puts a bass under the tune', () => {
  // four poles at 160 Hz, steep enough to leave the melody's 220 Hz behind and
  // pass the accompaniment's bass an octave under it
  const lowEnd = (x: Float32Array) => {
    const a = Math.exp((-2 * Math.PI * 160) / SR)
    const z = [0, 0, 0, 0]
    const lp = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) {
      let v = x[i]!
      for (let k = 0; k < z.length; k++) v = z[k] = z[k]! * a + v * (1 - a)
      lp[i] = v
    }
    return rms(lp)
  }
  const dry = render({ ...CHIP_ONLY, chipLevel: 0.6 }, 3)
  const backed = render({ ...CHIP_ONLY, chipLevel: 0.6, chipAccomp: 0.8 }, 3)
  expect(rms(backed)).toBeGreaterThan(rms(dry))
  expect(lowEnd(backed)).toBeGreaterThan(lowEnd(dry) * 2)
})

test('the accompaniment browns out with the chip it runs on', () => {
  // it is the same divider on the same rail, so a starved chip takes it down too
  const quietFraction = (x: Float32Array) =>
    x.reduce((a, v) => a + (Math.abs(v) < 0.01 ? 1 : 0), 0) / x.length
  const running = render({ ...CHIP_ONLY, chipLevel: 1, chipAccomp: 1 }, 3)
  const starved = render(
    { ...CHIP_ONLY, chipLevel: 1, chipAccomp: 1, chipStarve: 1 },
    3,
  )
  expect(quietFraction(starved)).toBeGreaterThan(quietFraction(running) * 2)
  expect(
    starved.reduce((a, v) => Math.max(a, Math.abs(v)), 0),
  ).toBeLessThanOrEqual(0.891 + 1e-6)
})

test('a chord sounds fuller than one note but nothing like four times louder', () => {
  const one = rms(playKeys({}, chip => chip.noteOn(0)))
  const four = rms(
    playKeys({}, chip => {
      for (const n of [0, 4, 7, 12]) chip.noteOn(n)
    }),
  )
  expect(four).toBeGreaterThan(one * 1.3)
  expect(four).toBeLessThan(one * 2.5)
})

test('a fifth note steals the oldest voice', () => {
  // Both takes end with the player holding only note 0. In the second, note 0's
  // voice went to the fifth note, so every voice is released and rings out.
  const script = (extra: number[]) => (chip: BuiltChain['toyChip']) => {
    for (const n of [0, 4, 7, 12, ...extra]) chip.noteOn(n)
    for (const n of [4, 7, 12, ...extra]) chip.noteOff(n)
  }
  const held = rms(tail(playKeys({}, script([]), 2), 0.1))
  const stolen = rms(tail(playKeys({}, script([16]), 2), 0.1))
  expect(held).toBeGreaterThan(0.05)
  expect(stolen).toBeLessThan(held * 0.1)
})

// Two octaves under the toy's own bottom key, which is as far down as the octave
// switch goes. Silence is a voice with its envelope down, so a semitone below
// zero is a note rather than the empty voice it used to read as.
test('the keys play under the chip’s own bottom note', () => {
  const note = (semitone: number) =>
    playKeys({ chipLevel: 0.9 }, chip => chip.noteOn(semitone), 0.3)
  expect(bin(note(0), 220)).toBeGreaterThan(0.01)
  expect(bin(note(-12), 110)).toBeGreaterThan(0.01)
  expect(bin(note(-12), 220)).toBeLessThan(0.5 * bin(note(-12), 110))
  expect(bin(note(-24), 55)).toBeGreaterThan(0.01)
  expect(bin(note(-24), 110)).toBeLessThan(0.5 * bin(note(-24), 55))
})

test('flat batteries run the tune low and late, and it keeps running', () => {
  // Pitch off a held key rather than off the tune. One oscillator does both
  // jobs, so flat cells slow the sequencer as well as dropping the note — and a
  // pitch read across a fixed window of a tune that is no longer keeping the
  // same time is reading two different bars, not two different pitches.
  const held = (o: Partial<Controls>) =>
    pitchHz(playKeys({ ...CHIP_ONLY, chipLevel: 1, ...o }, c => c.noteOn(0), 1))
  expect(held({ chipBattery: 0.5 })).toBeLessThan(held({}) * 0.9)

  const fresh = render({ ...CHIP_ONLY, chipLevel: 1 }, 3)
  const flat = render({ ...CHIP_ONLY, chipLevel: 1, chipBattery: 0.5 }, 3)
  // Half-dead cells drop the pitch; they don't stop the toy playing.
  expect(rms(flat)).toBeGreaterThan(rms(fresh) * 0.5)
})

test('narrow tone taps thin out and survive the divider running out of counts', () => {
  const square = rms(playKeys({ chipTone: 0 }, chip => chip.noteOn(0)))
  const buzz = rms(playKeys({ chipTone: 3 }, chip => chip.noteOn(0)))
  expect(buzz).toBeGreaterThan(0.01)
  expect(buzz).toBeLessThan(square * 0.8)

  // Clocked up past where a 1/16 tap fits between samples, it still sounds.
  const fast = rms(
    playKeys({ chipTone: 3, chipClockX: 16 }, chip => chip.noteOn(12)),
  )
  expect(fast).toBeGreaterThan(0.01)
})

// What the panel's keyboard lights up: the chip has to say which notes it is
// making a sound with, or a tune playing itself leaves the drawn board dark.
test('the chip reports the notes it is sounding', () => {
  const built = buildBender(SR)
  built.transport.tune = true
  const p = packParams({
    ...DEFAULT_CONTROLS,
    ...CHIP_ONLY,
    chipLevel: 1,
    chipAccomp: 1,
  })
  const io = makeIo()
  const out = new Int16Array(ToyChip.MAX_SOUNDING)
  const seen = new Set<number>()
  for (let b = 0; b < Math.ceil((2 * SR) / BLOCK); b++) {
    built.chain.process(io, p)
    for (const note of out.subarray(0, built.toyChip.soundingNotes(out)))
      seen.add(note)
  }
  // Two seconds of the demo tune is several steps of melody with the oom-pah
  // walking under it, so the board is never lit by one note alone.
  expect(seen.size).toBeGreaterThan(3)
})

test('a struck key is sounding until it decays, and a silent chip reports none', () => {
  const built = buildBender(SR)
  const p = packParams({ ...DEFAULT_CONTROLS, ...CHIP_ONLY, chipLevel: 1 })
  const io = makeIo()
  const out = new Int16Array(ToyChip.MAX_SOUNDING)
  const sounding = () =>
    [...out.subarray(0, built.toyChip.soundingNotes(out))] as number[]

  // The transport is stopped, so nothing but the key is playing.
  built.chain.process(io, p)
  expect(sounding()).toEqual([])

  built.toyChip.noteOn(7)
  built.chain.process(io, p)
  expect(sounding()).toEqual([7])

  // Let go, the voice decays on the tune's own clock rather than stopping, so
  // the key stays lit for as long as it is still making a sound.
  built.toyChip.noteOff(7)
  built.chain.process(io, p)
  expect(sounding()).toEqual([7])

  for (let b = 0; b < Math.ceil((4 * SR) / BLOCK); b++)
    built.chain.process(io, p)
  expect(sounding()).toEqual([])
})

test('a released key decays at the memory rate set after the chip started', () => {
  const ringBlocks = (startRate: number) => {
    const built = buildBender(SR)
    const io = makeIo()
    const out = new Int16Array(ToyChip.MAX_SOUNDING)
    const board = {
      ...DEFAULT_CONTROLS,
      ...CHIP_ONLY,
      chipLevel: 1,
      chipTune: YOURS,
    }
    built.chain.process(io, packParams({ ...board, tuneRate: startRate }))
    const p = packParams({ ...board, tuneRate: 6 })
    built.chain.process(io, p)
    built.toyChip.noteOn(7)
    built.chain.process(io, p)
    built.toyChip.noteOff(7)
    let blocks = 0
    while (built.toyChip.soundingNotes(out) > 0 && blocks < (4 * SR) / BLOCK) {
      built.chain.process(io, p)
      blocks++
    }
    return blocks
  }
  expect(ringBlocks(6)).toBeLessThan((2 * SR) / BLOCK)
  expect(ringBlocks(3.2)).toBe(ringBlocks(6))
})

// The memory is a tune like any other once it is in there: the chip plays it off
// the same counter, at the rate its own knob says rather than a ROM's.
test('the chip plays the melody you played into it', () => {
  const held = (note: number) =>
    pitchHz(
      render(
        {
          ...CHIP_ONLY,
          chipLevel: 1,
          chipTune: YOURS,
          tuneRate: 0.5,
          ...memory({ 0: note, 1: HOLD, 2: HOLD, 3: HOLD }),
        },
        1,
      ),
    )
  // An octave apart in the memory is an octave apart out of the speaker.
  expect(held(12)).toBeGreaterThan(held(0) * 1.8)
  expect(held(12)).toBeLessThan(held(0) * 2.2)
})

// An empty memory is a memory, not a fault: the counter clocks through sixteen
// rests and the chip sits there, the way it does under a ROM's rests.
test('an empty memory plays nothing and breaks nothing', () => {
  const out = render(
    { ...CHIP_ONLY, chipLevel: 1, chipTune: YOURS, ...memory({}) },
    0.5,
  )
  expect(rms(out)).toBeLessThan(1e-6)
  expect(out.every(Number.isFinite)).toBe(true)
})

// The memory reaches under the chip's own bottom A, where a ROM never went —
// the drawn keyboard starts nine semitones below it. A note down there has to
// come out as a low note rather than as one of the two codes that are not notes.
test('the memory holds notes under the chip’s bottom A', () => {
  const low = pitchHz(
    render(
      {
        ...CHIP_ONLY,
        chipLevel: 1,
        chipTune: YOURS,
        tuneRate: 0.5,
        ...memory({ 0: -12, 1: HOLD, 2: HOLD, 3: HOLD }),
      },
      1,
    ),
  )
  expect(low).toBeGreaterThan(80)
  expect(low).toBeLessThan(140)
})

// Same six wires, same knife. What separates a bus fault from every other bend
// on the board is that it leaves the chip working perfectly and changes what it
// is told — so your tune comes out wrong in time, rather than not at all.
test('the knife on the ROM bus reaches your tune too', () => {
  // Long enough at this rate for the whole sixteen to come round twice.
  const song = { ...CHIP_ONLY, chipLevel: 1, chipTune: YOURS, tuneRate: 16 }
  const notes = memory({ 0: 0, 4: 7, 8: 12, 12: 7 })
  const clean = render({ ...song, ...notes }, 2)
  const cut = render(
    { ...song, ...notes, chipDataLine: 3, chipDataFault: 2 },
    2,
  )
  expect(rms(cut)).toBeGreaterThan(0)
  expect(deviation(cut, clean)).toBeGreaterThan(0.05)
})

// The keyboard has always been polyphonic — four voices, and your hands play
// chords on them. What was mono is the memory: one word a step, one melody
// oscillator. The stacked chips put their notes on the key line, so a chord in
// the memory comes out of the voices your hands would have used.
test('a chord in the memory sounds all three of its notes', () => {
  const board = {
    ...DEFAULT_CONTROLS,
    ...CHIP_ONLY,
    chipLevel: 1,
    chipTune: YOURS,
    tuneRate: 2,
    ...chord({ 0: [0, 4, 7] }),
  }
  // A fresh chip a take, since a voice struck in one is still ringing in the
  // next: what the mono take must not do is play notes of its own.
  const play = (over: Partial<Controls>) => {
    const built = buildBender(SR)
    built.transport.tune = true
    const p = packParams({ ...board, ...over })
    const io = makeIo()
    const out = new Int16Array(ToyChip.MAX_SOUNDING)
    const seen = new Set<number>()
    for (let b = 0; b < Math.ceil((0.4 * SR) / BLOCK); b++) {
      built.chain.process(io, p)
      for (const note of out.subarray(0, built.toyChip.soundingNotes(out)))
        seen.add(note)
    }
    return [...seen].toSorted((a, b) => a - b)
  }

  expect(play({ tunePoly: 1 })).toEqual([0, 4, 7])
  // Mono is the toy as it shipped: the stacked lanes are still written and the
  // chip is not reading them.
  expect(play({ tunePoly: 0 })).toEqual([0])
})

// One counter addresses all three chips, so a wire on it drags the chord along
// with the melody rather than smearing the two apart — which is why the address
// is worked out once a step rather than once a lane.
test('a chord holds together under an address fault', () => {
  const board = {
    ...CHIP_ONLY,
    chipLevel: 1,
    chipTune: YOURS,
    tuneRate: 8,
    ...chord({ 0: [0, 4, 7], 4: [5, 9, 12] }),
  }
  // A0 held low: every read lands on an even step, which is where both chords
  // are, so the tune keeps playing chords rather than falling silent.
  const bent = render({ ...board, chipAddrLine: 1, chipAddrFault: 1 }, 1)
  expect(rms(bent)).toBeGreaterThan(0)
  expect(bent.every(Number.isFinite)).toBe(true)
})

const TOP_NOTE_HZ = [0, 4, 7, 11].map(n => 220 * 2 ** (n / 12))

// Which of the held chord's four notes is loudest in each 40 ms of the take.
const loudestNotes = (x: Float32Array) => {
  const win = 1920
  const picks: number[] = []
  for (let i = 0; i + win <= x.length; i += win) {
    const w = x.subarray(i, i + win)
    const m = TOP_NOTE_HZ.map(hz => bin(w, hz))
    picks.push(m.indexOf(Math.max(...m)))
  }
  return picks
}

const holdChord = (b: BuiltChain) =>
  [0, 4, 7, 11].forEach(n => b.toyChip.noteOn(n))

test('crosstalk turns a held chord toward noise', () => {
  const take = (chipCrosstalk: number) =>
    spectrum(
      tail(renderBender({ ...CHIP_ONLY, chipCrosstalk }, 1.5, holdChord), 1),
      SR,
    ).flatness
  expect(take(0.5)).toBeGreaterThan(take(0) * 3)
})

test('crosstalk moves a lone note off its pitch and keeps it periodic', () => {
  const note = (chipCrosstalk: number) =>
    tail(
      renderBender({ ...CHIP_ONLY, chipCrosstalk }, 1.5, b =>
        b.toyChip.noteOn(0),
      ),
      1,
    )
  const clean = spectrum(note(0), SR).centroid
  expect(spectrum(note(0.6), SR).centroid).toBeGreaterThan(clean * 1.5)
})

test('scan at full travel plays a held chord one note at a time, in turn', () => {
  const picks = loudestNotes(
    tail(renderBender({ ...CHIP_ONLY, chipScan: 1 }, 3, holdChord), 2),
  )
  expect(new Set(picks).size).toBe(4)
  let runs = 1
  for (let i = 1; i < picks.length; i++) if (picks[i] !== picks[i - 1]) runs++
  // Four notes at about six slots a second is a dozen turns in two seconds.
  expect(runs).toBeGreaterThan(8)
  expect(runs).toBeLessThan(16)
})

// The steps the counter stands on, in the order it stands on them.
const walk = (overrides: Partial<Controls>, seconds = 10) => {
  const at: number[] = []
  renderBender(
    { ...CHIP_ONLY, chipTune: 4, ...overrides },
    seconds,
    b => (b.transport.tune = true),
    undefined,
    b => {
      if (b.toyChip.tunePos !== at.at(-1)) at.push(b.toyChip.tunePos)
    },
  )
  return at
}

// The melody notes, one per block, while the tune runs.
const melody = (overrides: Partial<Controls>) => {
  const notes: number[] = []
  const out = new Int16Array(ToyChip.MAX_SOUNDING)
  renderBender(
    { ...CHIP_ONLY, chipTune: 4, ...overrides },
    6,
    b => (b.transport.tune = true),
    undefined,
    b => {
      notes.push(b.toyChip.soundingNotes(out) > 0 ? out[0]! : -999)
    },
  )
  return notes
}

test('a loop wire on an address pin plays a different melody, the same way each time', () => {
  const wired = { chipLoopFrom: 2, chipLoopTo: 2 }
  expect(melody(wired)).not.toEqual(melody({}))
  expect(melody(wired)).toEqual(melody(wired))
})

test('a loop wire on reset loops the song on the stretch before the bit rises', () => {
  const steps = walk({ chipLoopFrom: 2, chipLoopTo: 5 })
  expect(Math.max(...steps)).toBe(6)
  expect(steps.filter(s => s === 0).length).toBeGreaterThan(3)
  expect(Math.max(...walk({}))).toBeGreaterThan(20)
})

const FAULT_TO_V = 2

test('a held key under a reversed envelope cap swells in', () => {
  const x = renderBender({ ...CHIP_ONLY, chipEnvCap: 1 }, 1, b =>
    b.toyChip.noteOn(0),
  )
  const early = rms(x.subarray(0, SR * 0.05))
  const later = rms(x.subarray(SR * 0.3, SR * 0.4))
  expect(later).toBeGreaterThan(early * 3)
})

test('a released key keeps droning on a leaky envelope cap', () => {
  const take = (chipEnvCap: number) =>
    rms(
      tail(
        renderBender(
          { ...CHIP_ONLY, chipEnvCap },
          4,
          b => b.toyChip.noteOn(0),
          undefined,
          (b, secs) => {
            if (secs > 0.2) b.toyChip.noteOff(0)
          },
        ),
        0.5,
      ),
    )
  expect(take(0)).toBeLessThan(0.001)
  expect(take(2)).toBeGreaterThan(0.01)
})

test('volume PWM in earshot chops a fading tune', () => {
  const tune = (chipPwm: number) =>
    renderBender({ ...CHIP_ONLY, chipPwm }, 3, b => (b.transport.tune = true))
  const clean = tune(0)
  expect(deviation(tune(0.6), clean)).toBeGreaterThan(0.3)
  expect(spectrum(tune(0.6), SR).flatness).toBeGreaterThan(
    spectrum(clean, SR).flatness,
  )
})

test('a voice short leaves a lone note near where it was and mangles a chord', () => {
  const take = (chipShort: number, notes: number[]) =>
    tail(
      renderBender({ ...CHIP_ONLY, chipShort }, 1, b =>
        notes.forEach(n => b.toyChip.noteOn(n)),
      ),
      0.5,
    )
  expect(pitchHz(take(1, [0]))).toBeCloseTo(pitchHz(take(0, [0])), -1)
  const triad = [0, 4, 7]
  expect(deviation(take(1, triad), take(0, triad))).toBeGreaterThan(0.5)
})

test('ghost keys sound the far corners of two held keys', () => {
  const sounding = (chipGhost: number) => {
    const out = new Int16Array(ToyChip.MAX_SOUNDING)
    let notes: number[] = []
    renderBender(
      { ...CHIP_ONLY, chipGhost },
      0.3,
      b => {
        b.toyChip.noteOn(0)
        b.toyChip.noteOn(9)
      },
      undefined,
      b => {
        notes = [...out.subarray(0, b.toyChip.soundingNotes(out))]
      },
    )
    return notes.toSorted((a, b) => a - b)
  }
  expect(sounding(0)).toEqual([0, 9])
  // Four wide: 0 is row 0 column 0 and 9 is row 2 column 1.
  expect(sounding(1)).toEqual([0, 1, 8, 9])
})

test('a song wire held high plays the neighbouring song’s notes', () => {
  const heard = (overrides: Partial<Controls>) => new Set(melody(overrides))
  const march = heard({ chipTune: 1 })
  const bent = heard({
    chipTune: 0,
    chipBankLine: 1,
    chipBankFault: FAULT_TO_V,
  })
  bent.delete(-999)
  march.delete(-999)
  expect(bent.size).toBeGreaterThan(2)
  for (const n of bent) expect(march.has(n), `${n}`).toBe(true)
})

test('a divider wire held high moves a held note off the keys', () => {
  const held = (overrides: Partial<Controls>) =>
    pitchHz(
      tail(
        renderBender({ ...CHIP_ONLY, ...overrides }, 1, b =>
          b.toyChip.noteOn(0),
        ),
        0.5,
      ),
    )
  expect(held({})).toBeCloseTo(220, -1)
  // A3 loads 512; N8 high makes it 768, two thirds of the pitch.
  expect(held({ chipDivLine: 9, chipDivFault: FAULT_TO_V })).toBeCloseTo(
    (220 * 512) / 768,
    -1,
  )
})

// A finger held on the body pad, wired onto one of the chip's lanes.
const padWire = (dest: number, depth = 1): Partial<Controls> => ({
  bodyX: 1,
  mod0Src: 5,
  mod0Dest: dest,
  mod0Depth: depth,
})

test('a wire on the scan lane arpeggiates a held chord with the knob at zero', () => {
  const picks = loudestNotes(
    tail(
      renderBender({ ...CHIP_ONLY, ...padWire(DEST.chipScan) }, 3, holdChord),
      2,
    ),
  )
  expect(new Set(picks).size).toBe(4)
})

test('a step tap runs the tune at a rate its own notes set', () => {
  const steps = (chipStepTap: number) => {
    let moves = 0
    let last = -1
    renderBender(
      { ...CHIP_ONLY, chipStepTap },
      2,
      b => (b.transport.tune = true),
      undefined,
      b => {
        if (b.toyChip.tunePos !== last) moves++
        last = b.toyChip.tunePos
      },
    )
    return moves
  }
  expect(steps(0)).toBeLessThan(12)
  expect(steps(1)).toBeGreaterThan(100)
})

test('a relaxing envelope cap keeps a released key restriking', () => {
  const take = (chipEnvRelax: number) =>
    rms(
      tail(
        renderBender(
          { ...CHIP_ONLY, chipEnvRelax },
          3,
          b => b.toyChip.noteOn(0),
          undefined,
          (b, secs) => {
            if (secs > 0.2) b.toyChip.noteOff(0)
          },
        ),
        0.5,
      ),
    )
  expect(take(0)).toBeLessThan(0.001)
  expect(take(0.5)).toBeGreaterThan(0.01)
})

test('the envelope on the divider drops a note as it fades', () => {
  const pitches = (chipEnvDiv: number) => {
    const x = renderBender(
      { ...CHIP_ONLY, chipEnvDiv },
      0.6,
      b => b.toyChip.noteOn(0),
      undefined,
      (b, secs) => {
        if (secs > 0.02) b.toyChip.noteOff(0)
      },
    )
    return [
      pitchHz(x.subarray(0, SR * 0.05)),
      pitchHz(x.subarray(SR * 0.4, SR * 0.5)),
    ]
  }
  const [stockStart, stockEnd] = pitches(0)
  expect(stockEnd).toBeCloseTo(stockStart, -1)
  const [start, end] = pitches(1)
  expect(end).toBeLessThan(start * 0.7)
})

test('the output on an address line rewrites the tune', () => {
  const tune = (chipOutAddr: number) =>
    renderBender(
      { ...CHIP_ONLY, chipOutAddr },
      3,
      b => (b.transport.tune = true),
    )
  expect(deviation(tune(1), tune(0))).toBeGreaterThan(0.3)
})

test('the output on a data line rewrites the tune', () => {
  const tune = (chipOutData: number) =>
    renderBender(
      { ...CHIP_ONLY, chipOutData },
      3,
      b => (b.transport.tune = true),
    )
  expect(deviation(tune(3), tune(0))).toBeGreaterThan(0.3)
})

test('a PWM tap chops a fading note at a sub-octave of its pitch', () => {
  const fading = (chipPwmTap: number) =>
    renderBender(
      { ...CHIP_ONLY, chipPwmTap },
      0.3,
      b => b.toyChip.noteOn(0),
      undefined,
      (b, secs) => {
        if (secs > 0.02) b.toyChip.noteOff(0)
      },
    ).subarray(SR * 0.1)
  const clean = fading(0)
  const tapped = fading(0.01)
  expect(bin(clean, 110)).toBeLessThan(0.01)
  expect(bin(tapped, 110)).toBeGreaterThan(0.015)
})

test('a wire on the step tap lane runs the tune at audio rate', () => {
  let moves = 0
  let last = -1
  renderBender(
    { ...CHIP_ONLY, ...padWire(DEST.chipStepTap) },
    2,
    b => (b.transport.tune = true),
    undefined,
    b => {
      if (b.toyChip.tunePos !== last) moves++
      last = b.toyChip.tunePos
    },
  )
  expect(moves).toBeGreaterThan(100)
})

test('a wire on the envelope cap lane swells a held key in', () => {
  const x = renderBender(
    { ...CHIP_ONLY, ...padWire(DEST.chipEnvCap, 0.34) },
    1,
    b => b.toyChip.noteOn(0),
  )
  expect(rms(x.subarray(SR * 0.3, SR * 0.4))).toBeGreaterThan(
    rms(x.subarray(0, SR * 0.05)) * 3,
  )
})

test('a wire on the divider line lane retunes a held note', () => {
  const held = (overrides: Partial<Controls>) =>
    pitchHz(
      tail(
        renderBender(
          { ...CHIP_ONLY, chipDivFault: FAULT_TO_V, ...overrides },
          1,
          b => b.toyChip.noteOn(0),
        ),
        0.5,
      ),
    )
  expect(held({})).toBeCloseTo(220, -1)
  // Nine wires up the thirteen-choice list is N8, the same as the knob test.
  expect(held(padWire(DEST.chipDivLine, 9 / 13))).toBeCloseTo(
    (220 * 512) / 768,
    -1,
  )
})
