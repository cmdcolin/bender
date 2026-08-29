// The wire end to end: real MIDI bytes into the manager, and the board coming
// out the other side. Everything above this file's fake access object is the
// shipping code path — binding, soft takeover, the undo walk and the keyboard.

import { beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { bursts, render } from '../dsp/testRender'
import { YOURS } from '../dsp/stages/roms'
import { REST, TUNE_STEP_KEYS } from '../tune'
import { engine } from '../engine/engine'
import { sliderFor } from './controls'
import { ACCENT_GAIN, hasStep } from '../drums'
import { ccToValue, midi, velocity } from './midi'
import { padGain } from './pads'

type Handler = ((e: MIDIMessageEvent) => void) | null

const input = { onmidimessage: null as Handler }
const sent: number[][] = []
const output = { send: (bytes: number[]) => sent.push(bytes) }
// The state-change listener is kept so a test can unplug the device: that is
// the one thing a controller cannot tell the app about itself, since a port on
// its way out sends nothing.
let onStateChange: ((e: Event) => void) | null = null
const access = {
  inputs: new Map([['one', input]]),
  outputs: new Map([['one', output]]),
  addEventListener(_kind: string, fn: (e: Event) => void) {
    onStateChange = fn
  },
  removeEventListener() {},
}
const unplug = () =>
  onStateChange?.({ port: { state: 'disconnected' } } as unknown as Event)

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
  midi.clearPads()
  midi.setPads(true)
  midi.arm(null)
  midi.allNotesOff()
  midi.setKeyRoute('toy')
  midi.setClockOut(false)
  midi.setNoteOut(false)
  engine.setDrumsPlaying(false)
  engine.chipNotes.set(new Set())
  engine.fmNotes.set(new Set())
  engine.meter.set({ ...engine.meter.get(), tick: 0 })
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
  expect(on).toHaveBeenCalledWith(3, velocity(100), 'toy')
  send(0x80, 60, 0)
  expect(off).toHaveBeenCalledWith(3, 'toy')
  // The running-status spelling of a note off, which a latching voice needs too.
  send(0x90, 62, 0)
  expect(off).toHaveBeenCalledWith(5, 'toy')
  on.mockRestore()
  off.mockRestore()
})

// The panel's keyboard lights off this set, so a key on the wire has to land in
// it at the pitch the chip is playing: the chip counts from A3, so a
// controller's middle C is semitone 3.
test('a key on the wire lights the key on the screen', () => {
  midi.setNotes(true)
  send(0x90, 60, 100)
  expect(engine.keysDown.get().has(3)).toBe(true)
  send(0x80, 60, 0)
  expect(engine.keysDown.get().has(3)).toBe(false)
})

// The pedal, and the two messages that mean "let go of everything". The chip's
// voices latch, so a note the wire never ends is a note that never stops — and
// the panel's keyboard now sits there lit, saying so.
test('the sustain pedal holds notes past the key coming up', () => {
  midi.setNotes(true)
  send(0xb0, 64, 127) // pedal down
  send(0x90, 60, 100)
  send(0x80, 60, 0)
  expect(engine.keysDown.get().has(3)).toBe(true)

  send(0xb0, 64, 0) // pedal up
  expect(engine.keysDown.get().has(3)).toBe(false)
})

test('a key struck under the pedal and let go with it ends once', () => {
  midi.setNotes(true)
  send(0xb0, 64, 127)
  send(0x90, 60, 100)
  send(0xb0, 64, 0)
  // Still down: the key was never let go of, so the pedal lifting is not its
  // business.
  expect(engine.keysDown.get().has(3)).toBe(true)
  send(0x80, 60, 0)
  expect(engine.keysDown.get().has(3)).toBe(false)
})

test('all notes off lets go of everything the wire is holding', () => {
  midi.setNotes(true)
  send(0x90, 60, 100)
  send(0x90, 64, 100)
  expect(engine.keysDown.get().size).toBe(2)
  send(0xb0, 123, 0)
  expect(engine.keysDown.get().size).toBe(0)
})

test('a device leaving the desk mid-note lets go of it', () => {
  midi.setNotes(true)
  send(0x90, 60, 100)
  expect(engine.keysDown.get().has(3)).toBe(true)
  unplug()
  expect(engine.keysDown.get().has(3)).toBe(false)
})

