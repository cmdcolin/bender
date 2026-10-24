import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { DEFAULT_CONTROLS, type Controls } from '../controls.ts'
import { hasStep, quantizeStep, STEPS } from '../drums.ts'
import { YOURS } from '../dsp/stages/roms.ts'
import { SCALE_NAMES } from '../scale.ts'
import { HOLD, REST, TUNE_STEP_KEYS } from '../tune.ts'
import {
  edgeScore,
  Engine,
  mergeNotes,
  soundingMask,
  tailScore,
} from './engine.ts'
import { IDX, MAX_SOURCES, STEM_FILES } from './params.ts'

import type { RecMsg } from './messages.ts'

// Animation frames never fire here, so morphs and param posts move only on the
// engine's timer fallback, and a synchronous test sees a morph still in flight.
beforeEach(() => {
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
})

const board = (patch: Partial<Controls>): Controls => ({
  ...DEFAULT_CONTROLS,
  ...patch,
})

test('a whole-board verb banks the board it replaced', () => {
  const engine = new Engine()
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  expect(engine.history.get().past).toHaveLength(1)

  engine.undo(0)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
  expect(engine.history.get().past).toHaveLength(0)

  engine.redo(0)
  expect(engine.controls.get().dlyFb).toBe(0.5)
})

test('a sweep banks one step, not one per pointer move', () => {
  const engine = new Engine()
  engine.armStep()
  for (const v of [0.1, 0.2, 0.3, 0.4]) engine.set('dlyFb', v)
  expect(engine.history.get().past).toHaveLength(1)

  engine.undo(0)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
})

test('arming and then moving nothing leaves no dead step to press undo through', () => {
  const engine = new Engine()
  engine.armStep()
  engine.set('dlyFb', DEFAULT_CONTROLS.dlyFb)
  expect(engine.history.get().past).toHaveLength(0)
})

test('a write nobody armed banks nothing — the walk is over gestures', () => {
  const engine = new Engine()
  engine.set('dlyFb', 0.5)
  expect(engine.history.get().past).toHaveLength(0)
})

// A tween is a frame, not a board: banking one would make the board you were
// stepping out of unreachable, since redo would land somewhere along the path.
test('mid-morph the walk banks where the board was heading, not the frame', () => {
  const engine = new Engine()
  engine.morphTo(board({ dlyFb: 1 }), 8)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)

  engine.morphTo(board({ dlyFb: 0.25 }), 0)
  expect(engine.history.get().past.at(-1)?.dlyFb).toBe(1)
})

test('a fresh roll after undo ends the walk forward', () => {
  const engine = new Engine()
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  engine.undo(0)
  expect(engine.history.get().future).toHaveLength(1)

  engine.morphTo(board({ dlyFb: 0.75 }), 0)
  expect(engine.history.get().future).toHaveLength(0)
})

test('undo at the end of the walk does nothing rather than throwing', () => {
  const engine = new Engine()
  engine.undo(0)
  engine.redo(0)
  expect(engine.controls.get()).toEqual(DEFAULT_CONTROLS)
})

// Panic kills a runaway howl. Undoing back into one would make the walk the
// thing you have to panic out of.
test('panic is not a step in the walk', () => {
  const engine = new Engine()
  engine.patch({ fbAmt: 1.5 })
  engine.panic()
  expect(engine.history.get().past).toHaveLength(0)
})

// ── the hunt ─────────────────────────────────────────────────────────────────

test('the edge score picks intermittent limiting over none and over pinned', () => {
  const flat = Array.from({ length: 20 }, () => 0)
  const pinned = Array.from({ length: 20 }, () => 0.6)
  const surging = Array.from({ length: 20 }, (_, i) => (i % 4 < 2 ? 0 : 0.6))
  const loud = Array.from({ length: 20 }, () => 0.8)
  // Nowhere near the edge, and already past it, both lose to the board that
  // keeps arriving at the ceiling and backing off.
  expect(edgeScore(surging, loud)).toBeGreaterThan(edgeScore(pinned, loud))
  expect(edgeScore(surging, loud)).toBeGreaterThan(edgeScore(flat, loud))
  // Between two boards that never reach the limiter, the audible one wins.
  expect(edgeScore(flat, loud)).toBeGreaterThan(
    edgeScore(
      flat,
      Array.from({ length: 20 }, () => 0),
    ),
  )
  expect(edgeScore([], [])).toBe(0)
})

test('a hunt banks one step, keeps a winner, and gives way to a hand', async () => {
  const engine = new Engine()
  const boards = [board({ dlyFb: 0.4 }), board({ dlyFb: 0.9 })]
  const hunt = engine.hunt(boards, 20)
  expect(engine.hunting.get()).toBe(true)
  const landed = await hunt
  expect(engine.hunting.get()).toBe(false)
  // The boards it tried on the way are not boards you chose: one entry for the
  // whole gesture, and it is the board you were on before it started.
  expect(engine.history.get().past).toHaveLength(1)
  expect(boards).toContain(landed)
  expect(engine.controls.get().dlyFb).toBe(landed!.dlyFb)
})

