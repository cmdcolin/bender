import { expect, test } from 'vitest'
import { CONTROL_KEYS } from '../controls'
import { ALL_SLIDERS, sliderFor } from './controls'
import { ACCENT_GAIN, N_DRUM_VOICES } from '../drums'
import {
  applyDelta,
  AUTOMAP_KEYS,
  bpmFromPulses,
  ccToDelta,
  ccToValue,
  hasCaught,
  isOffsetSpelling,
  parseBindings,
  velocity,
} from './midi'
import { gmVoice, GM_PADS, padGain, parsePads, VOICE_KEYS } from './pads'
import { omit } from './persist'
import { toPos } from './slider-scale'

test('a CC sweeps the whole of a control and lands on its grid', () => {
  const def = sliderFor('filtHz')
  expect(ccToValue(def, 0)).toBe(def.min)
  expect(ccToValue(def, 127)).toBe(def.max)
  for (let cc = 0; cc <= 127; cc++) {
    const v = ccToValue(def, cc)
    expect(v).toBeGreaterThanOrEqual(def.min)
    expect(v).toBeLessThanOrEqual(def.max)
  }
})

// A knob on a log control should feel like the slider on screen: half way round
// is half way along the travel, not half the frequency.
test('a curved control takes the knob through its own travel', () => {
  const def = sliderFor('filtHz')
  expect(def.curve).toBe('log')
  const mid = ccToValue(def, 64)
  expect(mid).toBeLessThan((def.min + def.max) / 2)
  expect(mid).toBeGreaterThan(def.min)
})

test('an enum control gets one step per choice', () => {
  const def = sliderFor('distMode')
  const seen = new Set<number>()
  for (let cc = 0; cc <= 127; cc++) seen.add(ccToValue(def, cc))
  expect(seen.size).toBe((def.choices ?? []).length)
})

test('a knob with nothing to catch drives at once', () => {
  const span = { min: 0, max: 1, step: 0.01 }
  expect(hasCaught(span, undefined, undefined, 0.9)).toBe(true)
})

test('a first message catches only when it lands near the value', () => {
  const span = { min: 0, max: 1, step: 0.01 }
  expect(hasCaught(span, 0.5, undefined, 0.5)).toBe(true)
  expect(hasCaught(span, 0.5, undefined, 0.51)).toBe(true)
  expect(hasCaught(span, 0.5, undefined, 0.9)).toBe(false)
})

test('a knob catches by sweeping through the value, from either side', () => {
  const span = { min: 0, max: 1, step: 0.01 }
  expect(hasCaught(span, 0.5, 0.2, 0.4)).toBe(false)
  expect(hasCaught(span, 0.5, 0.2, 0.6)).toBe(true)
  expect(hasCaught(span, 0.5, 0.9, 0.3)).toBe(true)
})

test('tempo comes off a run of ticks, and not off too few', () => {
  // 120 BPM is two beats a second, so 24 ticks a beat is one every 20.833ms.
  const at = (n: number) =>
    Array.from({ length: n }, (_, i) => i * (60000 / (120 * 24)))
  expect(bpmFromPulses(at(6))).toBeNull()
  expect(bpmFromPulses(at(25))).toBe(120)
  expect(bpmFromPulses([])).toBeNull()
})

test('a stored map keeps what still names a control and drops the rest', () => {
  const raw = JSON.stringify({
    filtHz: { channel: 0, controller: 12 },
    gonePlace: { channel: 0, controller: 13 },
    drumKick: { channel: 0, controller: 14 },
    dlyMix: { channel: 'nine', controller: 15 },
  })
  // drumKick is a control, but a sixteen-step mask no slider turns — a knob on
  // it could never be listed, and so could never be taken off again.
  expect(parseBindings(raw)).toEqual({ filtHz: { channel: 0, controller: 12 } })
})

test('a map that will not parse is no bindings, not a crash', () => {
  expect(parseBindings(null)).toEqual({})
  expect(parseBindings('{{')).toEqual({})
  expect(parseBindings('"a string"')).toEqual({})
})

test('the auto-map spine covers every slider exactly once', () => {
  expect(AUTOMAP_KEYS.length).toBe(ALL_SLIDERS.length)
  expect(new Set(AUTOMAP_KEYS).size).toBe(AUTOMAP_KEYS.length)
  for (const key of AUTOMAP_KEYS) expect(CONTROL_KEYS).toContain(key)
})

// The first row of knobs on any device should reach whether each stage is there
// at all, which is what the mixes and levels are.
test('the mixes and levels take the head of the spine', () => {
  const roles = ALL_SLIDERS.filter(s => s.role).length
  expect(roles).toBeGreaterThan(0)
  for (const key of AUTOMAP_KEYS.slice(0, roles))
    expect(sliderFor(key).role).toBeDefined()
})