test('turning notes off at the panel does not strand what is playing', () => {
  midi.setNotes(true)
  send(0x90, 60, 100)
  midi.setNotes(false)
  expect(engine.keysDown.get().size).toBe(0)
  midi.setNotes(true)
})

// A pedal input spent on a control is that control's. Only a CC nobody has
// bound is read as a pedal.
test('a bound CC64 drives its control rather than the pedal', () => {
  midi.setNotes(true)
  midi.arm('dlyMix')
  cc(64, 64)
  send(0x90, 60, 100)
  send(0xb0, 64, 127) // would be pedal down, but the knob owns this CC
  send(0x80, 60, 0)
  expect(engine.keysDown.get().has(3)).toBe(false)
  midi.clearAll()
})

// Two beds on the panel, one keybed on the desk. Where a note goes is the
// route's business, and the key coming up has to reach whatever the key going
// down reached — the route can move while a note is held.
test('the route says which bed the wire plays', () => {
  const on = vi.spyOn(engine, 'noteOn')
  midi.setNotes(true)
  midi.setKeyRoute('fm')
  send(0x90, 60, 100)
  expect(on).toHaveBeenCalledWith(3, velocity(100), 'fm')
  expect(engine.fmKeysDown.get().has(3)).toBe(true)
  expect(engine.keysDown.get().has(3)).toBe(false)
  send(0x80, 60, 0)
  expect(engine.fmKeysDown.get().has(3)).toBe(false)
  on.mockRestore()
})

test('both, and one key plays two synthesisers', () => {
  midi.setNotes(true)
  midi.setKeyRoute('layer')
  send(0x90, 60, 100)
  expect(engine.keysDown.get().has(3)).toBe(true)
  expect(engine.fmKeysDown.get().has(3)).toBe(true)
  send(0x80, 60, 0)
  expect(engine.keysDown.get().has(3)).toBe(false)
  expect(engine.fmKeysDown.get().has(3)).toBe(false)
})

test('split cuts the keybed at the note you set it to', () => {
  midi.setNotes(true)
  midi.setKeyRoute('split')
  midi.setSplit(60)
  send(0x90, 59, 100) // the B under it
  send(0x90, 60, 100) // and the split note itself
  expect(engine.keysDown.get().has(2)).toBe(true)
  expect(engine.fmKeysDown.get().has(3)).toBe(true)
  expect(engine.keysDown.get().has(3)).toBe(false)
})

// The place to cut a keybed is a key, so the panel asks for one — and the key
// that sets it is aimed at the panel rather than at the chip.
test('the split point can be taken off a key, which does not sound', () => {
  midi.setNotes(true)
  midi.setKeyRoute('split')
  midi.learnSplit(true)
  send(0x90, 67, 100)
  expect(midi.split.get()).toBe(67)
  expect(midi.splitLearn.get()).toBe(false)
  expect(engine.keysDown.get().size).toBe(0)
  expect(engine.fmKeysDown.get().size).toBe(0)
})

// A note is let go of where it was struck. Moving the switch mid-note used to
// be how a bed was left holding one for ever.
test('moving the route lets go of what the wire is holding', () => {
  midi.setNotes(true)
  send(0x90, 60, 100)
  expect(engine.keysDown.get().has(3)).toBe(true)
  midi.setKeyRoute('fm')
  expect(engine.keysDown.get().has(3)).toBe(false)
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

// Channel 10 is where General MIDI puts percussion, so a pad bank sending there
// is a pad bank saying it is a drum. Nothing to bind, nothing to learn.
test('a pad on channel 10 plays the kit with nothing set up', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  const note = vi.spyOn(engine, 'noteOn')
  midi.setNotes(true)
  send(0x99, 36, 100) // GM bass drum
  expect(hit).toHaveBeenCalledWith(1, padGain(100))
  send(0x99, 38, 100) // GM acoustic snare
  expect(hit).toHaveBeenLastCalledWith(2, padGain(100))
  // The kit took it, so the chip never saw it — a pad is not a key.
  expect(note).not.toHaveBeenCalled()
  hit.mockRestore()
  note.mockRestore()
})

// A drum is struck, not held: it has no release for a finger to come up off.
test('a pad lifting is nothing to let go of', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  send(0x99, 36, 100)
  send(0x89, 36, 0)
  send(0x99, 36, 0) // the running-status spelling of the same
  expect(hit).toHaveBeenCalledTimes(1)
  expect(engine.keysDown.get().size).toBe(0)
  hit.mockRestore()
})

