import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { hasStep, quantizeStep, STEPS } from '../drums'
import { HOLD, REST, TUNE_STEP_KEYS } from '../tune'
import { YOURS } from '../dsp/stages/roms'
import { edgeScore, Engine, mergeNotes } from './engine'

// The engine drives morphs off the frame clock and posts params on one. Stubbed
// out to nothing, so a morph asked for in seconds stays in flight for the whole
// test and one asked for at `cut` lands synchronously — which is all the walk
// cares about.
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
  const flat = new Array(20).fill(0)
  const pinned = new Array(20).fill(0.6)
  const surging = Array.from({ length: 20 }, (_, i) => (i % 4 < 2 ? 0 : 0.6))
  const loud = new Array(20).fill(0.8)
  // Nowhere near the edge, and already past it, both lose to the board that
  // keeps arriving at the ceiling and backing off.
  expect(edgeScore(surging, loud)).toBeGreaterThan(edgeScore(pinned, loud))
  expect(edgeScore(surging, loud)).toBeGreaterThan(edgeScore(flat, loud))
  // Between two boards that never reach the limiter, the audible one wins.
  expect(edgeScore(flat, loud)).toBeGreaterThan(
    edgeScore(flat, new Array(20).fill(0)),
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
