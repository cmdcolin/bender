import { engine } from '../engine/engine.ts'
import { PHRASE_LOCKS, type PhraseLock } from '../engine/phraseClock.ts'
import { createStore } from '../listeners.ts'
import { read, write } from './persist.ts'

// How long a new look takes to arrive. The travelling itself is the engine's;
// this is the UI's half — the durations on offer and where the choice is kept.
//
// Off first, because a cut is a legitimate choice and the one every gesture used
// to make: a preset chip that took four seconds to land is the wrong answer to
// "what does this preset sound like". The spread is roughly geometric because
// what separates these is not a duration but a different gesture — 1s is a soft
// cut, 4s is a transition you can hear, 8s is long enough to hit random again in
// the middle of, and 30s is a sweep to leave running, where the point is not
// arriving at all but hearing what the board passes through on the way.
export const MORPH_SECONDS = [0, 1, 4, 8, 30] as const
export type MorphSeconds = (typeof MORPH_SECONDS)[number]

export const MORPH_LABELS: Record<MorphSeconds, string> = {
  0: 'cut',
  1: '1s',
  4: '4s',
  8: '8s',
  30: '30s',
}

const KEY = 'bender.morphSeconds'

// A stored duration back onto the ring. Anything unrecognised — including a
// first run, which has never stored anything — lands on 1s rather than a cut: an
// explicit cut is a choice somebody made, not the value nobody has picked yet.
export function parseMorph(raw: string | null): MorphSeconds {
  return MORPH_SECONDS.find(s => String(s) === raw) ?? 1
}

export const morphSetting = createStore<MorphSeconds>(parseMorph(read(KEY)))

export function setMorph(seconds: MorphSeconds) {
  morphSetting.set(seconds)
  write(KEY, String(seconds))
}

const LOCK_KEY = 'bender.phraseLock'

export const PHRASE_LOCK_LABELS: Record<PhraseLock, string> = {
  0: 'now',
  1: 'next bar',
  4: '4 bars',
  8: '8 bars',
  16: '16 bars',
}

export const parsePhraseLock = (raw: string | null): PhraseLock =>
  PHRASE_LOCKS.find(b => String(b) === raw) ?? 0

/** Puts back the lock the desk had last time; only the desk shows it. */
export const loadPhraseLock = () =>
  engine.phraseLock.set(parsePhraseLock(read(LOCK_KEY)))

export function setPhraseLock(bars: PhraseLock) {
  engine.phraseLock.set(bars)
  write(LOCK_KEY, String(bars))
}