// The dialog counts the candidates off, so the count has to be there to read
// while a board is playing and gone once the hunt is over either way.
test('a hunt says which candidate it is on, and stops saying when it ends', async () => {
  const engine = new Engine()
  const seen: string[] = []
  engine.huntStep.subscribe(() => {
    const step = engine.huntStep.get()
    seen.push(step ? `${step.board}/${step.of}` : 'none')
  })
  await engine.hunt([board({ dlyFb: 0.4 }), board({ dlyFb: 0.9 })], 20)
  expect(seen).toEqual(['1/2', '2/2', 'none'])

  const stopped = engine.hunt([board({ dlyFb: 0.5 })], 40)
  expect(engine.huntStep.get()).toEqual({ board: 1, of: 1 })
  engine.stopHunt()
  expect(engine.huntStep.get()).toBe(null)
  await stopped
})

test('anything you touch calls a hunt off and keeps what is playing', async () => {
  const engine = new Engine()
  const hunt = engine.hunt([board({ dlyFb: 0.4 }), board({ dlyFb: 0.9 })], 40)
  engine.set('revMix', 0.5)
  expect(engine.hunting.get()).toBe(false)
  expect(await hunt).toBe(null)
  expect(engine.controls.get().revMix).toBe(0.5)
})

test('drift walks the board along on its own, and banks none of it', () => {
  const engine = new Engine()
  const boards = [board({ dlyFb: 0.4 }), board({ dlyFb: 0.9 })]
  let leg = 0
  // The morph is stubbed out to nothing, so each leg lands when it is asked for
  // at cut — what matters here is that the timer keeps asking and the walk stays
  // empty. Every leg is a fresh target the way mutate hands one over.
  engine.startDrift(() => boards[Math.min(leg++, 1)]!, 0)
  expect(engine.drifting.get()).toBe(true)
  expect(leg).toBe(1)

  engine.stopDrift()
  expect(engine.drifting.get()).toBe(false)
  expect(engine.history.get().past).toHaveLength(0)

  // And the board you set drifting is still the one step back, because the only
  // entry in the walk is the one your own gesture put there.
  engine.armStep()
  engine.set('dlyFb', 0.2)
  expect(engine.history.get().past).toHaveLength(1)
})

// The panel's keyboard draws itself from this, so what it holds is what lights.
test('the notes that are down are the notes that were struck and not let go', () => {
  const engine = new Engine()
  engine.noteOn(3)
  engine.noteOn(7)
  expect([...engine.keysDown.get()]).toEqual([3, 7])

  engine.noteOff(3)
  expect([...engine.keysDown.get()]).toEqual([7])

  // Panic silences the chip, so nothing is left lit over a voice that is gone.
  engine.panic()
  expect(engine.keysDown.get().size).toBe(0)
})

// The key that lights has to be the key that sounds, so the lock is taken here
// rather than on the wire — and taken on the release too, or the key you played
// is one nothing ever lets go of.
test('the key lock lights the key it snapped to, not the one you pressed', () => {
  const engine = new Engine()
  engine.set('keyScale', SCALE_NAMES.indexOf('major'))
  engine.set('keyRoot', 0)
  engine.noteOn(4)
  expect([...engine.keysDown.get()]).toEqual([3])
  engine.noteOff(4)
  expect(engine.keysDown.get().size).toBe(0)
})

test('a key lets go of the note it struck after the scale moves under it', () => {
  const engine = new Engine()
  const posted = wire(engine) as unknown as {
    kind: string
    semitone?: number
  }[]
  engine.set('keyScale', SCALE_NAMES.indexOf('major'))
  engine.set('keyRoot', 0)
  engine.noteOn(4, 1, 'fm')
  expect(engine.isStruck(4, 'fm')).toBe(true)
  engine.set('keyScale', SCALE_NAMES.indexOf('off'))
  engine.noteOff(4, 'fm')
  expect(posted.filter(m => m.kind === 'noteOff').map(m => m.semitone)).toEqual(
    [3],
  )
  expect(engine.fmKeysDown.get().size).toBe(0)
  expect(engine.isStruck(4, 'fm')).toBe(false)
})

test('striking a note already down is not news', () => {
  const engine = new Engine()
  engine.noteOn(3)
  const before = engine.keysDown.get()
  engine.noteOn(3)
  engine.noteOff(9)
  expect(engine.keysDown.get()).toBe(before)
})

// The chip's report arrives every 16 ms whether or not it has anything new to
// say, and the keyboard renders off it.
test('an unchanged note report hands back the set it was given', () => {
  const now = new Set([3, 7])
  expect(mergeNotes(now, Int16Array.from([7, 3]))).toBe(now)
  expect(mergeNotes(now, Int16Array.from([3, 7, 7]))).toBe(now)
  expect(mergeNotes(new Set(), new Int16Array(0))).toEqual(new Set())

  expect(mergeNotes(now, Int16Array.from([3]))).toEqual(new Set([3]))
  expect(mergeNotes(now, Int16Array.from([3, 7, 10]))).toEqual(
    new Set([3, 7, 10]),
  )
  expect(mergeNotes(now, new Int16Array(0))).toEqual(new Set())
})

// What the map lights its sources off. A fader says how far it is up and a run
// switch says a sequencer is walking; neither says whether anything is coming
// out, which is the question — the FM chip has no switch at all, and a fader at
// zero is silence whatever is behind it.
test('a source is sounding when the bus says so, not when a switch does', () => {
  const hold = new Float32Array(3)
  expect(soundingMask(Float32Array.from([0, 0, 0]), hold)).toBe(0)
  expect(soundingMask(Float32Array.from([0.4, 0, 0.2]), hold)).toBe(0b101)
  // A kick is one post at full and then nothing, so the needle falls rather
  // than dropping — a kit playing a pattern reads as sounding between its hits.
  expect(soundingMask(new Float32Array(3), hold)).toBe(0b101)
  for (let i = 0; i < 60; i++) soundingMask(new Float32Array(3), hold)
  expect(soundingMask(new Float32Array(3), hold)).toBe(0)
})

