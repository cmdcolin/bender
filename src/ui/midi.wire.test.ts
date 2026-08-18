// The wire end to end: real MIDI bytes into the manager, and the board coming
// out the other side. Everything above this file's fake access object is the
// shipping code path — binding, soft takeover, the undo walk and the keyboard.

import { beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { sliderFor } from './controls'
import { ccToValue, midi, velocity } from './midi'

type Handler = ((e: MIDIMessageEvent) => void) | null

const input = { onmidimessage: null as Handler }
const sent: number[][] = []
const output = { send: (bytes: number[]) => sent.push(bytes) }
const access = {
  inputs: new Map([['one', input]]),
  outputs: new Map([['one', output]]),
  addEventListener() {},
  removeEventListener() {},
}

vi.stubGlobal('navigator', {
  requestMIDIAccess: () => Promise.resolve(access),
})
// Runs the callback where the browser would defer it, so a coalesced send lands
// inside the test that caused it rather than after the suite.
vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
  fn()
  return 1
})
vi.stubGlobal('cancelAnimationFrame', () => {})

const send = (...bytes: number[]) => {
  input.onmidimessage?.({ data: new Uint8Array(bytes) } as MIDIMessageEvent)
}

const cc = (controller: number, value: number, channel = 0) =>
  send(0xb0 | channel, controller, value)

beforeEach(async () => {
  midi.setLights(false)
  midi.clearAll()
  midi.arm(null)
  sent.length = 0
  engine.writeBoard({ ...DEFAULT_CONTROLS })
  if (midi.status.get() !== 'ready') {
    midi.enable()
    await vi.waitFor(() => expect(midi.status.get()).toBe('ready'))
  }
})

test('arming a control gives it to the next knob that moves', () => {
  midi.arm('filtHz')
  cc(21, 64)
  expect(midi.bindings.get().filtHz).toEqual({ channel: 0, controller: 21 })
  expect(midi.armed.get()).toBeNull()
})

test('a knob has to sweep through the value before it drives', () => {
  const def = sliderFor('dlyMix')
  midi.arm('dlyMix')
  // The message that binds says which knob, and no more: the board is at 0, and
  // this knob is at the far end of its travel from there.
  cc(22, 127)
  expect(engine.controls.get().dlyMix).toBe(DEFAULT_CONTROLS.dlyMix)
  expect(midi.pickups.get().dlyMix).toBe(ccToValue(def, 127))

  cc(22, 90) // turning down, still above the value on screen
  expect(engine.controls.get().dlyMix).toBe(DEFAULT_CONTROLS.dlyMix)
  expect(midi.pickups.get().dlyMix).toBe(ccToValue(def, 90))

  cc(22, 0) // swept down through it, so the knob has it now
  expect(midi.pickups.get().dlyMix).toBeUndefined()
  cc(22, 64)
  expect(engine.controls.get().dlyMix).toBe(ccToValue(def, 64))
})

test('a board moved from elsewhere strands the knob until it catches again', () => {
  midi.arm('dlyMix')
  cc(23, 0) // binds where the board already stands, so the next move drives
  cc(23, 64)
  expect(engine.controls.get().dlyMix).toBe(ccToValue(sliderFor('dlyMix'), 64))

  // A preset, a roll, a morph: anything that is not this knob.
  engine.writeBoard({ ...engine.controls.get(), dlyMix: 0.9 })
  expect(midi.pickups.get().dlyMix).toBe(ccToValue(sliderFor('dlyMix'), 64))

  cc(23, 70) // the knob moves, but it has not reached 0.9
  expect(engine.controls.get().dlyMix).toBe(0.9)
})