// The kit's two weights are a plain step and an accented one, and a pad plays
// between them: middling is a step, hardest is an accent.
test('a harder pad hits harder, and the hardest accents', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  send(0x99, 36, 20)
  send(0x99, 36, 127)
  const [soft, hard] = hit.mock.calls.map(c => c[1] ?? 1)
  expect(soft!).toBeLessThan(1)
  expect(hard).toBe(ACCENT_GAIN)
  hit.mockRestore()
})

test('a sweep binds one voice per pad, down the kit', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  midi.learnPads()
  expect(midi.padLearn.get()?.next).toBe('drumKick')
  send(0x90, 60, 100) // a pad on channel 1, nowhere near General MIDI
  send(0x80, 60, 0) // lifting must not claim the voice after it
  send(0x90, 60, 100) // and neither must leaning on the same pad again
  expect(midi.padLearn.get()?.done).toBe(1)
  send(0x90, 61, 100)
  expect(midi.padBindings.get().drumKick).toEqual({ channel: 0, note: 60 })
  expect(midi.padBindings.get().drumSnare).toEqual({ channel: 0, note: 61 })
  midi.stopPadLearn()
  expect(midi.padLearn.get()).toBeNull()

  // Nothing was struck while binding — a pad you are pointing at is not a pad
  // you are playing.
  expect(hit).not.toHaveBeenCalled()
  send(0x90, 61, 100)
  expect(hit).toHaveBeenCalledWith(2, padGain(100))
  hit.mockRestore()
})

test('a learned pad wins over General MIDI', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  midi.learnPads()
  send(0x99, 36, 100) // GM's kick note, learned as the kick
  send(0x99, 40, 100) // GM's electric snare, learned as the snare
  midi.stopPadLearn()
  send(0x99, 38, 100) // GM's acoustic snare, which nothing learned
  expect(hit).toHaveBeenLastCalledWith(2, padGain(100))
  hit.mockRestore()
})

test('a pad drives one voice at a time', () => {
  midi.learnPads()
  send(0x90, 60, 100) // kick
  midi.stopPadLearn()
  midi.learnPads()
  send(0x90, 60, 100) // the same pad, now the kick again from a fresh sweep
  send(0x90, 62, 100) // snare
  midi.stopPadLearn()
  expect(midi.padBindings.get().drumKick).toEqual({ channel: 0, note: 60 })
  expect(midi.padBindings.get().drumSnare).toEqual({ channel: 0, note: 62 })
})

// A sweep is all six voices or nothing, and a hat that came out on the wrong pad
// is one voice. The ⚟ on a row is the one gesture that fixes it.
test('one voice can take a pad without redoing the kit', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  midi.learnPads()
  send(0x90, 60, 100) // kick
  send(0x90, 61, 100) // snare
  midi.stopPadLearn()

  midi.armPad('drumSnare')
  send(0x90, 70, 100)
  expect(midi.armedPad.get()).toBeNull()
  expect(midi.padBindings.get().drumSnare).toEqual({ channel: 0, note: 70 })
  expect(midi.padBindings.get().drumKick).toEqual({ channel: 0, note: 60 })
  // Binding is not playing, here as much as in a sweep.
  expect(hit).not.toHaveBeenCalled()
  send(0x90, 70, 100)
  expect(hit).toHaveBeenCalledWith(2, padGain(100))
  hit.mockRestore()
})

test('a voice taking a pad takes it off whatever had it', () => {
  midi.learnPads()
  send(0x90, 60, 100) // kick
  send(0x90, 61, 100) // snare
  midi.stopPadLearn()
  midi.armPad('drumHat')
  send(0x90, 60, 100) // the kick's own pad
  expect(midi.padBindings.get().drumHat).toEqual({ channel: 0, note: 60 })
  expect(midi.padBindings.get().drumKick).toBeUndefined()
})