// The worklet hands over its own buffer rather than a slice of it, so what sits
// past the count is whatever the last report left there. Reading it would light
// keys that stopped sounding and never let them go dark.
test('the note report reads only as far as its count', () => {
  const buffer = Int16Array.from([3, 7, 12, 12, 12])
  expect(mergeNotes(new Set(), buffer, 2)).toEqual(new Set([3, 7]))
  expect(mergeNotes(new Set([3, 7]), buffer, 2)).toEqual(new Set([3, 7]))
  expect(mergeNotes(new Set([3, 7]), buffer, 0)).toEqual(new Set())
})

// Playing a pattern in rather than drawing it. The kit's step counter arrives
// with the meter, so a hit lands on whatever step the meter last reported —
// which is what these drive by hand.
const atStep = (engine: Engine, tick: number) =>
  engine.meter.set({ ...engine.meter.get(), tick })

test('a hit played in writes the step the kit is standing on', () => {
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.patch({ drumKick: 0, drumSwing: 0 })
  atStep(engine, 4)

  // Not armed: a hit is a sound and nothing else.
  engine.drumHit(1)
  expect(engine.controls.get().drumKick).toBe(0)

  engine.drumRecord.set(true)
  engine.drumHit(1)
  expect(hasStep(engine.controls.get().drumKick, 4)).toBe(true)
})

test('a hit played in with the kit stopped is only a sound', () => {
  const engine = new Engine()
  engine.drumRecord.set(true)
  engine.patch({ drumKick: 0 })
  atStep(engine, 4)
  engine.drumHit(1)
  expect(engine.controls.get().drumKick).toBe(0)
})

// Each row carries its own length, so a five-step hat is somewhere else in the
// bar than a sixteen-step kick — and a hit that landed on both has to go to
// each row's own column.
test('a hit lands on the column each row is on', () => {
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.drumRecord.set(true)
  engine.patch({ drumKick: 0, drumHat: 0, drumHatLen: 5, drumSwing: 0 })
  atStep(engine, 7)
  engine.drumHit(1 | (1 << 2))
  expect(hasStep(engine.controls.get().drumKick, 7)).toBe(true)
  expect(hasStep(engine.controls.get().drumHat, 2)).toBe(true)
})

// One entry in the walk per hit: a hand that has just played the wrong pad
// wants that hit back and nothing else — including when one hit named two
// voices.
test('a hit played in is one step in the walk', () => {
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.drumRecord.set(true)
  engine.patch({ drumKick: 0, drumSnare: 0, drumSwing: 0 })
  atStep(engine, 3)
  const before = engine.history.get().past.length
  engine.drumHit(1 | 2)
  expect(engine.history.get().past.length).toBe(before + 1)
  engine.undo(0)
  expect(engine.controls.get().drumKick).toBe(0)
  expect(engine.controls.get().drumSnare).toBe(0)
})

test('a hit lands on the nearer step, and never off the row', () => {
  expect(quantizeStep(4, 0.1, STEPS)).toBe(4)
  expect(quantizeStep(4, 0.9, STEPS)).toBe(5)
  // Round up off the end of a row and it comes round, rather than landing on a
  // bit the mask does not have.
  expect(quantizeStep(15, 0.9, STEPS)).toBe(0)
  expect(quantizeStep(4, 0.6, 5)).toBe(0)
  // Before the kit has clocked at all there is no step to be on.
  expect(quantizeStep(-1, 0.1, STEPS)).toBe(STEPS - 1)
})

// A hit landing on a step that is already written changes nothing, so it must
// leave nothing armed either: an arm that no write ever commits sits there and
// swallows the next gesture's board, banking one from before whatever happened
// in between.
// The clock a hit is quantized against is the last step the meter reported and
// how long ago that was. When the report is older than a whole step there is no
// "how far through" to read — the meter stopped, the tab went to the background,
// or nothing has clocked at all yet — and rounding that up put every hit one
// step to the right of the playhead you were aiming at.
test('a hit lands on the reported step when the clock has gone stale', () => {
  const now = vi.spyOn(performance, 'now')
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.drumRecord.set(true)
  engine.patch({ drumKick: 0, drumSnare: 0, drumSwing: 0, drumBpm: 120 })

  // A step at 120 bpm is 125 ms. This report is five seconds old.
  now.mockReturnValue(1000)
  atStep(engine, 4)
  now.mockReturnValue(6000)
  engine.drumHit(1)
  expect(hasStep(engine.controls.get().drumKick, 4)).toBe(true)
  expect(hasStep(engine.controls.get().drumKick, 5)).toBe(false)

  // Past the middle of a step that is genuinely running, it still rounds up to
  // the next one — which is the whole point of reading the phase at all.
  now.mockReturnValue(10000)
  atStep(engine, 8)
  now.mockReturnValue(10000 + 80)
  engine.drumHit(2)
  expect(hasStep(engine.controls.get().drumSnare, 9)).toBe(true)
})