// A sweep is one gesture, the way a slider drag is: undo has to put back the
// board it set off from, not the last CC message before you let go.
test('one turn of a knob is one step in the walk', () => {
  // Somewhere the walk has not already been — an identical board is deduped, and
  // rightly so, but then this would be measuring the dedupe.
  engine.writeBoard({ ...DEFAULT_CONTROLS, combMix: 0.42 })
  const before = engine.history.get().past.length
  midi.arm('dlyMix')
  cc(24, 0)
  for (let v = 0; v <= 60; v += 4) cc(24, v)
  expect(engine.controls.get().dlyMix).toBeGreaterThan(0)
  expect(engine.history.get().past.length).toBe(before + 1)
  engine.undo(0)
  expect(engine.controls.get().dlyMix).toBe(DEFAULT_CONTROLS.dlyMix)
  expect(engine.controls.get().combMix).toBe(0.42)
})

test('a CC drives one control at a time', () => {
  midi.arm('dlyMix')
  cc(25, 0)
  midi.arm('revMix')
  cc(25, 0)
  expect(midi.bindings.get().dlyMix).toBeUndefined()
  expect(midi.bindings.get().revMix).toEqual({ channel: 0, controller: 25 })
})

test('the same controller on another channel is another knob', () => {
  midi.arm('dlyMix')
  cc(26, 0, 0)
  midi.arm('revMix')
  cc(26, 0, 3)
  expect(midi.bindings.get().dlyMix).toEqual({ channel: 0, controller: 26 })
  expect(midi.bindings.get().revMix).toEqual({ channel: 3, controller: 26 })
})

test('a sweep binds one control per knob, however long each turns for', () => {
  midi.learnSequence()
  const first = midi.learn.get()?.next
  cc(40, 10)
  cc(40, 20) // the same knob still turning must not claim a second control
  cc(41, 10)
  const bindings = midi.bindings.get()
  expect(first).toBeDefined()
  expect(bindings[first!]).toEqual({ channel: 0, controller: 40 })
  expect(midi.learn.get()?.done).toBe(2)
  midi.stopLearn()
  expect(midi.learn.get()).toBeNull()
})

test('notes strike the chip, and let go of the note they struck', () => {
  const on = vi.spyOn(engine, 'noteOn')
  const off = vi.spyOn(engine, 'noteOff')
  midi.setNotes(true)
  send(0x90, 60, 100) // middle C
  // Three semitones above the toy's A3, struck as hard as the key was hit.
  expect(on).toHaveBeenCalledWith(3, velocity(100))
  send(0x80, 60, 0)
  expect(off).toHaveBeenCalledWith(3)
  // The running-status spelling of a note off, which a latching voice needs too.
  send(0x90, 62, 0)
  expect(off).toHaveBeenCalledWith(5)
  on.mockRestore()
  off.mockRestore()
})

// The panel's keyboard lights off this set, so a key on the wire has to land in
// it at the pitch the chip is playing — three semitones up from the controller's
// middle C, which is where the drawn board has it.
test('a key on the wire lights the key on the screen', () => {
  midi.setNotes(true)
  send(0x90, 60, 100)
  expect(engine.sounding.get().has(3)).toBe(true)
  send(0x80, 60, 0)
  expect(engine.sounding.get().has(3)).toBe(false)
})

test('a harder key strikes harder', () => {
  const on = vi.spyOn(engine, 'noteOn')
  midi.setNotes(true)
  send(0x90, 60, 20)
  send(0x90, 64, 127)
  const [soft, hard] = on.mock.calls.map(c => c[1] ?? 1)
  expect(soft).toBeDefined()
  expect(hard).toBe(1)
  expect(soft!).toBeLessThan(hard!)
  on.mockRestore()
})

test('notes stay off the chip when the panel says so', () => {
  const on = vi.spyOn(engine, 'noteOn')
  midi.setNotes(false)
  send(0x90, 60, 100)
  expect(on).not.toHaveBeenCalled()
  midi.setNotes(true)
  on.mockRestore()
})

