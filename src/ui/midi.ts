// Knobs on a MIDI controller turning the board's controls, plus the two things
// a wire carries that aren't a knob: notes, which the toy chip already has a
// voice for, and clock, which the drum machine already has a tempo for.

import { CONTROL_KEYS, type ControlKey } from '../controls'
import { engine } from '../engine/engine'
import { createStore } from '../listeners'
import { ALL_SLIDERS, SLIDER_BY_KEY, sliderFor, snapToStep } from './controls'
import { fromPos } from './slider-scale'
import type { SliderDef } from './controls'

// One CC source = a (channel, controller) pair. The channel is kept so two
// knobs that share a controller number on different channels stay distinct.
export interface Binding {
  channel: number
  controller: number
}

export type BindingMap = Partial<Record<ControlKey, Binding>>

// Where a knob sits for a control it hasn't caught yet, in control units. Soft
// takeover makes those knobs inert, and without this the panel gives no sign of
// it — the control just looks broken.
export type PickupMap = Partial<Record<ControlKey, number>>

export type MidiStatus =
  'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied'

// Live progress of a "learn in order" sweep: bind each control down the spine
// to whichever knob turns next. `next` is the one still waiting for a knob.
export interface LearnState {
  done: number
  total: number
  next: ControlKey | null
}

// A controller's factory layout, as the CC number each physical knob sends, in
// the order they should take controls. `ccs` is explicit rather than a
// base+count because real layouts stripe knobs across non-contiguous ranges. A
// device that banks knobs on-hardware (the MIDI Fighter Twister's four banks)
// just lists every bank's CC — the app sees banks as more distinct knobs, and
// needs no bank-switch logic of its own.
export interface DeviceProfile {
  name: string
  channel: number
  ccs: number[]
}

export const DEVICE_PROFILES: DeviceProfile[] = [
  // 16 encoders × 4 on-device banks, factory-default CC 0..63 on channel 1.
  {
    name: 'MIDI Fighter Twister',
    channel: 0,
    ccs: Array.from({ length: 64 }, (_, i) => i),
  },
  // Eight knobs, factory CC 74..81 — one row, so it takes the head of the spine.
  {
    name: 'Generic 8-knob (CC 74…81)',
    channel: 0,
    ccs: [74, 75, 76, 77, 78, 79, 80, 81],
  },
]

// The order controls take knobs. The mixes and levels lead because they are
// what a set is played on: every one of them is a stage's presence, so the
// first row of knobs on any device reaches whether each stage is there at all.
// The rest follow down the signal path, which is the order the panel draws them.
export const AUTOMAP_KEYS: ControlKey[] = [
  ...ALL_SLIDERS.filter(s => s.role).map(s => s.key),
  ...ALL_SLIDERS.filter(s => !s.role).map(s => s.key),
]

// A3 is the toy's own zero — the ROM's steps are semitones above it — so a
// controller's middle C lands three semitones up, where a keyboard expects it.
const A3 = 57

const BINDINGS_KEY = 'bender.midi'
// Set once a grant succeeds, so a reload reconnects without another trip to the
// panel. Cleared on denial, so a revoked permission doesn't leave every load
// reporting an error nobody asked for.
const ENABLED_KEY = 'bender.midi.on'
const NOTES_KEY = 'bender.midi.notes'
const CLOCK_KEY = 'bender.midi.clock'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A board that will not persist its bindings is still a board.
  }
}

function forget(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

// A stored map read back. Anything that no longer names a control with a slider
// — one renamed or dropped between versions — is discarded rather than left in
// the map as a binding that fires into nothing: the panel lists bindings by
// walking the slider table, so a key that table doesn't know could never be
// shown, and its knob could only be freed by clearing every binding.
export function parseBindings(raw: string | null): BindingMap {
  if (raw === null) return {}
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof stored !== 'object' || stored === null) return {}
  const out: BindingMap = {}
  for (const [k, v] of Object.entries(stored)) {
    const key = CONTROL_KEYS.find(c => c === k)
    if (key === undefined || !SLIDER_BY_KEY.has(key)) continue
    if (typeof v !== 'object' || v === null) continue
    const { channel, controller } = v as Partial<Binding>
    if (typeof channel === 'number' && typeof controller === 'number')
      out[key] = { channel, controller }
  }
  return out
}

const sourceId = (b: Binding) => `${b.channel}:${b.controller}`