// Every way of waiting is the board waiting on the controller, and two at once
// would take one message two ways.
test('a pad and a control cannot both be waiting', () => {
  midi.arm('filtHz')
  midi.armPad('drumHat')
  expect(midi.armed.get()).toBeNull()
  midi.arm('filtHz')
  expect(midi.armedPad.get()).toBeNull()
  midi.learnPads()
  midi.armPad('drumHat')
  expect(midi.padLearn.get()).toBeNull()
  midi.armPad(null)
})

test('with pads off, a drum note is just a note', () => {
  const hit = vi.spyOn(engine, 'drumHit')
  const note = vi.spyOn(engine, 'noteOn')
  midi.setPads(false)
  midi.setNotes(true)
  send(0x99, 36, 100)
  expect(hit).not.toHaveBeenCalled()
  expect(note).toHaveBeenCalled()
  midi.setPads(true)
  hit.mockRestore()
  note.mockRestore()
})

// The other half of record: what a pad plays lands on the grid, so a pattern can
// be played rather than drawn.
test('an armed pad writes the step it lands on', () => {
  engine.setDrumsPlaying(true)
  engine.patch({ drumKick: 0, drumSwing: 0 })
  engine.meter.set({ ...engine.meter.get(), tick: 6 })
  engine.drumRecord.set(true)
  send(0x99, 36, 100)
  expect(hasStep(engine.controls.get().drumKick, 6)).toBe(true)
  engine.drumRecord.set(false)
  engine.setDrumsPlaying(false)
})

