// The wire end to end: real MIDI bytes into the manager, and the board coming
// out the other side. Everything above this file's fake access object is the
// shipping code path — binding, soft takeover, the undo walk and the keyboard.

import { beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { sliderFor } from './controls'
import { ccToValue, midi } from './midi'

type Handler = ((e: MIDIMessageEvent) => void) | null

const input = { onmidimessage: null as Handler }
const access = {
  inputs: new Map([['one', input]]),
  addEventListener() {},
  removeEventListener() {},
}

vi.stubGlobal('navigator', {
  requestMIDIAccess: () => Promise.resolve(access),
})
vi.stubGlobal('requestAnimationFrame', () => 0)

const send = (...bytes: number[]) => {
  input.onmidimessage?.({ data: new Uint8Array(bytes) } as MIDIMessageEvent)
}

const cc = (controller: number, value: number, channel = 0) =>
  send(0xb0 | channel, controller, value)

beforeEach(async () => {
  midi.clearAll()
  midi.arm(null)
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
  expect(on).toHaveBeenCalledWith(3) // three semitones above the toy's A3
  send(0x80, 60, 0)
  expect(off).toHaveBeenCalledWith(3)
  // The running-status spelling of a note off, which a latching voice needs too.
  send(0x90, 62, 0)
  expect(off).toHaveBeenCalledWith(5)
  on.mockRestore()
  off.mockRestore()
})

test('notes stay off the chip when the panel says so', () => {
  const on = vi.spyOn(engine, 'noteOn')
  midi.setNotes(false)
  send(0x90, 60, 100)
  expect(on).not.toHaveBeenCalled()
  midi.setNotes(true)
  on.mockRestore()
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
