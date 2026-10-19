import { SOUND_FLOOR, engine } from '../engine/engine.ts'
import { SOURCE_TAPS, type SourceTap } from '../engine/params.ts'
import { createStore } from '../listeners.ts'
import { useBoardValue, useStoreValue } from './ControlsContext.ts'
import { levelOf, muteOf } from './stageLevels.ts'

import type { Controls } from '../controls.ts'

const TAP_OF: Record<string, SourceTap> = {
  'Toy keyboard': 'toyChip',
  'Toy drums': 'toyDrum',
  'FM chip': 'fmChip',
  'Home keyboard': 'pcmKeys',
  'Mono synth': 'monoSynth',
}

const struck = (key: keyof Controls) => (c: Controls) => Math.round(c[key]) > 0
const soldered = (key: keyof Controls) => (c: Controls) => c[key] < 0.5

// The machines that play a stage's part: the key line out of the toy keyboard,
// and the trigger patch's bridges out of either toy.
const PLAYED_ON: Record<string, [string, (c: Controls) => boolean][]> = {
  'Toy keyboard': [
    ['FM chip', soldered('fmKeyGate')],
    ['Home keyboard', soldered('pcmKeyGate')],
    ['Mono synth', soldered('monoKeyGate')],
    ['Toy drums', struck('trigToDrum')],
  ],
  'Toy drums': [
    ['Toy keyboard', struck('trigToKeys')],
    ['FM chip', struck('fmStruck')],
    ['Home keyboard', struck('pcmStruck')],
    ['Mono synth', struck('monoStruck')],
  ],
}

/** The wire a player takes a stage's part over. */
export const viaOf = (stage: string, to: string) =>
  stage === 'Toy keyboard' && to !== 'Toy drums' ? 'key line' : 'trigger patch'

const soundingOn = (stage: string, mask: number) => {
  const tap = TAP_OF[stage]
  return tap !== undefined && (mask & (1 << SOURCE_TAPS.indexOf(tap))) !== 0
}

const down = (stage: string, c: Controls) => {
  const level = levelOf(stage)
  const mute = muteOf(stage)
  return (
    (level !== undefined && c[level] <= 0) ||
    (mute !== undefined && c[mute] > 0.5)
  )
}

/** What a stage did in the last HOLD_MS: struck a note or a hit, and put sound
    on the bus while turned down. */
export interface Lately {
  struck: boolean
  loud: boolean
}

/** Where a stage with its Level at zero or its mute on still sounds: the stage
    itself when its own meter read while it was down, then each machine playing
    its part that is sounding. Empty for a stage that is up, or quiet. */
export function heardThrough(
  stage: string,
  c: Controls,
  sounding: number,
  lately: Lately,
): string[] {
  if (!down(stage, c)) return []
  const own = lately.loud ? [stage] : []
  if (!lately.struck) return own
  const players = (PLAYED_ON[stage] ?? [])
    .filter(
      ([to, wired]) => wired(c) && !down(to, c) && soundingOn(to, sounding),
    )
    .map(([to]) => to)
  return [...own, ...players]
}

// How long a toy counts as playing after its last note or hit, and a stage as
// loud after its last peak, so a staccato tune or a sparse pattern holds the
// notice up between strikes.
const HOLD_MS = 1200

const lastAt = new Map<string, number>()
const latelyNow = createStore('')

// The raw taps rather than `engine.sounding`, whose needle is still falling
// for half a second after a fader reaches zero.
function watch() {
  const now = performance.now()
  const c = engine.controls.get()
  const { hits, taps } = engine.meter.get()
  if (engine.chipNotes.get().size > 0) lastAt.set('struck:Toy keyboard', now)
  if (hits !== 0) lastAt.set('struck:Toy drums', now)
  for (const [stage, tap] of Object.entries(TAP_OF))
    if (down(stage, c) && (taps[SOURCE_TAPS.indexOf(tap)] ?? 0) > SOUND_FLOOR)
      lastAt.set(`loud:${stage}`, now)
  const lately = [...lastAt]
    .filter(([, at]) => now - at < HOLD_MS)
    .map(([key]) => key)
    .join('\n')
  if (lately !== latelyNow.get()) latelyNow.set(lately)
}

let watchers = 0
let stop = () => {}

const recent = {
  get: latelyNow.get,
  subscribe(fn: () => void) {
    if (watchers++ === 0) {
      const offs = [
        engine.meter.subscribe(watch),
        engine.chipNotes.subscribe(watch),
      ]
      const timer = setInterval(watch, HOLD_MS / 4)
      stop = () => {
        for (const off of offs) off()
        clearInterval(timer)
      }
    }
    const unsubscribe = latelyNow.subscribe(fn)
    return () => {
      unsubscribe()
      if (--watchers === 0) stop()
    }
  },
}

/** `heardThrough` for a stage on the live board. Listens to the meter only
    while something is mounted. */
export function useHeardThrough(stage: string): string[] {
  const sounding = useStoreValue(engine.sounding)
  const keys = useStoreValue(recent).split('\n')
  const lately = {
    struck: keys.includes(`struck:${stage}`),
    loud: keys.includes(`loud:${stage}`),
  }
  const heard = useBoardValue(c =>
    heardThrough(stage, c, sounding, lately).join('\n'),
  )
  return heard === '' ? [] : heard.split('\n')
}