// The kit's own report of how long a step lasts wins over the tempo knob: a
// sagging rail stretches every step, and the knob knows nothing of it.
test('a hit is placed by the step length the kit reports', () => {
  const now = vi.spyOn(performance, 'now')
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.drumRecord.set(true)
  engine.patch({ drumKick: 0, drumSwing: 0, drumBpm: 120 })
  now.mockReturnValue(1000)
  engine.meter.set({
    ...engine.meter.get(),
    tick: 8,
    drumClock: 0,
    drumStepMs: 300,
  })
  now.mockReturnValue(1100)
  engine.drumHit(1)
  expect(hasStep(engine.controls.get().drumKick, 8)).toBe(true)
  expect(engine.drumTaken.get()).toMatchObject({ bits: 1, tick: 8 })
})

test('arming record runs the machine it records into', () => {
  const engine = new Engine()
  engine.armDrumRecord(true)
  expect(engine.drumsPlaying.get()).toBe(true)
  expect(engine.songPlaying.get()).toBe(false)
  engine.armDrumRecord(false)
  expect(engine.drumsPlaying.get()).toBe(true)

  engine.armTuneRecord(true)
  expect(engine.songPlaying.get()).toBe(true)
})

test('a hit that writes nothing arms nothing', () => {
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.drumRecord.set(true)
  engine.patch({ drumKick: 0, drumSwing: 0 })
  atStep(engine, 4)
  engine.drumHit(1)
  const banked = engine.history.get().past.length
  engine.drumHit(1)
  expect(engine.history.get().past.length).toBe(banked)

  // A board moved by something that does not bank, then a gesture that does.
  engine.patch({ dlyFb: 0.9 })
  engine.armStep()
  engine.set('revMix', 0.3)
  engine.undo(0)
  expect(engine.controls.get().dlyFb).toBe(0.9)
})

// The melody memory: the same gesture on the other machine. Where the chip's
// own counter is standing arrives with the meter — the tune runs on the chip's
// clock and every bend that drags it is already in there — so these drive it by
// hand the way the kit's tests drive the step counter.
const atTuneStep = (engine: Engine, tunePos: number, tuneFrac = 0) =>
  engine.meter.set({ ...engine.meter.get(), tunePos, tuneFrac })

test('a note played in writes the step the chip is standing on', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  atTuneStep(engine, 4)

  // Not armed: a note is a sound and nothing else.
  engine.noteOn(7)
  engine.noteOff(7)
  expect(engine.controls.get().tuneStep4).toBe(REST)

  engine.tuneRecord.set(true)
  engine.noteOn(7)
  expect(engine.controls.get().tuneStep4).toBe(7)

  // Past the middle of a step and it belongs to the next one, the same as a
  // hit on the kit does.
  atTuneStep(engine, 8, 0.7)
  engine.noteOn(9)
  expect(engine.controls.get().tuneStep9).toBe(9)
})

test('a note played in with the tune stopped is only a sound', () => {
  const engine = new Engine()
  engine.tuneRecord.set(true)
  atTuneStep(engine, 4)
  engine.noteOn(7)
  expect(engine.controls.get().tuneStep4).toBe(REST)
})

// A key held across steps is one long note, which the memory spells as the step
// it struck on followed by holds — and the whole note is one entry in the walk,
// head and tail, so undo takes back the note rather than half of it.
test('a key held across steps comes out as one long note', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.tuneRecord.set(true)
  const before = engine.history.get().past.length

  atTuneStep(engine, 2)
  engine.noteOn(5)
  atTuneStep(engine, 5)
  engine.noteOff(5)

  expect(engine.controls.get().tuneStep2).toBe(5)
  expect(engine.controls.get().tuneStep3).toBe(HOLD)
  expect(engine.controls.get().tuneStep4).toBe(HOLD)
  // The step it was let go on is where the note ended, not part of it.
  expect(engine.controls.get().tuneStep5).toBe(REST)
  expect(engine.history.get().past.length).toBe(before + 1)

  engine.undo(0)
  expect(engine.controls.get().tuneStep2).toBe(REST)
  expect(engine.controls.get().tuneStep3).toBe(REST)
})

// A tap is a note on one step. The counter says where the memory is standing and
// not how many times it has been round, so letting go on the step you struck on
// reads the same as holding one for exactly a bar — and filling every step with
// holds off a tap is the wrong half of that to guess.
test('a note struck and let go inside one step is one step long', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.tuneRecord.set(true)
  atTuneStep(engine, 6)
  engine.noteOn(4)
  engine.noteOff(4)

  expect(engine.controls.get().tuneStep6).toBe(4)
  for (const key of TUNE_STEP_KEYS)
    if (key !== 'tuneStep6') expect(engine.controls.get()[key]).toBe(REST)
})

// A note somebody else played is not this note's to lengthen: the run of holds
// stops at the first step already carrying something.
test('holds stop at a step that is already written', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.tuneRecord.set(true)
  engine.patch({ tuneStep4: 12 })

  atTuneStep(engine, 2)
  engine.noteOn(5)
  atTuneStep(engine, 6)
  engine.noteOff(5)

  expect(engine.controls.get().tuneStep3).toBe(HOLD)
  expect(engine.controls.get().tuneStep4).toBe(12)
  expect(engine.controls.get().tuneStep5).toBe(REST)
})

// Recording into a memory the chip is not playing is the one state where every
// light says it is working and nothing you play comes back.
test('arming the memory puts the chip on it, and undo puts the song back', () => {
  const engine = new Engine()
  expect(engine.controls.get().chipTune).toBe(DEFAULT_CONTROLS.chipTune)

  engine.armTuneRecord(true)
  expect(engine.tuneRecord.get()).toBe(true)
  expect(engine.controls.get().chipTune).toBe(YOURS)

  engine.undo(0)
  expect(engine.controls.get().chipTune).toBe(DEFAULT_CONTROLS.chipTune)
})