/** A copy of a partial map without one key. */
export function omit<K extends string, V>(
  map: Partial<Record<K, V>>,
  key: K,
): Partial<Record<K, V>> {
  const out = { ...map }
  delete out[key]
  return out
}

type Span = Pick<SliderDef, 'min' | 'max' | 'step' | 'curve'>

// A 0..127 CC value → a stepped value in the control's range. A curved control
// maps through its own travel, so a knob feels like the slider on screen rather
// than racing through the useful end of the scale.
export function ccToValue(def: SliderDef, cc: number): number {
  return snapToStep(def, fromPos(def, cc / 127))
}

// Half a control's span per MIDI step — the pickup tolerance for the very first
// message of a binding, where there is no previous knob position to cross.
const epsilon = (span: Span) => (span.max - span.min) / 64

// Soft takeover: has the knob earned the right to drive this control yet?
// Three cases — nothing to catch; a first message with no earlier knob position
// to have crossed from, so accept when it lands close enough; otherwise the
// knob must have swept through the value on screen.
export function hasCaught(
  span: Span,
  onScreen: number | undefined,
  knobWas: number | undefined,
  knobNow: number,
): boolean {
  return onScreen === undefined
    ? true
    : knobWas === undefined
      ? Math.abs(knobNow - onScreen) <= epsilon(span)
      : (knobWas - onScreen) * (knobNow - onScreen) <= 0
}

// 24 pulses per quarter note, averaged over about a beat of arrivals.
export function bpmFromPulses(pulses: number[]): number | null {
  const first = pulses[0]
  const last = pulses[pulses.length - 1]
  if (pulses.length < 7 || first === undefined || last === undefined)
    return null
  const perPulse = (last - first) / (pulses.length - 1)
  const bpm = Math.round((60000 / (perPulse * 24)) * 2) / 2
  return Number.isFinite(bpm) ? bpm : null
}

// A knob turning is one gesture and wants one step in the undo walk, the way a
// slider drag does. There is no pointer-up to end it, so a quiet knob ends it:
// this long without a message and the next one arms a fresh step.
const GESTURE_GAP_MS = 400

class Midi {
  readonly status = createStore<MidiStatus>('idle')
  readonly bindings = createStore<BindingMap>(parseBindings(read(BINDINGS_KEY)))
  readonly armed = createStore<ControlKey | null>(null)
  readonly learn = createStore<LearnState | null>(null)
  readonly pickups = createStore<PickupMap>({})
  /** Tempo off the wire, or null when no clock is running. */
  readonly bpm = createStore<number | null>(null)
  /** Notes play the toy chip's keyboard. */
  readonly notes = createStore(read(NOTES_KEY) !== '0')
  /** Clock ticks set the drum machine's tempo. */
  readonly clockLock = createStore(read(CLOCK_KEY) === '1')

  private access: MIDIAccess | null = null
  private onStateChange: (() => void) | null = null
  private keyBySource = new Map<string, ControlKey>()
  private sweep: {
    keys: ControlKey[]
    index: number
    seen: Set<string>
  } | null = null

  // Soft-takeover bookkeeping. `sent` is the last value MIDI wrote, which is how
  // a change from anywhere else is spotted: see watchControls.
  private sent = new Map<ControlKey, number>()
  private knob = new Map<ControlKey, number>()
  private engaged = new Set<ControlKey>()
  private lastTouch = new Map<ControlKey, number>()