// An endless encoder has no position to disagree with the screen, so the whole
// soft-takeover dance is beside the point: a turn moves the control from
// wherever it stands, first message included.
test('an encoder turns the control from where it stands, with nothing to catch', () => {
  const def = sliderFor('dlyMix')
  engine.writeBoard({ ...DEFAULT_CONTROLS, dlyMix: 0.5 })
  midi.arm('dlyMix')
  cc(30, 65)
  midi.setRelative('dlyMix', true)

  cc(30, 65) // one click up, offset spelling
  expect(engine.controls.get().dlyMix).toBeGreaterThan(0.5)
  expect(midi.pickups.get().dlyMix).toBeUndefined()

  const up = engine.controls.get().dlyMix
  cc(30, 63) // one click back down
  // A click is one CC step's worth of travel, landed on the control's own grid —
  // which here is the coarser of the two, so a click is exactly one grid step
  // and turning back undoes turning forward.
  expect(up - 0.5).toBeCloseTo(def.step, 5)
  expect(engine.controls.get().dlyMix).toBeCloseTo(0.5, 5)
})

test('a preset cannot strand an encoder', () => {
  midi.arm('dlyMix')
  cc(31, 65)
  midi.setRelative('dlyMix', true)
  cc(31, 65)
  engine.writeBoard({ ...engine.controls.get(), dlyMix: 0.9 })
  expect(midi.pickups.get().dlyMix).toBeUndefined()
  cc(31, 65)
  expect(engine.controls.get().dlyMix).toBeGreaterThan(0.9)
})

// The two spellings mean opposite things by the same byte, so the one the knob
// uses is latched from its first message rather than re-read per byte — where a
// fast turn's big delta would look exactly like the other spelling.
test('an encoder that counts from the ends is read that way too', () => {
  midi.arm('dlyMix')
  cc(32, 1)
  midi.setRelative('dlyMix', true)
  engine.writeBoard({ ...DEFAULT_CONTROLS, dlyMix: 0.5 })

  cc(32, 1) // one click up, two's-complement spelling
  expect(engine.controls.get().dlyMix).toBeGreaterThan(0.5)
  cc(32, 127) // one click down
  expect(engine.controls.get().dlyMix).toBeCloseTo(0.5, 5)
  // A fast turn: +40, which in the other spelling would read as a big negative.
  cc(32, 40)
  expect(engine.controls.get().dlyMix).toBeGreaterThan(0.5)
})

test('the rings follow the board, and only where it moved', () => {
  midi.arm('dlyMix')
  cc(33, 0)
  midi.setLights(true)
  sent.length = 0

  engine.writeBoard({ ...engine.controls.get(), dlyMix: 1 })
  expect(sent).toEqual([[0xb0, 33, 127]])

  // A frame that moved nothing bound must not re-send what it already said.
  sent.length = 0
  engine.writeBoard({ ...engine.controls.get(), revMix: 0.4 })
  expect(sent).toEqual([])
  midi.setLights(false)
})

test('the rings stay dark until they are switched on', () => {
  midi.arm('dlyMix')
  cc(34, 0)
  sent.length = 0
  engine.writeBoard({ ...engine.controls.get(), dlyMix: 1 })
  expect(sent).toEqual([])
})

test('clock sets the tempo only once it is asked to', () => {
  const tick = () => send(0xf8)
  midi.setClockLock(false)
  vi.spyOn(performance, 'now').mockReturnValue(0)
  for (let i = 0; i < 30; i++) {
    vi.spyOn(performance, 'now').mockReturnValue(i * (60000 / (140 * 24)))
    tick()
  }
  expect(midi.bpm.get()).toBe(140)
  expect(engine.controls.get().drumBpm).toBe(DEFAULT_CONTROLS.drumBpm)

  midi.setClockLock(true)
  for (let i = 30; i < 60; i++) {
    vi.spyOn(performance, 'now').mockReturnValue(i * (60000 / (90 * 24)))
    tick()
  }
  expect(engine.controls.get().drumBpm).toBe(90)
  midi.setClockLock(false)
  vi.restoreAllMocks()
})