// The octave switch reaches past what six wires can file, and a note it cannot
// hold is filed as the same note an octave nearer rather than as nothing.
test('a note past the memory’s reach is filed an octave nearer', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.tuneRecord.set(true)
  atTuneStep(engine, 0)
  engine.noteOn(51)
  const step = engine.controls.get().tuneStep0
  expect(step).toBeLessThan(51)
  expect((51 - step) % 12).toBe(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// A hand plays chords and the memory keeps three notes a step, so a chord you
// play in arrives as a chord: one note a lane, and each of them holds out to
// its own length when that finger comes up.
test('a chord played in fills the lanes, a note each', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.tuneRecord.set(true)
  atTuneStep(engine, 0)
  engine.noteOn(0)
  engine.noteOn(4)
  engine.noteOn(7)

  const c = engine.controls.get()
  expect([c.tuneStep0, c.tuneStackA0, c.tuneStackB0]).toEqual([0, 4, 7])

  // The third finger comes up two steps later, and the holds land in its own
  // lane rather than over the notes beside it.
  atTuneStep(engine, 2)
  engine.noteOff(7)
  const held = engine.controls.get()
  expect([held.tuneStackB1, held.tuneStackA1, held.tuneStep1]).toEqual([
    HOLD,
    REST,
    REST,
  ])
})

// Mono is the memory the toy shipped with, and a chord played into one word a
// step is the last key down.
test('with the memory in mono a chord played in is one note', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.tuneRecord.set(true)
  engine.set('tunePoly', 0)
  atTuneStep(engine, 0)
  engine.noteOn(0)
  engine.noteOn(4)

  const c = engine.controls.get()
  expect(c.tuneStep0).toBe(4)
  expect(c.tuneStackA0).toBe(REST)
})

// A tab puts back what it was running when a board lands in it, so the run
// lines can be up with nothing audible behind them — and the toggle reads that
// as a board to stop. A button that says start has to start.
test('the start line starts, where the toggle would have stopped', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)

  engine.runAll()
  expect(engine.songPlaying.get()).toBe(true)
  expect(engine.drumsPlaying.get()).toBe(true)
})

test('a held throw reaches the worklet and leaves the board alone', () => {
  const engine = new Engine()
  const posted: Float32Array[] = []
  Object.assign(engine, {
    node: {
      port: {
        postMessage: (m: { kind: string; pack?: Float32Array }) => {
          if (m.kind === 'params') posted.push(Float32Array.from(m.pack!))
        },
      },
    },
  })
  engine.holdThrow('spin', { dlyFb: 1.25 })
  engine.flush()
  expect(posted.at(-1)![IDX.dlyFb]).toBeCloseTo(1.25)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
  expect(engine.history.get().past).toHaveLength(0)
  engine.letGoThrow('spin')
  engine.flush()
  expect(posted.at(-1)![IDX.dlyFb]).toBeCloseTo(DEFAULT_CONTROLS.dlyFb)
})

test('drift back lands on where the drift was, and banks one step', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    const engine = new Engine()
    engine.startDrift(() => board({ dlyFb: 0.4 }), 1)
    engine.patch({ dlyFb: 0.1 })
    vi.advanceTimersByTime(2600)
    engine.patch({ dlyFb: 0.7 })
    vi.advanceTimersByTime(2600)
    engine.patch({ dlyFb: 0.9 })
    engine.driftBack(5, 0)
    expect(engine.drifting.get()).toBe(false)
    expect(engine.controls.get().dlyFb).toBe(0.1)
    expect(engine.history.get().past).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})

test('the tail score picks what rings between the hits over a dry kit and a pinned one', () => {
  const hits = Array.from({ length: 24 }, (_, i) => (i % 6 === 0 ? 1 : 0))
  const quiet = Array.from({ length: 24 }, () => 0)
  const dry = hits.map(h => (h ? 0.8 : 0.02))
  const ringing = hits.map(h => (h ? 0.8 : 0.5))
  const pinned = Array.from({ length: 24 }, () => 0.9)
  expect(tailScore(quiet, ringing, hits)).toBeGreaterThan(
    tailScore(quiet, dry, hits),
  )
  expect(tailScore(quiet, ringing, hits)).toBeGreaterThan(
    tailScore(pinned, pinned, hits),
  )
})

test('a hunt keeps every candidate it heard, to pick another from', async () => {
  const engine = new Engine()
  const boards = [board({ dlyFb: 0.4 }), board({ dlyFb: 0.9 })]
  await engine.hunt(boards, 20)
  expect(engine.hunted.get()).toHaveLength(2)
  engine.pickHunted(1)
  expect(engine.controls.get()).toEqual(engine.hunted.get()[1])
  expect(engine.history.get().past).toHaveLength(1)
})

const N = 64

const recorder = (stems: boolean) => {
  const engine = new Engine()
  const files: File[] = []
  Object.assign(engine, { node: { port: { postMessage: () => {} } } })
  engine.takeTo = file => files.push(file)
  engine.recStems.set(stems)
  engine.startRecording()
  const chunk = (msg: Omit<RecMsg, 'kind'>) =>
    (engine as unknown as { onRecChunk(m: RecMsg): void }).onRecChunk({
      kind: 'rec',
      ...msg,
    })
  return { files, chunk, engine }
}

const STAMP = /^bender-\d{8}-\d{6}/
const suffixes = (files: File[]) => files.map(f => f.name.replace(STAMP, ''))

