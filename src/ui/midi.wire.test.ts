// The wire end to end: real MIDI bytes into the manager, and the board coming
// out the other side. Everything above this file's fake access object is the
// shipping code path — binding, soft takeover, the undo walk and the keyboard.

import { beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_CONTROLS } from '../controls'
import { engine } from '../engine/engine'
import { sliderFor } from './controls'
import { ACCENT_GAIN, hasStep } from '../drums'
import { ccToValue, midi, padGain, velocity } from './midi'

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

// The other half of tap in: what a pad plays lands on the grid, so a pattern can
// be played rather than drawn.
test('an armed pad writes the step it lands on', () => {
  engine.setDrumsPlaying(true)
  engine.patch({ drumKick: 0, drumSwing: 0 })
  engine.meter.set({ ...engine.meter.get(), tick: 6 })
  engine.tapRecord.set(true)
  send(0x99, 36, 100)
  expect(hasStep(engine.controls.get().drumKick, 6)).toBe(true)
  engine.tapRecord.set(false)
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
