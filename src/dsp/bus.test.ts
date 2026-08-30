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

// The other half of a cut, and the half no other fault has: nothing holds a
// floating pin where it was left. The parted trace still runs the length of the
// board beside its neighbour, so the pin drifts after that neighbour's edges —
// a word or two behind, and further behind the deeper the cut goes.
const wrong = (depth: number, words: number[]) => {
  const bus = new Bus(6, 0)
  straight(bus, 0)
  let n = 0
  for (let i = 0; i < 400; i++) {
    const word = words[i % words.length]!
    if ((bus.read(word, 0, FAULT.cut, depth) & 1) !== (word & 1)) n++
  }
  return n / 400
}

// A line the driver still reaches most of the time is a line that is mostly
// right, and every write that lands slams it back to the truth.
test('a trace that still carries lets the bit through most of the time', () => {
  // D0 and D1 disagree on every word, so the neighbour pulls the wrong way
  // whenever the driver lets go.
  const alternating = [0b000001, 0b000010, 0b000001, 0b000010]
  expect(wrong(0, alternating)).toBe(0)
  expect(wrong(0.3, alternating)).toBeLessThan(0.3)
  // and a trace parted all the way is a bit that is barely ever right again
  expect(wrong(1, alternating)).toBeGreaterThan(0.9)
})

// And how far through the trace the knife went is a knob, not a switch.
test('the deeper the cut the further behind the bit falls', () => {
  const alternating = [0b000001, 0b000010, 0b000001, 0b000010]
  const depths = [0.3, 0.6, 0.85, 0.95, 1]
  const missed = depths.map(d => wrong(d, alternating))
  for (let i = 1; i < missed.length; i++)
    expect(missed[i]!, `depth ${depths[i]}`).toBeGreaterThanOrEqual(
      missed[i - 1]!,
    )
})

// A pin nobody drives at all is not a pin stuck on a rail: it follows the
// traffic next door, so a bus whose neighbour moves is a bit that moves.
test('a fully cut line follows its neighbour rather than a rail', () => {
  const bus = new Bus(6, 0)
  straight(bus, 0)
  // The neighbour held high long enough for the coupling to drag the pin over.
  let out = 0
  for (let i = 0; i < 20; i++) out = bus.read(0b000010, 0, FAULT.cut, 1)
  expect(out & 1).toBe(1)
  // And back down again when it goes the other way.
  for (let i = 0; i < 20; i++) out = bus.read(0b000000, 0, FAULT.cut, 1)
  expect(out & 1).toBe(0)
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