  private pulses: number[] = []
  private lastPulse = 0
  private clockTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.reindex()
    this.watchControls()
    if (read(ENABLED_KEY) === '1') this.enable()
  }

  enable() {
    if (!('requestMIDIAccess' in navigator)) {
      this.status.set('unsupported')
      return
    }
    this.status.set('requesting')
    navigator.requestMIDIAccess().then(
      access => {
        this.access = access
        write(ENABLED_KEY, '1')
        this.status.set('ready')
        this.listen(access)
        // Devices plugged in after the grant still get wired up.
        this.onStateChange = () => this.listen(access)
        access.addEventListener('statechange', this.onStateChange)
        // A source that stops sending ticks — or is unplugged — never sends the
        // stop byte, so drop the tempo once the ticks go quiet.
        this.clockTimer = setInterval(() => {
          if (
            this.bpm.get() !== null &&
            performance.now() - this.lastPulse > 1000
          )
            this.stopClock()
        }, 500)
      },
      () => {
        forget(ENABLED_KEY)
        this.status.set('denied')
      },
    )
  }

  arm(key: ControlKey | null) {
    this.stopLearn()
    this.armed.set(key)
  }

  setNotes(on: boolean) {
    this.notes.set(on)
    write(NOTES_KEY, on ? '1' : '0')
  }

  setClockLock(on: boolean) {
    this.clockLock.set(on)
    write(CLOCK_KEY, on ? '1' : '0')
  }

  /** Replace every binding with a device's factory layout: each knob CC takes
      the next control down the spine. Returns how many controls got a knob. */
  autoMap(profile: DeviceProfile): number {
    const next: BindingMap = {}
    let n = 0
    for (const [i, key] of AUTOMAP_KEYS.entries()) {
      const cc = profile.ccs[i]
      if (cc === undefined) break
      next[key] = { channel: profile.channel, controller: cc }
      n += 1
    }
    this.replace(next)
    return n
  }

  /** Device-agnostic bulk bind: start from a clean slate, then bind the next
      control down the spine to each fresh knob that turns. Works on any
      controller, whatever its CC layout. */
  learnSequence() {
    this.armed.set(null)
    this.sweep = { keys: AUTOMAP_KEYS, index: 0, seen: new Set() }
    this.replace({})
    this.reportSweep()
  }

  stopLearn() {
    if (this.sweep !== null) {
      this.sweep = null
      this.learn.set(null)
    }
  }

  clearBinding(key: ControlKey) {
    this.release(key)
    this.persist(omit(this.bindings.get(), key))
  }

  clearAll() {
    this.replace({})
  }

  destroy() {
    if (this.clockTimer !== null) clearInterval(this.clockTimer)
    if (this.access) {
      for (const input of this.access.inputs.values())
        input.onmidimessage = null
      if (this.onStateChange)
        this.access.removeEventListener('statechange', this.onStateChange)
    }
  }

  private listen(access: MIDIAccess) {
    for (const input of access.inputs.values())
      input.onmidimessage = e => this.onMessage(e)
  }

  private reindex() {
    this.keyBySource.clear()
    for (const [key, b] of Object.entries(this.bindings.get()))
      if (b !== undefined) this.keyBySource.set(sourceId(b), key as ControlKey)
  }

  private persist(next: BindingMap) {
    this.bindings.set(next)
    this.reindex()
    write(BINDINGS_KEY, JSON.stringify(next))
  }

  private replace(next: BindingMap) {
    this.engaged.clear()
    this.knob.clear()
    this.sent.clear()
    this.lastTouch.clear()
    if (Object.keys(this.pickups.get()).length > 0) this.pickups.set({})
    this.persist(next)
  }

  private reportSweep() {
    const s = this.sweep
    this.learn.set(
      s === null
        ? null
        : {
            done: s.index,
            total: s.keys.length,
            next: s.keys[s.index] ?? null,
          },
    )
  }

  // Forget a control's takeover state, so its knob has to earn it again. The
  // gesture clock goes with it: whatever turned this control a moment ago, the
  // next turn is a new hand on a new knob and wants its own step in the walk.
  private release(key: ControlKey) {
    this.engaged.delete(key)
    this.knob.delete(key)
    this.sent.delete(key)
    this.lastTouch.delete(key)
    this.setPickup(key, null)
  }

  private setPickup(key: ControlKey, value: number | null) {
    const pickups = this.pickups.get()
    if (value === null) {
      if (pickups[key] !== undefined) this.pickups.set(omit(pickups, key))
    } else if (pickups[key] !== value) {
      this.pickups.set({ ...pickups, [key]: value })
    }
  }

  // A control moved by anything but its knob — a slider, a preset, a morph, a
  // roll — drops the catch, so the knob has to sweep back through the new value
  // before it drives again. Losing the catch is the moment the knob's position
  // starts mattering again, so this is also what puts the amber mark up: a
  // preset load strands every bound knob at once, and nothing else says so.
  private watchControls() {
    engine.controls.subscribe(() => {
      const controls = engine.controls.get()
      for (const key of [...this.engaged]) {
        if (controls[key] === this.sent.get(key)) continue
        this.engaged.delete(key)
        this.sent.delete(key)
        const at = this.knob.get(key)
        if (at !== undefined) this.setPickup(key, at)
      }
    })
  }

  // `cc` is the value of the message that did the binding. It never drives the
  // control — a knob you moved to say *which* knob shouldn't also fling the
  // control to wherever it happened to be — but it is where the knob is
  // standing, so it seeds the takeover. Keep turning from there and the control
  // is caught the moment you sweep through it, which is the whole gesture:
  // without the seed the next message would be a cold first touch, and would
  // have to land within a step of the value to take at all.
  private bind(key: ControlKey, b: Binding, cc: number) {
    // A CC drives one control at a time: drop whoever held this source before.
    const prev = this.keyBySource.get(sourceId(b))
    const next =
      prev === undefined
        ? { ...this.bindings.get() }
        : omit(this.bindings.get(), prev)
    next[key] = b
    this.release(key)
    if (prev !== undefined) this.release(prev)
    this.persist(next)
    const def = SLIDER_BY_KEY.get(key)
    if (def === undefined) return
    const at = ccToValue(def, cc)
    this.knob.set(key, at)
    if (at !== engine.controls.get()[key]) this.setPickup(key, at)
  }

  private drive(key: ControlKey, cc: number) {
    const def = SLIDER_BY_KEY.get(key)
    if (def === undefined) return
    const value = ccToValue(def, cc)
    const live = engine.controls.get()[key]
    if (hasCaught(def, live, this.knob.get(key), value)) this.engaged.add(key)
    this.knob.set(key, value)
    if (!this.engaged.has(key)) {
      this.setPickup(key, value)
      return
    }
    this.setPickup(key, null)
    const now = performance.now()
    if (now - (this.lastTouch.get(key) ?? -Infinity) > GESTURE_GAP_MS)
      engine.armStep()
    this.lastTouch.set(key, now)
    this.sent.set(key, value)
    engine.set(key, value)
  }

  private onPulse() {
    const now = performance.now()
    this.pulses.push(now)
    if (this.pulses.length > 25) this.pulses.shift()
    this.lastPulse = now
    const bpm = bpmFromPulses(this.pulses)
    if (bpm === null || bpm === this.bpm.get()) return
    this.bpm.set(bpm)
    // Through the tempo control like any other write, so the slider follows the
    // wire and the pattern it drives stays one thing rather than two clocks.
    if (this.clockLock.get()) {
      const def = sliderFor('drumBpm')
      engine.set(
        'drumBpm',
        snapToStep(def, Math.min(def.max, Math.max(def.min, bpm))),
      )
    }
  }

  private stopClock() {
    this.pulses = []
    if (this.bpm.get() !== null) this.bpm.set(null)
  }

  private onMessage(e: MIDIMessageEvent) {
    const data = e.data
    const head = data?.[0]
    if (data === null || head === undefined) return
    // System real-time is a single status byte: 0xF8 is a clock tick, 0xFC stop.
    if (data.length === 1) {
      if (head === 0xf8) this.onPulse()
      else if (head === 0xfc) this.stopClock()
      return
    }
    const first = data[1]
    const second = data[2]
    if (data.length !== 3 || first === undefined || second === undefined) return
    const status = head & 0xf0
    // Note On is 0x90..0x9F, Note Off 0x80..0x8F. A zero-velocity Note On is the
    // running-status spelling of a Note Off, and the chip's keyboard latches, so
    // both have to reach noteOff or the note never lets go.
    if (this.notes.get() && (status === 0x90 || status === 0x80)) {
      const semitone = first - A3
      if (status === 0x90 && second > 0) engine.noteOn(semitone)
      else engine.noteOff(semitone)
      return
    }
    // Control Change is 0xB0..0xBF: status, controller, value.
    if (status !== 0xb0) return
    const b = { channel: head & 0x0f, controller: first }
    const id = sourceId(b)
    const sweep = this.sweep
    if (sweep !== null) {
      // A knob already claimed this sweep keeps streaming as it turns — only a
      // fresh source advances to the next control.
      const waiting = sweep.keys[sweep.index]
      if (sweep.seen.has(id) || waiting === undefined) return
      sweep.seen.add(id)
      this.bind(waiting, b, second)
      sweep.index += 1
      if (sweep.index >= sweep.keys.length) this.sweep = null
      this.reportSweep()
      return
    }
    const armed = this.armed.get()
    if (armed !== null) {
      this.bind(armed, b, second)
      this.armed.set(null)
      return
    }
    const key = this.keyBySource.get(id)
    if (key !== undefined) this.drive(key, second)
  }
}

export const midi = new Midi()
