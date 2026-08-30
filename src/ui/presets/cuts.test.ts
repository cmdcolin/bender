import { expect, test } from 'vitest'
import { DEFAULT_CONTROLS, type ControlKey } from '../../controls'
import { highEnergy, render, rms, SR } from '../../dsp/testRender'
import { sliderFor } from '../controls'
import {
  applyCut,
  CUTS,
  cutOff,
  cutSays,
  cutStands,
  cutWired,
  partKeys,
} from './cuts'
import { mine } from './testBoard'

// A board with something going on for the knife to reach. Sakura is 32 steps at
// three a second, so a stock board plays six of them in the two seconds a test
// renders — cut the wire carrying the top of the address and the song never got
// that far anyway. The clock runs the tune up to where the whole of it goes
// past, and the kit gets a bar whose halves differ, because a pattern that is
// the same twice over is one no address fault can be heard on.
const busy = () => ({
  ...mine(),
  chipClockX: 6,
  drumKick: 0b1010_0100_0000_0010,
  drumSnare: 0b0000_1000_0000_0000,
  drumClap: 0b0000_0000_1000_0000,
  drumAccent: 0b1000_0000_0010_0000,
  drumBpm: 160,
})

test('every cut names controls that live under the heading it is offered from', () => {
  for (const cut of CUTS) {
    const under = new Set<ControlKey>(partKeys(cut.group, cut.part))
    expect(under.size, `${cut.group}/${cut.part}`).toBeGreaterThan(0)
    for (const key of Object.keys(cut.patch) as ControlKey[]) {
      expect(under.has(key), `${cut.name}/${key}`).toBe(true)
      const def = sliderFor(key)
      const value = cut.patch[key]!
      expect(value, `${cut.name}/${key}`).toBeGreaterThanOrEqual(def.min)
      expect(value, `${cut.name}/${key}`).toBeLessThanOrEqual(def.max)
    }
  }
})

// One knife on a bus, not two: pressing a second cut on top of the first is
// that second cut, rather than whichever wires the first one left wired.
test('a cut is the whole of what the knife did to that chip', () => {
  const [first, second] = CUTS.filter(c => c.group === 'Toy keyboard')
  const board = applyCut(second!, applyCut(first!, mine()))
  expect(cutStands(second!, board)).toBe(true)
  expect(cutStands(first!, board)).toBe(false)
})

test('a cut leaves the rest of the board where your hand put it', () => {
  const before = mine()
  const cut = CUTS.find(c => c.name === 'machine-gun')!
  const after = applyCut(cut, before)
  const moved = (Object.keys(after) as ControlKey[]).filter(
    k => after[k] !== before[k],
  )
  const under = new Set(partKeys(cut.group, cut.part))
  for (const key of moved) expect(under.has(key), key).toBe(true)
})

// The FM chip boots at zero and has no keyboard of its own, so wiring a knife
// into it and hearing nothing is the one outcome that teaches nothing at all.
test('a cut on a silent chip brings it up, and leaves a level you set alone', () => {
  const cut = CUTS.find(c => c.group === 'FM chip')!
  expect(DEFAULT_CONTROLS.fmLevel).toBe(0)
  expect(applyCut(cut, mine()).fmLevel).toBeGreaterThan(0)
  expect(applyCut(cut, { ...mine(), fmLevel: 0.2 }).fmLevel).toBe(0.2)
})

test('none takes the knife off and says whether there is one on', () => {
  const cut = CUTS.find(c => c.name === 'half a tune')!
  const wired = applyCut(cut, mine())
  expect(cutWired(cut.group, cut.part, wired)).toBe(true)
  const off = cutOff(cut.group, cut.part, wired)
  expect(cutWired(cut.group, cut.part, off)).toBe(false)
  expect(off.chipLevel).toBe(wired.chipLevel)
})

// Which is the half of it that teaches: the chip says what you will hear, and
// hovering it says which controls that is, in the words the rows underneath use.
test('a cut reads back as the controls it moves', () => {
  const cut = CUTS.find(c => c.name === 'rests fill in')!
  expect(cutSays(cut)).toBe('Data line D2 · Data fault to +V')
  for (const c of CUTS) expect(cutSays(c), c.name).not.toBe('')
})

// Weight under a two-pole at 180 Hz against the whole of it, which is enough to
// tell a board that sat down from one that merely changed.
const tilt = (x: Float32Array) => {
  const a = Math.exp((-2 * Math.PI * 180) / SR)
  let one = 0
  let two = 0
  let acc = 0
  for (const v of x) {
    one = (1 - a) * v + a * one
    two = (1 - a) * one + a * two
    acc += two * two
  }
  return Math.sqrt(acc / x.length) / (rms(x) + 1e-9)
}

// A knife on a bus is famous for the other direction — a stuck key screaming an
// octave up, a rectified sine with no fundamental left in it. These two go the
// other way, and a catalog that claimed bass and delivered another bright glitch
// would be worth less than one that never mentioned it.
test.each([
  'the tune in the bass',
  'sub, not bells',
  'the bottom of every octave',
])('%s puts the weight underneath', name => {
  const cut = CUTS.find(c => c.name === name)!
  // The kit is a kick and the question is about pitch, so the drums come out of
  // the mix — and the FM chip has no keyboard of its own, so the toy stays in
  // under it, quietly, striking the notes it is measured on.
  const alone = {
    drumLevel: 0,
    ...(cut.group === 'FM chip' ? { chipLevel: 0.2 } : { fmLevel: 0 }),
  }
  const knife = { ...applyCut(cut, busy()), ...alone }
  const bare = cutOff(cut.group, cut.part, knife)
  expect(tilt(render(knife, 2))).toBeGreaterThan(1.4 * tilt(render(bare, 2)))
})

// The other direction the row is short of. A knife that comes out quieter than
// no knife is the easy result — the note stops, the level drops, and the chip is
// worse at being a chip. This one claims the opposite in its blurb, which is a
// falsifiable thing to have written down: nothing is driving that pin, so what
// reaches the operator is neither the wave nor silence but the bus's own
// traffic, and there is more of it than there was of the sine.
test('sine into noise comes out louder and broader than no knife at all', () => {
  const cut = CUTS.find(c => c.name === 'sine into noise')!
  // The kit out of the mix and the toy left in under it, as the bass cuts above
  // are measured: the FM chip has no keyboard of its own.
  const knife = { ...applyCut(cut, busy()), drumLevel: 0, chipLevel: 0.2 }
  const bare = cutOff(cut.group, cut.part, knife)
  const a = render(bare, 2)
  const b = render(knife, 2)
  expect(rms(b)).toBeGreaterThan(1.15 * rms(a))
  expect(highEnergy(b) / rms(b)).toBeGreaterThan(2 * (highEnergy(a) / rms(a)))
})

// The whole promise of the row: every chip on it is a knife you can hear. A cut
// that came out the same as no cut is a line of the catalog pointing at a wire
// this board never drives, which is the failure the row exists to spare you.
test.each(CUTS.map(c => [`${c.group}: ${c.name}`, c] as const))(
  'you can hear %s',
  (_name, cut) => {
    const knife = applyCut(cut, busy())
    const bare = cutOff(cut.group, cut.part, knife)
    const a = render(bare, 2)
    const b = render(knife, 2)
    const diff = a.map((v, i) => v - b[i]!)
    expect(rms(diff)).toBeGreaterThan(0.1 * rms(a))
  },
)