// The bytes cannot tell a pad from a key, and which of the two it was is the
// thing you want to read while binding one.
test('the readout says which voice a pad struck', async () => {
  // The readout lands at a legible rate rather than a knob's, so each of these
  // has to arrive with the last one already on the panel.
  const legible = () => new Promise(r => setTimeout(r, 100))
  await legible()
  send(0x99, 42, 100)
  expect(midi.traffic.get()?.voice).toBe('hat')
  midi.setNotes(true)
  await legible()
  send(0x90, 60, 100)
  expect(midi.traffic.get()?.voice).toBeUndefined()
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

// Alternating note and rest, so a step of the memory is a burst with silence
// after it and the step rate can be counted off the level. The kit is muted:
// this take measures the toy. Same rig as sync.test.ts, which measures the same
// clock from the other end.
const TOY: Partial<Controls> = {
  ...Object.fromEntries(
    TUNE_STEP_KEYS.map((key, i) => [key, i % 2 === 0 ? 0 : REST]),
  ),
  chipLevel: 0.9,
  drumLevel: 0,
  chipTune: YOURS,
  tunePoly: 0,
  chipSync: 1,
}

// Nothing wires the clock input to the toy — the tempo control is the wire.
// Clock lock writes drumBpm, the lock on the toy counts off drumBpm, and so a
// toy locked to the kit is locked to whatever is driving the kit. Worth a take
// rather than an argument: the day someone gives the clock input a timebase of
// its own, this is what says the toy stopped following the room.
test('a locked toy counts off the clock arriving on the wire', () => {
  midi.setClockLock(true)
  for (let i = 0; i < 30; i++) {
    vi.spyOn(performance, 'now').mockReturnValue(i * (60000 / (90 * 24)))
    send(0xf8)
  }
  expect(engine.controls.get().drumBpm).toBe(90)

  // Sixteen steps to the bar, so 90 bpm is six of them a second — and two steps
  // to a burst, since every other one is the rest.
  const seconds = 4
  const x = render({ ...engine.controls.get(), ...TOY }, seconds)
  expect((2 * bursts(x)) / seconds).toBeCloseTo(6, 5)
  vi.restoreAllMocks()
})

// The lock follows the room's tempo; it does not fall in step with its
// downbeat. Nothing here handles 0xFA, and the kit's counter runs free off the
// tempo control, so the wire buys you the right speed and never the right bar.
// A tempo the control cannot hold makes that plain: the wire reads half a bpm
// and the control steps in whole ones, so a room at 128.5 is followed at 129
// and walks a beat away from it every couple of minutes.
test('the wire sets the tempo to the nearest bpm the control holds', () => {
  midi.setClockLock(true)
  for (let i = 0; i < 30; i++) {
    vi.spyOn(performance, 'now').mockReturnValue(i * (60000 / (128.5 * 24)))
    send(0xf8)
  }
  expect(midi.bpm.get()).toBe(128.5)
  expect(engine.controls.get().drumBpm).toBe(129)
  vi.restoreAllMocks()
})

// The board's own side of the wire. Everything below leaves the app rather than
// arriving at it, so the fake output's `sent` is the whole assertion surface.

/** A step the kit has clocked, as the meter reports one. */
const step = (tick: number) => engine.meter.set({ ...engine.meter.get(), tick })

const pulses = (n: number) => Array.from({ length: n }, () => [0xf8])

// Six pulses a step, because a step is a sixteenth and MIDI counts 24 to the
// quarter — and counted off the step the kit reports, so a meter that arrives
// with no new step on it sends nothing at all.
test('the clock out is six pulses for every step the kit clocks', () => {
  midi.setClockOut(true)
  engine.setDrumsPlaying(true)
  sent.length = 0

  step(1)
  expect(sent).toEqual(pulses(6))

  // Meters land about every 16 ms and a sixteenth is far longer, so most of
  // them carry the step that already went out.
  sent.length = 0
  step(1)
  expect(sent).toEqual([])

  // A meter that landed late carries two steps, and both get paid for: what
  // matters downstream is the running count, not when it arrived.
  step(3)
  expect(sent).toEqual(pulses(12))
})

test('start and stop ride the kit’s run switch', () => {
  midi.setClockOut(true)
  sent.length = 0

  engine.setDrumsPlaying(true)
  expect(sent).toEqual([[0xfa]])

  sent.length = 0
  engine.setDrumsPlaying(false)
  expect(sent).toEqual([[0xfc]])

  // A stopped kit whose counter is still moving — a step written by hand, a
  // pattern edited — is not a clock anybody asked for.
  sent.length = 0
  step(9)
  expect(sent).toEqual([])
})

// Switching the clock off halfway through a bar leaves the far end waiting on
// pulses that stop coming, which reads as a hang rather than as a stop.
test('switching the clock off sends the stop that ends it', () => {
  midi.setClockOut(true)
  engine.setDrumsPlaying(true)
  sent.length = 0
  midi.setClockOut(false)
  expect(sent).toEqual([[0xfc]])
})

test('the clock stays off the wire until it is switched on', () => {
  engine.setDrumsPlaying(true)
  step(1)
  step(2)
  engine.setDrumsPlaying(false)
  expect(sent).toEqual([])
})

// The chip counts semitones from A3 = 220 Hz, which is MIDI 57. Send its own
// numbers straight out and the whole board leaves a minor third out.
test('notes going out are counted from A3, not from MIDI zero', () => {
  midi.setNoteOut(true)
  engine.chipNotes.set(new Set([0]))
  expect(sent).toEqual([[0x90, 57, 100]])

  sent.length = 0
  engine.chipNotes.set(new Set([0, 3]))
  expect(sent).toEqual([[0x90, 60, 100]])
})

test('the toy goes out on channel 1 and the FM chip on channel 2', () => {
  midi.setNoteOut(true)
  engine.chipNotes.set(new Set([3]))
  engine.fmNotes.set(new Set([3]))
  expect(sent).toEqual([
    [0x90, 60, 100],
    [0x91, 60, 100],
  ])
})

test('a note the chip stops sounding is let go of', () => {
  midi.setNoteOut(true)
  engine.chipNotes.set(new Set([3, 5]))
  sent.length = 0

  // One goes, one stays: only the one that went gets a note off, and the one
  // that stayed is not struck again.
  engine.chipNotes.set(new Set([5]))
  expect(sent).toEqual([[0x80, 60, 0]])

  sent.length = 0
  engine.chipNotes.set(new Set())
  expect(sent).toEqual([[0x80, 62, 0]])
})

// A note on nothing ever ends sounds until the far end is power-cycled, and the
// switch going off is the last chance to end it.
test('switching the notes off lets go of what is still out there', () => {
  midi.setNoteOut(true)
  engine.chipNotes.set(new Set([3]))
  engine.fmNotes.set(new Set([5]))
  sent.length = 0

  midi.setNoteOut(false)
  expect(sent).toEqual([
    [0x80, 60, 0],
    [0x81, 62, 0],
  ])
})

test('the chips stay off the wire until the notes are switched on', () => {
  engine.chipNotes.set(new Set([3]))
  engine.fmNotes.set(new Set([5]))
  engine.chipNotes.set(new Set())
  expect(sent).toEqual([])
})