test('a stem take saves the master and a file for each source that made a sound', async () => {
  const { files, chunk } = recorder(true)
  const l = new Float32Array(N)
  const slabs = Array.from({ length: MAX_SOURCES }, () => new Float32Array(N))
  const at = (name: (typeof STEM_FILES)[number]) =>
    slabs[STEM_FILES.indexOf(name)]!

  at('drums').fill(0.5)
  at('noise').fill(1e-5)
  chunk({ l, r: l, n: N, done: false, stems: slabs })

  // The worklet writes the next slab over the same buffers.
  at('drums').fill(0)
  at('fm')[N - 1] = 0.25
  chunk({ l, r: l, n: N, done: true, stems: slabs })

  await vi.waitFor(() => expect(files).toHaveLength(3))
  expect(suffixes(files)).toEqual(['-master.wav', '-drums.wav', '-fm.wav'])
  expect(new Set(files.map(f => f.name.match(STAMP)![0])).size).toBe(1)
  const [master, drums, fm] = files
  expect(master!.size).toBe(44 + 2 * N * 4)
  expect(fm!.size).toBe(44 + 2 * N * 2)
  const pcm = new DataView(await drums!.arrayBuffer())
  expect(pcm.getInt16(44, true)).toBeGreaterThan(16000)
  expect(pcm.getInt16(44 + N * 2, true)).toBe(0)
})

test('a master-only take saves one file under the bare stamp', async () => {
  const { files, chunk } = recorder(false)
  const l = new Float32Array(N).fill(0.5)
  chunk({ l, r: l, n: N, done: true })
  await vi.waitFor(() => expect(files).toHaveLength(1))
  expect(suffixes(files)).toEqual(['.wav'])
})

const roomy = (room: number) => {
  const { files, chunk, engine } = recorder(false)
  const rec = (engine as unknown as { rec: Record<string, unknown> }).rec
  Object.assign(rec, {
    take: {
      room: () => room,
      limit: () => 'storage',
      failure: () => '',
      end: () => {},
    },
  })
  return { files, chunk, engine }
}

const MINUTE = 4 * 48000 * 60

test('a take warns when ten minutes of room are left, and keeps going', () => {
  const { chunk, engine } = roomy(3 * MINUTE)
  const l = new Float32Array(N)
  chunk({ l, r: l, n: N, done: false })
  expect(engine.recNote.get()).toBe('about 3 min of browser storage left')
  expect(engine.recording.get()).toBe(true)
})

test('a take with room to spare says nothing', () => {
  const { chunk, engine } = roomy(60 * MINUTE)
  const l = new Float32Array(N)
  chunk({ l, r: l, n: N, done: false })
  expect(engine.recNote.get()).toBe('')
})

test('a take that runs out of room stops, saves what it has and says why', async () => {
  const { files, chunk, engine } = roomy(0)
  const l = new Float32Array(N).fill(0.5)
  chunk({ l, r: l, n: N, done: false })
  expect(engine.recording.get()).toBe(false)
  chunk({ l, r: l, n: 0, done: true })
  await vi.waitFor(() => expect(files).toHaveLength(1))
  expect(engine.recNote.get()).toBe('stopped early: out of browser storage')
  expect(engine.recError.get()).toBe('')
})

test('a new take waits for the last one to finish saving', async () => {
  const { files, chunk, engine } = recorder(false)
  const l = new Float32Array(N).fill(0.5)
  chunk({ l, r: l, n: N, done: false })
  engine.stopRecording()
  engine.startRecording()
  expect(engine.recording.get()).toBe(false)

  chunk({ l, r: l, n: 0, done: true })
  await vi.waitFor(() => expect(files).toHaveLength(1))
  engine.startRecording()
  expect(engine.recording.get()).toBe(true)
})

const wire = (engine: Engine) => {
  const posted: { kind: string; pack?: Float32Array }[] = []
  Object.assign(engine, {
    node: {
      port: {
        postMessage: (m: { kind: string; pack?: Float32Array }) =>
          posted.push(m.pack ? { ...m, pack: Float32Array.from(m.pack) } : m),
      },
    },
  })
  return posted
}

