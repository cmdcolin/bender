import { expect, test } from 'vitest'
import type { Controls } from '../../controls'
import { envelope, render, renderBender, rms, SR } from '../testRender'
import { ARP_MODES, ToyChip } from './toyChip'
import { YOURS } from './roms'

// The arpeggiator is the chip's own counter walking your hand instead of the
// ROM, so what has to hold is that it is *that* counter: the figure runs at the
// rate the switch says, it climbs the way the pattern says, and every bend that
// drags the chip's clock drags the arpeggio with it.

const mode = (name: string) => ARP_MODES.indexOf(name)

const CHORD = [0, 4, 7]

// One envelope generator ties the key voices' decay to the sequencer's rate, so
// a board whose notes are to be told apart is a board on a fast one: the memory,
// wound up, which is the only step rate that is a control rather than a ROM's.
const BASE: Partial<Controls> = {
  chipLevel: 0.8,
  drumLevel: 0,
  chipTune: YOURS,
  tuneRate: 20,
  chipArpHz: 8,
}

// A chord pressed once the board is running, and what the chip is sounding at
// the end of every block after that. Pressing it after the first block rather
// than before is what a hand does: the switch is already where it is.
function arpNotes(overrides: Partial<Controls>, seconds: number) {
  const out = new Int16Array(ToyChip.MAX_SOUNDING)
  const seq: number[][] = []
  let pressed = false
  renderBender(
    { ...BASE, ...overrides },
    seconds,
    undefined,
    undefined,
    (built, secs) => {
      if (!pressed && secs > 0.02) {
        pressed = true
        for (const note of CHORD) built.toyChip.noteOn(note)
      }
      const n = built.toyChip.soundingNotes(out)
      // The report is read before the block that answers the press, so the
      // first one is the board still standing where it was.
      if (pressed && n > 0) seq.push([...out.subarray(0, n)])
    },
  )
  return seq
}

const arpAudio = (overrides: Partial<Controls>, seconds: number) => {
  let pressed = false
  return renderBender(
    { ...BASE, ...overrides },
    seconds,
    undefined,
    undefined,
    (built, secs) => {
      if (pressed || secs < 0.02) return
      pressed = true
      for (const note of CHORD) built.toyChip.noteOn(note)
    },
  )
}

// Notes struck, counted off the level rather than off the silences between
// them: this chip's voices ring for a while and the next note lands on top of
// the last, so what a strike looks like from outside is the level jumping.
const restrikes = (x: Float32Array) => {
  const env = envelope(x, 0.01)
  let n = 0
  for (let i = 1; i < env.length; i++) if (env[i]! > env[i - 1]! * 1.6) n++
  return n
}

test('a held chord drones with the switch off and repeats with it on', () => {
  expect(restrikes(arpAudio({ chipArp: 0 }, 2))).toBeLessThan(3)
  expect(restrikes(arpAudio({ chipArp: mode('up') }, 2))).toBeGreaterThan(10)
})

// The first note out is the whole of the difference between the patterns, and
// the one place it is unambiguous — a note rings for a while on this chip, so
// after that they overlap.
test('up starts on the bottom of the chord and down on the top', () => {
  expect(arpNotes({ chipArp: mode('up') }, 0.2)[0]).toEqual([CHORD[0]])
  expect(arpNotes({ chipArp: mode('down') }, 0.2)[0]).toEqual([CHORD.at(-1)])
})

// Range stacks the walk in octaves, and down starts at the top of the top one —
// so two octaves of a chord topped at 7 opens on 19 rather than climbing there.
test('the range climbs the figure in octaves', () => {
  const up = arpNotes({ chipArp: mode('up'), chipArpOct: 2 }, 1.5).flat()
  expect(up.some(n => n >= 12)).toBe(true)
  expect(arpNotes({ chipArp: mode('down'), chipArpOct: 2 }, 0.2)[0]).toEqual([
    CHORD.at(-1)! + 12,
  ])
})

test('the rate is notes a second', () => {
  const at = (chipArpHz: number) =>
    restrikes(arpAudio({ chipArp: mode('up'), chipArpHz }, 2))
  expect(at(3)).toBeGreaterThan(3)
  expect(at(9)).toBeGreaterThan(2 * at(3))
})

// The point of putting it on the divider rather than on a clock of its own:
// every bend that drags the chip drags the figure.
test('the chip’s clock drags the arpeggio along with the tune', () => {
  const at = (chipClockX: number) =>
    restrikes(arpAudio({ chipArp: mode('up'), chipArpHz: 4, chipClockX }, 2))
  expect(at(2)).toBeGreaterThan(1.6 * at(1))
})

test('letting go of the keys ends the figure', () => {
  let phase = 0
  const x = renderBender(
    { ...BASE, chipArp: mode('up') },
    2,
    undefined,
    undefined,
    (built, secs) => {
      if (phase === 0 && secs > 0.02) {
        phase = 1
        for (const note of CHORD) built.toyChip.noteOn(note)
      } else if (phase === 1 && secs > 1) {
        phase = 2
        for (const note of CHORD) built.noteOff(note)
      }
    },
  )
  expect(rms(x.subarray(0, SR))).toBeGreaterThan(0.01)
  expect(rms(x.subarray(1.5 * SR))).toBeLessThan(0.002)
})

// The gate line carries whatever strikes a note, so the chip next door plays
// the figure too wherever that jumper is still soldered on.
test('an arpeggio on the toy reaches the FM chip through the gate', () => {
  const play = (fmKeyGate: number) => {
    let pressed = false
    return rms(
      renderBender(
        { ...BASE, chipLevel: 0, fmLevel: 0.8, chipArp: mode('up'), fmKeyGate },
        1.5,
        undefined,
        undefined,
        (built, secs) => {
          if (pressed || secs < 0.02) return
          pressed = true
          for (const note of CHORD) built.toyChip.noteOn(note)
        },
      ),
    )
  }
  expect(play(0)).toBeGreaterThan(0.01)
  expect(play(1)).toBe(0)
})

// A board nobody has touched the switch on is the board that shipped: keys that
// drone under a hand, and nothing walking anywhere.
test('the arpeggiator is off until you switch it on', () => {
  expect(rms(render({ chipLevel: 0.8 }, 1))).toBeGreaterThan(0)
})
