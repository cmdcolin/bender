import { expect, test } from 'vitest'
import { Bus, FAULT } from './bus'
import { pitchHz, render, rms, SR } from './testRender'
import { romIndex } from './stages/roms'

const straight = (bus: Bus, word: number) => bus.read(word, -1, 0, 1)

test('a line shorted to a rail is gone from every word, in both directions', () => {
  const bus = new Bus(6)
  expect(bus.read(0b101101, 0, FAULT.ground, 1)).toBe(0b101100)
  expect(bus.read(0b101101, 2, FAULT.ground, 1)).toBe(0b101001)
  expect(bus.read(0b101101, 1, FAULT.supply, 1)).toBe(0b101111)
  expect(bus.read(0b101101, 4, FAULT.supply, 1)).toBe(0b111101)
})

// Bridged lines are not stuck — they have simply stopped being able to
// disagree, and the one pulling low is the one that wins.
test('bridged lines agree, and agree low', () => {
  const bus = new Bus(6)
  expect(bus.read(0b000011, 0, FAULT.bridge, 1)).toBe(0b000011)
  expect(bus.read(0b000010, 0, FAULT.bridge, 1)).toBe(0b000000)
  expect(bus.read(0b000001, 0, FAULT.bridge, 1)).toBe(0b000000)
  // the top line has nothing above it, so the blob reaches down instead
  expect(bus.read(0b110000, 5, FAULT.bridge, 1)).toBe(0b110000)
  expect(bus.read(0b100000, 5, FAULT.bridge, 1)).toBe(0b000000)
})

// The pin floats from the moment the trace parts, so what it holds is whatever
// the bus happened to be carrying when the knife went through — not zero, and
// not the value the knob was set to.
test('a cut line freezes on the word that was on it', () => {
  const bus = new Bus(6)
  straight(bus, 0b000001)
  expect(bus.read(0b000000, 0, FAULT.cut, 1)).toBe(0b000001)
  expect(bus.read(0b111110, 0, FAULT.cut, 1)).toBe(0b111111)
  const clean = new Bus(6)
  straight(clean, 0b000000)
  expect(clean.read(0b000001, 0, FAULT.cut, 1)).toBe(0b000000)
})

test('a trace that still carries lets the bit through some of the time', () => {
  const bus = new Bus(6, 5)
  straight(bus, 0)
  let stale = 0
  for (let i = 0; i < 400; i++) {
    if (bus.read(0b000001, 0, FAULT.cut, 0.5) === 0) stale++
    straight(bus, 0)
  }
  expect(stale).toBeGreaterThan(150)
  expect(stale).toBeLessThan(250)
})

// The claim the whole bend rests on: a chip reading a cut bus is not
// malfunctioning. It plays a different song, and it plays that song again.
const LAP = 16 / (3.2 * 4)
const scale = { chipTune: romIndex('scale'), chipClockX: 4, drumLevel: 0 }

// The middle of each step, after the strike and before the tail runs out, as a
// note rather than a frequency: what the ear is asked about here is which note
// the ROM handed over, and a semitone is a long way outside what a cycle count
// over a window this short can be wrong by.
const notesPerLap = (x: Float32Array, laps = 2) => {
  const step = Math.round(SR * (LAP / 16))
  const at = (s: number) => {
    const hz = pitchHz(x.subarray(s * step + step * 0.1, s * step + step * 0.5))
    // against a reference an octave under the ROM's bottom note, so a step is a
    // count rather than a signed one
    return hz < 20 ? -1 : Math.round(12 * Math.log2(hz / 440))
  }
  return Array.from({ length: laps }, (_, l) =>
    Array.from({ length: 16 }, (_, s) => at(l * 16 + s)),
  )
}

test('a stuck data line plays a different song, and the same one every lap', () => {
  const [clean] = notesPerLap(render(scale, 2 * LAP))
  const [first, second] = notesPerLap(
    render({ ...scale, chipDataLine: 3, chipDataFault: FAULT.supply }, 2 * LAP),
  )
  expect(second).toEqual(first)
  // D2 is worth a major third, so the scale comes back as a scale with a third
  // of its steps in the wrong place rather than as a mess.
  const moved = first!.filter((n, i) => n !== clean![i]!)
  expect(moved.length).toBeGreaterThan(3)
  expect(moved.length).toBeLessThan(12)
})

// A rest is only a code, so a wire forced high hands the divider a pitch where
// the song had a gap and the tune fills in.
test('a data line held high fills in the rests', () => {
  const lullaby = { chipTune: romIndex('lullaby'), drumLevel: 0 }
  const step = Math.round((SR * 16) / 3.2 / 16)
  const silent = (x: Float32Array) =>
    Array.from({ length: 16 }, (_, s) =>
      rms(x.subarray(s * step + step * 0.1, s * step + step * 0.5)),
    ).filter(v => v < 0.01).length
  expect(silent(render(lullaby, 5))).toBe(2)
  expect(
    silent(
      render({ ...lullaby, chipDataLine: 2, chipDataFault: FAULT.supply }, 5),
    ),
  ).toBe(0)
})

// A sixteen-step song leaves the top address line undriven, so there is nothing
// up there for the knife to find — which is the honest answer, not a special
// case anybody wrote.
test('an address line this ROM never drives is not a bend at all', () => {
  const clean = render(scale, LAP)
  for (const fault of [FAULT.ground, FAULT.supply, FAULT.cut]) {
    const bent = render(
      { ...scale, chipAddrLine: 5, chipAddrFault: fault },
      LAP,
    )
    expect(Array.from(bent), `A4 ${fault}`).toEqual(Array.from(clean))
  }
})

test('an address line held low folds the song into half of itself', () => {
  const [first, second] = notesPerLap(
    render({ ...scale, chipAddrLine: 4, chipAddrFault: FAULT.ground }, 2 * LAP),
  )
  expect(second).toEqual(first)
  // A3 low means every read lands in the bottom eight steps, so the back half
  // of the lap is the front half again — and the counter never noticed.
  expect(first!.slice(8)).toEqual(first!.slice(0, 8))
})