test('a hidden tab, with no animation frames, still reaches the worklet', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  try {
    const engine = new Engine()
    const posted = wire(engine)
    engine.set('dlyFb', 0.5)
    vi.advanceTimersByTime(100)
    expect(posted.at(-1)?.pack?.[IDX.dlyFb]).toBeCloseTo(0.5)

    engine.morphTo(board({ dlyFb: 0.9 }), 1)
    vi.advanceTimersByTime(1500)
    expect(engine.controls.get().dlyFb).toBe(0.9)
    expect(engine.morphProgress.get()).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

test('a boot that fails closes its context and lets the next start retry', async () => {
  const closed: number[] = []
  let built = 0
  vi.stubGlobal(
    'AudioContext',
    class {
      readonly id = ++built
      audioWorklet = {
        addModule: () => Promise.reject(new Error('no worklet')),
      }
      close() {
        closed.push(this.id)
        return Promise.resolve()
      }
    },
  )
  try {
    const engine = new Engine()
    await expect(engine.start()).rejects.toThrow('no worklet')
    await expect(engine.start()).rejects.toThrow('no worklet')
    expect(built).toBe(2)
    expect(closed).toEqual([1, 2])
    expect(engine.fault.get()).toBe('audio did not start: no worklet')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('a double click on the mic opens it once, and a mic unplugged goes off', async () => {
  const track = Object.assign(new EventTarget(), { stop: () => {} })
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  const asked = later<typeof stream>()
  let asks = 0
  let wired = 0
  let unwired = 0
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () => {
        asks++
        return asked.promise
      },
    },
  })
  try {
    const engine = new Engine()
    Object.assign(engine, {
      node: {},
      ctx: {
        createMediaStreamSource: () => ({
          connect: () => wired++,
          disconnect: () => unwired++,
        }),
      },
    })
    const first = engine.enableMic()
    const second = engine.enableMic()
    asked.resolve(stream)
    await Promise.all([first, second])
    expect(asks).toBe(1)
    expect(wired).toBe(1)
    expect(engine.micOn.get()).toBe(true)

    track.dispatchEvent(new Event('ended'))
    expect(unwired).toBe(1)
    expect(engine.micOn.get()).toBe(false)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('turning the mic off stops its tracks and lets it open again', async () => {
  let stopped = 0
  const track = Object.assign(new EventTarget(), { stop: () => stopped++ })
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  let asks = 0
  let unwired = 0
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        asks++
        return stream
      },
    },
  })
  try {
    const engine = new Engine()
    Object.assign(engine, {
      node: {},
      ctx: {
        createMediaStreamSource: () => ({
          connect: () => {},
          disconnect: () => unwired++,
        }),
      },
    })
    await engine.enableMic()
    engine.disableMic()
    expect(stopped).toBe(1)
    expect(unwired).toBe(1)
    expect(engine.micOn.get()).toBe(false)

    track.dispatchEvent(new Event('ended'))
    expect(unwired).toBe(1)

    await engine.enableMic()
    expect(asks).toBe(2)
    expect(engine.micOn.get()).toBe(true)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('panic lands the tamed board before the worklet hears panic', () => {
  const engine = new Engine()
  const posted = wire(engine)
  engine.patch({ fbAmt: 1.5 })
  engine.panic()
  const at = posted.findIndex(m => m.kind === 'panic')
  expect(posted[at - 1]?.pack?.[IDX.fbAmt]).toBe(0)
})

const later = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => (resolve = r))
  return { promise, resolve }
}

const decoded = {
  length: 8,
  sampleRate: 48000,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array(8),
}

const tapeDeck = () => {
  const engine = new Engine()
  const posted = wire(engine)
  const decodes: ReturnType<typeof later<typeof decoded>>[] = []
  Object.assign(engine, {
    ctx: {
      decodeAudioData: () => {
        const d = later<typeof decoded>()
        decodes.push(d)
        return d.promise
      },
    },
  })
  type Bring = () => Promise<{
    id: string
    title: string
    data: ArrayBuffer
  } | null>
  const bringTape = (bring: Bring) =>
    (
      engine as unknown as {
        bringTape(a: string, b: string, f: Bring): Promise<void>
      }
    ).bringTape('', '', bring)
  const samples = () => posted.filter(m => m.kind === 'sample')
  return { engine, decodes, bringTape, samples }
}

const rolled = { id: 'x', title: 'rolled', data: new ArrayBuffer(8) }

test('a roll cancelled while it decodes never reaches the tape', async () => {
  const { engine, decodes, bringTape, samples } = tapeDeck()
  const done = bringTape(async () => rolled)
  await vi.waitFor(() => expect(decodes).toHaveLength(1))
  engine.cancelRoll()
  decodes[0]!.resolve(decoded)
  await done
  expect(samples()).toHaveLength(0)
  expect(engine.archiveSource.get()).toBeNull()
})

test('a dropped file calls off a roll still in the air', async () => {
  const { engine, decodes, bringTape, samples } = tapeDeck()
  const fetched = later<typeof rolled>()
  const done = bringTape(() => fetched.promise)
  const dropped = engine.loadSample(new File([new Uint8Array(8)], 'mine.wav'))
  await vi.waitFor(() => expect(decodes).toHaveLength(1))
  decodes[0]!.resolve(decoded)
  await dropped
  fetched.resolve(rolled)
  await done
  expect(samples()).toHaveLength(1)
  expect(engine.sampleName.get()).toBe('mine.wav')
  expect(engine.archiveStep.get()).toBeNull()
})

// The second melody: written from whichever bed it is aimed at, and only that
// one. Its counter arrives with the meter the way the toy's does.
const atSeqStep = (engine: Engine, monoSeqPos: number, monoSeqFrac = 0) =>
  engine.meter.set({ ...engine.meter.get(), monoSeqPos, monoSeqFrac })

test('a key on the memory’s machine writes the step its counter is on', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  atSeqStep(engine, 5)

  engine.noteOn(7, 1, 'mono')
  expect(engine.controls.get().monoSeqStep5).toBe(REST)

  engine.armSeqRecord(true, 'mono')
  engine.noteOn(7, 1, 'mono')
  expect(engine.controls.get().monoSeqStep5).toBe(7)
  expect(engine.controls.get().tuneStep5).toBe(REST)
})

test('keys on other beds play and write nothing', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  atSeqStep(engine, 5)
  engine.armSeqRecord(true, 'mono')
  engine.noteOn(7, 1, 'fm')
  engine.noteOn(7, 1, 'toy')
  expect(engine.controls.get().monoSeqStep5).toBe(REST)
})

test('arming from a bed aims the memory at it and turns it on', () => {
  const engine = new Engine()
  engine.armSeqRecord(true, 'fm')
  expect(engine.controls.get()).toMatchObject({ monoSeqTo: 1, monoSeqOn: 1 })
  expect(engine.songPlaying.get()).toBe(true)

  engine.armSeqRecord(true, 'pcm')
  expect(engine.controls.get().monoSeqTo).toBe(2)
})