// The two encoder spellings mean opposite things by the same byte, so nothing
// can read a lone message correctly for both. What separates them is where a
// single click lands: against the middle, or against the ends.
test('a single click tells the two encoder spellings apart', () => {
  expect(isOffsetSpelling(65)).toBe(true) // one click up, offset
  expect(isOffsetSpelling(63)).toBe(true) // one click down, offset
  expect(isOffsetSpelling(1)).toBe(false) // one click up, two's complement
  expect(isOffsetSpelling(127)).toBe(false) // one click down, two's complement
  expect(isOffsetSpelling(64)).toBe(false) // dead centre is no turn at all
})

test('each spelling counts turns in both directions', () => {
  expect(ccToDelta(65, true)).toBe(1)
  expect(ccToDelta(63, true)).toBe(-1)
  expect(ccToDelta(68, true)).toBe(4)
  expect(ccToDelta(1, false)).toBe(1)
  expect(ccToDelta(127, false)).toBe(-1)
  expect(ccToDelta(4, false)).toBe(4)
  expect(ccToDelta(124, false)).toBe(-4)
})

test('a turn moves any control at the same rate, and stops at the ends', () => {
  // One click is one CC step's worth of travel, whatever the control's units or
  // curve — so an encoder crosses a log filter and a five-choice enum alike.
  for (const key of ['filtHz', 'dlyMix', 'distMode'] as const) {
    const def = sliderFor(key)
    const up = applyDelta(def, def.min, 1)
    expect(up).toBeGreaterThanOrEqual(def.min)
    expect(applyDelta(def, def.min, -1)).toBe(def.min)
    expect(applyDelta(def, def.max, 1)).toBe(def.max)
  }
  const def = sliderFor('filtHz')
  const mid = ccToValue(def, 64)
  expect(toPos(def, applyDelta(def, mid, 10))).toBeCloseTo(
    toPos(def, mid) + 10 / 127,
    3,
  )
})

test('velocity strikes at full and never at nothing', () => {
  expect(velocity(127)).toBe(1)
  expect(velocity(0)).toBeGreaterThan(0.2)
  expect(velocity(64)).toBeGreaterThan(velocity(20))
  expect(velocity(20)).toBeLessThan(1)
})

test('a stored binding keeps how its knob is read', () => {
  const raw = JSON.stringify({
    filtHz: { channel: 0, controller: 12, relative: true },
    dlyMix: { channel: 0, controller: 13 },
  })
  expect(parseBindings(raw)).toEqual({
    filtHz: { channel: 0, controller: 12, relative: true },
    dlyMix: { channel: 0, controller: 13 },
  })
})

test('omit copies without the key', () => {
  const map = { a: 1, b: 2 }
  expect(omit(map, 'a')).toEqual({ b: 2 })
  expect(map).toEqual({ a: 1, b: 2 })
})

// A note that named two voices would fire whichever the loop reached last, and
// the map is written out by hand — so this is the check the hand needs.
test('no percussion note names two voices', () => {
  const seen = new Set<number>()
  for (const notes of Object.values(GM_PADS))
    for (const note of notes) {
      expect(seen.has(note)).toBe(false)
      seen.add(note)
    }
  // Every note General MIDI puts on the drum channel lands somewhere: a pad
  // that does nothing reads as a broken pad.
  for (let note = 35; note <= 81; note++) expect(seen.has(note)).toBe(true)
})

test('the map covers the kit, and only the kit', () => {
  expect(Object.keys(GM_PADS).length).toBe(N_DRUM_VOICES)
  for (const key of VOICE_KEYS) expect(GM_PADS[key].length).toBeGreaterThan(0)
  for (const notes of Object.values(GM_PADS))
    for (const note of notes) {
      const voice = gmVoice(note)
      expect(voice).not.toBeNull()
      expect(voice!).toBeLessThan(N_DRUM_VOICES)
    }
  // Below the standard's own bottom note is somebody's keyboard, not a pad.
  expect(gmVoice(34)).toBeNull()
  expect(gmVoice(82)).toBeNull()
})

// The kit itself has two weights — a plain step and an accented one — and a pad
// plays between them, so a middling hit is what the sequencer would have played.
test('a pad plays between a plain step and an accent', () => {
  expect(padGain(127)).toBe(ACCENT_GAIN)
  expect(padGain(64)).toBeCloseTo(1, 1)
  expect(padGain(0)).toBeGreaterThan(0)
  for (let v = 1; v <= 127; v++)
    expect(padGain(v)).toBeGreaterThan(padGain(v - 1))
})

test('a stored pad map keeps what still names a voice', () => {
  const stored = JSON.stringify({
    drumKick: { channel: 9, note: 36 },
    drumSnare: { channel: 9 },
    drumWhistle: { channel: 9, note: 40 },
    drumHat: 42,
  })
  expect(parsePads(stored)).toEqual({ drumKick: { channel: 9, note: 36 } })
  expect(parsePads(null)).toEqual({})
  expect(parsePads('not json')).toEqual({})
})
