import { expect, test } from 'vitest'
import { CONTROL_KEYS, DEFAULT_CONTROLS } from '../controls'
import { ALL_SLIDERS, choiceValue, sliderFor } from './controls'
import {
  bayLfoWires,
  laneHasSpare,
  laneReads,
  laneSays,
  laneWire,
  solderLane,
  unsolderLane,
} from './bayWire'

const SRC_OFF = choiceValue('mod0Src', 'off')
const SRC_LFO = choiceValue('mod0Src', 'LFO')

const WIRES = [
  { src: 'mod0Src', dest: 'mod0Dest', lane: 'fb amount' },
  { src: 'mod1Src', dest: 'mod1Dest', lane: 'glitch' },
  { src: 'mod2Src', dest: 'mod2Dest', lane: 'starve' },
  { src: 'mod3Src', dest: 'mod3Dest', lane: 'drum tune' },
] as const

// A bay with the first `n` wires soldered somewhere harmless, so the next one a
// row asks for is the one after them.
const busy = (n: number) => {
  const c = { ...DEFAULT_CONTROLS }
  for (const w of WIRES.slice(0, n)) {
    c[w.src] = SRC_LFO
    c[w.dest] = choiceValue('mod0Dest', w.lane)
  }
  return c
}

test('a row puts a spare wire on its own lane, off the LFO', () => {
  const next = solderLane(DEFAULT_CONTROLS, 'filt cut')
  expect(next.mod0Src).toBe(SRC_LFO)
  expect(next.mod0Dest).toBe(choiceValue('mod0Dest', 'filt cut'))
  expect(laneWire(next, 'filt cut')).toBe(1)
  expect(laneReads(next, 'filt cut')).toBe('LFO 1.0Hz')
  expect(laneSays(next, 'filt cut')).toBe('LFO 1.0Hz, pushing 0.50 straight')
})

test('the wire it takes is the first one nothing is plugged into', () => {
  const next = solderLane(busy(2), 'filt cut')
  expect(next.mod2Src).toBe(SRC_LFO)
  expect(next.mod2Dest).toBe(choiceValue('mod0Dest', 'filt cut'))
  expect(laneWire(next, 'filt cut')).toBe(3)
})

// The stage the wire lands on is not turned up on the way: the row is asking
// for movement on a knob you are already looking at, and a button that also
// changed what you could hear would be answering a question nobody asked.
test('soldering moves nothing but the wire', () => {
  const next = solderLane(DEFAULT_CONTROLS, 'verb decay')
  for (const key of CONTROL_KEYS)
    if (key !== 'mod0Src' && key !== 'mod0Dest')
      expect(next[key]).toBe(DEFAULT_CONTROLS[key])
})

// A wire at zero depth reads as patched and does nothing, which is exactly what
// this button must not hand back.
test('a wire left at zero depth comes back with a push', () => {
  const flat = { ...DEFAULT_CONTROLS, mod0Depth: 0 }
  expect(solderLane(flat, 'filt cut').mod0Depth).toBe(
    DEFAULT_CONTROLS.mod0Depth,
  )
})

test('unplugging keeps where the wire landed and how hard it pushed', () => {
  const mine = {
    ...solderLane(DEFAULT_CONTROLS, 'comb pitch'),
    mod0Depth: -0.8,
  }
  const off = unsolderLane(mine, 'comb pitch')
  expect(off.mod0Src).toBe(SRC_OFF)
  expect(laneWire(off, 'comb pitch')).toBe(0)
  expect(solderLane(off, 'comb pitch')).toEqual(mine)
})

// The one patch in the bay that can do nothing at all, so the row that would
// make it never offers to.
test('no wire is offered its own depth', () => {
  const three = busy(3)
  expect(laneHasSpare(three, 'wire 4 depth')).toBe(false)
  expect(laneHasSpare(three, 'wire 3 depth')).toBe(true)
  expect(solderLane(three, 'wire 4 depth')).toEqual(three)
})

test('a full bay has nothing to offer and changes nothing', () => {
  const full = busy(4)
  expect(laneHasSpare(full, 'filt cut')).toBe(false)
  expect(solderLane(full, 'filt cut')).toEqual(full)
})

test('a lane already wired reports the wire on it, whatever the source', () => {
  const c = {
    ...busy(1),
    mod0Src: choiceValue('mod0Src', 'body X'),
    mod0Depth: -0.25,
  }
  expect(laneWire(c, 'fb amount')).toBe(1)
  expect(laneReads(c, 'fb amount')).toBe('body X')
  expect(laneSays(c, 'fb amount')).toBe('body X, pushing 0.25 flipped')
  expect(laneWire(c, 'filt cut')).toBe(0)
  expect(laneSays(c, 'filt cut')).toBe('')
})

// The rate is the difference between a sweep and a buzz, and the badge is where
// a reader is already looking. Only the bay's own oscillator has one — a wire
// off the contact pad runs at the speed of your hand.
test('the badge carries the rate the wire is running at', () => {
  const fast = { ...solderLane(DEFAULT_CONTROLS, 'filt cut'), modLfoHz: 220 }
  expect(laneReads(fast, 'filt cut')).toBe('LFO 220Hz')
  const slow = { ...fast, modLfoHz: 0.05 }
  expect(laneReads(slow, 'filt cut')).toBe('LFO 0.05Hz')
})

// One oscillator serves all four wires, so a row drawing its rate has to know
// when that rate is not its own business alone.
test('the bay counts what is picking its oscillator up', () => {
  expect(bayLfoWires(DEFAULT_CONTROLS)).toBe(0)
  const one = solderLane(DEFAULT_CONTROLS, 'filt cut')
  expect(bayLfoWires(one)).toBe(1)
  expect(bayLfoWires(solderLane(one, 'ring car'))).toBe(2)
})

// The tables' half of the same promise: a lane is a name the bay knows, one
// control owns it.
test('every lane a control claims is a lane the bay has, and claimed once', () => {
  const dests = sliderFor('mod0Dest').choices ?? []
  const claimed = new Map<string, string>()
  for (const s of ALL_SLIDERS)
    if (s.lane !== undefined) {
      expect(dests).toContain(s.lane)
      expect(claimed.get(s.lane)).toBeUndefined()
      claimed.set(s.lane, s.key)
    }
  // The two the bay can land on that no one knob is: both move the window the
  // sampler's in and out markers set rather than either marker itself.
  expect(dests.filter(d => !claimed.has(d))).toEqual([
    'loop slide',
    'loop span',
  ])
})