test('a key held across steps writes holds under one entry', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.armSeqRecord(true, 'mono')
  atSeqStep(engine, 2)
  const before = engine.history.get().past.length
  engine.noteOn(7, 1, 'mono')
  atSeqStep(engine, 5)
  engine.noteOff(7, 'mono')
  const c = engine.controls.get()
  expect(c.monoSeqStep2).toBe(7)
  expect(c.monoSeqStep3).toBe(HOLD)
  expect(c.monoSeqStep4).toBe(HOLD)
  expect(c.monoSeqStep5).toBe(REST)
  expect(engine.history.get().past.length - before).toBe(1)
})

test('a key let go on its own step is that step and no more', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.armSeqRecord(true, 'mono')
  atSeqStep(engine, 2)
  engine.noteOn(7, 1, 'mono')
  engine.noteOff(7, 'mono')
  expect(engine.controls.get().monoSeqStep3).toBe(REST)
})

const counter = (engine: Engine, tick: number, drumClock = 0) =>
  engine.meter.set({ ...engine.meter.get(), tick, drumClock, drumStepMs: 125 })

test('with the phrase lock on, a cut waits for the downbeat', () => {
  vi.useFakeTimers()
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.phraseLock.set(1)
  counter(engine, 5)
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
  expect(engine.waiting.get()).toEqual({ tick: 16 })
  expect(engine.history.get().past).toHaveLength(0)
  counter(engine, 15, 0.8)
  vi.advanceTimersByTime(30)
  expect(engine.controls.get().dlyFb).toBe(0.5)
  expect(engine.waiting.get()).toBeNull()
  expect(engine.history.get().past).toHaveLength(1)
  vi.useRealTimers()
})

test('undo or stop calls off a change still waiting', () => {
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.phraseLock.set(4)
  counter(engine, 5)
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  engine.stopMorph()
  expect(engine.waiting.get()).toBeNull()
  counter(engine, 64)
  expect(engine.controls.get().dlyFb).toBe(DEFAULT_CONTROLS.dlyFb)
})

test('with the kit stopped, the phrase lock has nothing to wait for', () => {
  const engine = new Engine()
  engine.phraseLock.set(4)
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  expect(engine.controls.get().dlyFb).toBe(0.5)
})

test('a locked drift sets off each leg to arrive on a downbeat', () => {
  vi.useFakeTimers()
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.phraseLock.set(1)
  counter(engine, 3)
  engine.startDrift(() => board({ dlyFb: 0.5 }))
  expect(engine.waiting.get()).toEqual({ tick: 32 })
  engine.morphTo(board({ dlyFb: 0.2 }), 0)
  expect(engine.waiting.get()).toEqual({ tick: 16 })
  counter(engine, 16)
  vi.advanceTimersByTime(1)
  expect(engine.controls.get().dlyFb).toBe(0.2)
  expect(engine.waiting.get()).toEqual({ tick: 32 })
  engine.stopDrift()
  expect(engine.waiting.get()).toBeNull()
  vi.useRealTimers()
})

test('a pattern and a preset pressed in one bar land on the same downbeat', () => {
  vi.useFakeTimers()
  const engine = new Engine()
  engine.setDrumsPlaying(true)
  engine.phraseLock.set(1)
  counter(engine, 5)
  engine.morphTo(board({ dlyFb: 0.5 }), 0)
  engine.writePattern({ drumKick: 0x8888 })
  expect(engine.controls.get().drumKick).not.toBe(0x8888)
  expect(engine.waiting.get()).toEqual({ tick: 16 })
  counter(engine, 16)
  vi.advanceTimersByTime(1)
  expect(engine.controls.get().dlyFb).toBe(0.5)
  expect(engine.controls.get().drumKick).toBe(0x8888)
  expect(engine.waiting.get()).toBeNull()
  vi.useRealTimers()
})

// The demo songs are opt-in: only the toy's own play button starts one.
test('space starts the kit and leaves a demo song stopped on a fresh board', () => {
  const engine = new Engine()
  engine.toggleRun()
  expect(engine.drumsPlaying.get()).toBe(true)
  expect(engine.songPlaying.get()).toBe(false)

  const written = new Engine()
  written.set('chipTune', YOURS)
  written.toggleRun()
  expect(written.songPlaying.get()).toBe(true)
})

test('space puts back a demo song somebody started by hand', () => {
  const engine = new Engine()
  engine.setSongPlaying(true)
  engine.toggleRun()
  engine.toggleRun()
  expect(engine.songPlaying.get()).toBe(true)
})

test('recording the second melody on the kit clock runs the kit, not the song', () => {
  const engine = new Engine()
  engine.set('monoSeqSync', 1)
  engine.armSeqRecord(true, 'mono')
  expect(engine.drumsPlaying.get()).toBe(true)
  expect(engine.songPlaying.get()).toBe(false)
  expect(engine.lineRuns()).toBe(true)
})

test('a shared groove starts without the demo song, a bent song starts with it', () => {
  const groove = new Engine()
  groove.set('drumKick', 0x8888)
  groove.runLink()
  expect(groove.drumsPlaying.get()).toBe(true)
  expect(groove.songPlaying.get()).toBe(false)

  const bent = new Engine()
  bent.set('chipStarve', 0.8)
  bent.runLink()
  expect(bent.songPlaying.get()).toBe(true)
})
