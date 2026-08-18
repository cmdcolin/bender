// Knobs on a MIDI controller turning the board's controls, plus the three things
// a wire carries that aren't a knob: notes, which the toy chip already has a
// voice for; pads, which the drum machine already has six voices for; and clock,
// which the drum machine already has a tempo for.

import { CONTROL_KEYS, type ControlKey } from '../controls'
import {
  ACCENT_GAIN,
  DRUM_VOICES,
  VOICE_LABELS,
  voiceBit,
  type DrumVoiceKey,
} from '../drums'
import { engine } from '../engine/engine'
import { noteName, toSemitone } from '../notes'
import { createStore } from '../listeners'
import { ALL_SLIDERS, SLIDER_BY_KEY, sliderFor, snapToStep } from './controls'
import { fromPos, toPos } from './slider-scale'
import type { SliderDef } from './controls'

// One CC source = a (channel, controller) pair. The channel is kept so two
// knobs that share a controller number on different channels stay distinct.
export interface Binding {
  channel: number
  controller: number
  /** The knob is an endless encoder reporting turns rather than a position.
      See `applyDelta` for what that changes, which is more than the arithmetic. */
  relative?: boolean
}

export type BindingMap = Partial<Record<ControlKey, Binding>>

// One pad = a (channel, note) pair, the way a knob is a (channel, controller)
// one. A pad has no position to keep and nothing to catch up with: it is a
// switch, so this is the whole of it.
export interface PadBinding {
  channel: number
  note: number
}

export type PadMap = Partial<Record<DrumVoiceKey, PadBinding>>

// Where a knob sits for a control it hasn't caught yet, in control units. Soft
// takeover makes those knobs inert, and without this the panel gives no sign of
// it — the control just looks broken.
export type PickupMap = Partial<Record<ControlKey, number>>

export type MidiStatus =
  'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied'

// The last thing to come down the wire, and how many have come down it at all.
// A controller that looks dead is either not sending or not being understood,
// and those two look identical from the panel without this.
export interface Traffic {
  bytes: number[]
  /** What the manager decided the bytes meant, in the panel's words. */
  text: string
  /** Which input it arrived on — the difference between a keybed and its pads. */
  port: string
  /** The kit voice this struck, when the note was a pad rather than a key. */
  voice?: string
  at: number
  count: number
}

// A through port carries whatever is sent to it straight back to its own input,
// so lighting the rings on one is the app driving its own bound controls from
// its own echo — a knob nobody touched, walking the board. Linux ships one of
// these by default, which is why it is skipped rather than left to the user.
export const isLoopback = (name: string | null) =>
  /midi ?through|loopmidi|iac driver/i.test(name ?? '')

// Names the message the way the panel talks about it, so a reading needs no
// byte tables: a knob is its CC, a key is its pitch, a tick is the clock.
export function describe(bytes: number[]): string {
  const head = bytes[0]
  if (head === undefined) return 'empty'
  if (head === 0xf8) return 'clock tick'
  if (head === 0xfc) return 'clock stop'
  if (head === 0xfa) return 'clock start'
  const channel = (head & 0x0f) + 1
  const status = head & 0xf0
  const first = bytes[1]
  const second = bytes[2]
  if (first === undefined || second === undefined)
    return `status ${head.toString(16)}`
  if (status === 0x90 && second > 0)
    return `note on ${noteName(first)} vel ${second} ch${channel}`
  if (status === 0x90 || status === 0x80)
    return `note off ${noteName(first)} ch${channel}`
  if (status === 0xb0) return `CC${first} = ${second} ch${channel}`
  if (status === 0xe0) return `pitch bend ch${channel}`
  if (status === 0xa0 || status === 0xd0) return `aftertouch ch${channel}`
  return `status ${head.toString(16)} ch${channel}`
}

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
  /** The device's knobs report turns rather than positions. Stamped onto every
      binding the profile makes, and adjustable per binding after that: one desk
      can hold an encoder box and a fader box at once. */
  relative?: boolean
}

const TWISTER_CCS = Array.from({ length: 64 }, (_, i) => i)

export const DEVICE_PROFILES: DeviceProfile[] = [
  // 16 encoders × 4 on-device banks, factory-default CC 0..63 on channel 1.
  // Its encoders are endless, and each can be set either way in the device's own
  // utility, so both readings are offered rather than guessed at.
  { name: 'MIDI Fighter Twister', channel: 0, ccs: TWISTER_CCS },
  {
    name: 'MIDI Fighter Twister (endless)',
    channel: 0,
    ccs: TWISTER_CCS,
    relative: true,
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

// How hard the gate arrives, from how hard the key was hit. Velocity strikes the
// envelope's starting level, which is the same door the trigger patch comes in
// through — the toy's own keys are switches and can't do this, but a wire onto
// the gate always could.
//
// It floors well above zero rather than sweeping the whole range: plenty of
// controllers send one fixed velocity for every note, and on those a full sweep
// would just make the chip permanently quieter than the on-screen keys with
// nothing to show for it.
const VELOCITY_FLOOR = 0.3
export const velocity = (v: number) =>
  VELOCITY_FLOOR + (1 - VELOCITY_FLOOR) * (v / 127)

// Channel 10 — index 9 — is where General MIDI puts percussion, and it is the
// one thing about a pad that needs no learning: a pad bank sending there is
// saying it is a drum, whatever else the device is doing.
export const GM_CHANNEL = 9

// The General MIDI percussion map, folded onto a kit that has six voices. The
// whole 35…81 range is here rather than the eight notes a pad bank usually
// sends, because a controller with a full drum layout — or a DAW's clip playing
// out to us — sends the rest too, and a note that lands nowhere reads as a dead
// pad. Everything with a stick in it goes to a tom, everything metallic and
// short to the hat, and the wooden and pitched percussion to the bell.
export const GM_PADS: Record<DrumVoiceKey, number[]> = {
  drumKick: [35, 36],
  drumSnare: [37, 38, 40],
  drumClap: [39],
  drumHat: [42, 44, 46, 49, 51, 52, 54, 55, 57, 59, 69, 70, 73, 74],
  drumTom: [41, 43, 45, 47, 48, 50, 60, 61, 62, 63, 64, 65, 66, 78, 79],
  drumBell: [53, 56, 58, 67, 68, 71, 72, 75, 76, 77, 80, 81],
}

export const VOICE_KEYS: DrumVoiceKey[] = DRUM_VOICES.map(v => v.key)
export const voiceLabel = (key: DrumVoiceKey) =>
  DRUM_VOICES.find(v => v.key === key)?.label ?? key
export const voiceIndex = (key: DrumVoiceKey) => VOICE_KEYS.indexOf(key)

const GM_VOICE_BY_NOTE = new Map<number, number>()
for (const [key, notes] of Object.entries(GM_PADS))
  for (const note of notes)
    GM_VOICE_BY_NOTE.set(note, voiceIndex(key as DrumVoiceKey))

/** Which voice a General MIDI percussion note names, or null for a note the
    standard leaves to the machine. */
export const gmVoice = (note: number) => GM_VOICE_BY_NOTE.get(note) ?? null

// How hard a pad's hit lands. The kit has two weights of its own — a plain step
// and an accented one — so a pad plays between them: a middling hit is a plain
// step, and the hardest is an accent. Softer than middling goes on down to a
// ghost note, which the sequencer has no way of asking for at all.
const PAD_FLOOR = 0.3
export const padGain = (v: number) =>
  PAD_FLOOR + (ACCENT_GAIN - PAD_FLOOR) * (v / 127)

// Live progress of a pad sweep: hit a pad for each voice, down the kit.
export interface PadLearnState {
  done: number
  total: number
  next: DrumVoiceKey | null
}

const BINDINGS_KEY = 'bender.midi'
// Set once a grant succeeds, so a reload reconnects without another trip to the
// panel. Cleared on denial, so a revoked permission doesn't leave every load
// reporting an error nobody asked for.
const ENABLED_KEY = 'bender.midi.on'
const NOTES_KEY = 'bender.midi.notes'
const PADS_KEY = 'bender.midi.pads'
const PAD_MAP_KEY = 'bender.midi.padmap'
const CLOCK_KEY = 'bender.midi.clock'
const LIGHTS_KEY = 'bender.midi.lights'
const DEBUG_KEY = 'bender.midi.debug'

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
    const { channel, controller, relative } = v as Partial<Binding>
    if (typeof channel === 'number' && typeof controller === 'number')
      out[key] =
        relative === true
          ? { channel, controller, relative }
          : { channel, controller }
  }
  return out
}

// A stored pad map read back, dropping anything that no longer names a voice.
export function parsePads(raw: string | null): PadMap {
  if (raw === null) return {}
  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof stored !== 'object' || stored === null) return {}
  const out: PadMap = {}
  for (const [k, v] of Object.entries(stored)) {
    const key = VOICE_KEYS.find(c => c === k)
    if (key === undefined) continue
    if (typeof v !== 'object' || v === null) continue
    const { channel, note } = v as Partial<PadBinding>
    if (typeof channel === 'number' && typeof note === 'number')
      out[key] = { channel, note }
  }
  return out
}

const sourceId = (b: Binding) => `${b.channel}:${b.controller}`
const padId = (p: PadBinding) => `${p.channel}:${p.note}`

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

// An endless encoder's message is a turn, not a place, and there are two
// spellings of it in the wild:
//
//   offset   one click up is 65, one down is 63 — the delta is cc − 64. This is
//            the MIDI Fighter Twister's ENC 3FH/41H.
//   two's    one click up is 1, one down is 127 — negatives count down from 128.
//
// They collide head-on: 63 is +63 in two's and −1 in offset, so no rule reads a
// lone byte correctly for both, and a wrong guess sends the control flying the
// wrong way at full speed. What separates them is where a *single click* lands —
// hard against the middle in offset, hard against the ends in two's — so the
// spelling is latched from the first message a knob sends and kept, rather than
// re-read per byte where a fast turn's big delta would look like the other one.
export const isOffsetSpelling = (cc: number) =>
  cc !== 64 && Math.abs(cc - 64) <= 8

export function ccToDelta(cc: number, offset: boolean): number {
  return offset ? cc - 64 : cc < 64 ? cc : cc - 128
}

// A turn applied in travel, not in units. A click moves the same fraction of any
// control's sweep — one CC step's worth — so an encoder covers a log filter and
// a five-choice enum at the same speed a knob would, rather than crawling across
// the first and flying through the second. Turning faster sends bigger deltas,
// so acceleration comes free from the hardware.
export function applyDelta(
  def: SliderDef,
  value: number,
  delta: number,
): number {
  const pos = toPos(def, value) + delta / 127
  return snapToStep(def, fromPos(def, Math.min(1, Math.max(0, pos))))
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
  /** Pads play the kit. Channel 10 needs no binding at all; anything else does. */
  readonly pads = createStore(read(PADS_KEY) !== '0')
  readonly padBindings = createStore<PadMap>(parsePads(read(PAD_MAP_KEY)))
  readonly padLearn = createStore<PadLearnState | null>(null)
  /** Clock ticks set the drum machine's tempo. */
  readonly clockLock = createStore(read(CLOCK_KEY) === '1')
  /** Send each bound control's value back out, so a device with lit rings shows
      where the board is. */
  readonly lights = createStore(read(LIGHTS_KEY) === '1')
  /** The last message off the wire. Null until one arrives. */
  readonly traffic = createStore<Traffic | null>(null)
  /** Echo every message to the console as well as the panel. */
  readonly debug = createStore(read(DEBUG_KEY) === '1')

  private access: MIDIAccess | null = null
  private onStateChange: ((e: Event) => void) | null = null
  private keyBySource = new Map<string, ControlKey>()
  private voiceByPad = new Map<string, number>()
  private padSweep: {
    keys: DrumVoiceKey[]
    index: number
    seen: Set<string>
  } | null = null
  private sweep: {
    keys: ControlKey[]
    index: number
    seen: Set<string>
    relative: boolean
  } | null = null

  // Soft-takeover bookkeeping. `sent` is the last value MIDI wrote, which is how
  // a change from anywhere else is spotted: see watchControls.
  private sent = new Map<ControlKey, number>()
  private knob = new Map<ControlKey, number>()
  private engaged = new Set<ControlKey>()
  private lastTouch = new Map<ControlKey, number>()
  // Which spelling each endless encoder turned out to use, by source. Latched
  // from a knob's first message and held: see ccToDelta for why it can't be
  // re-read per byte.
  private spelling = new Map<string, boolean>()

  // What the wire is holding down, so it can be let go of by something other
  // than the note-off that may never come: a pedal lifting, an all-notes-off, a
  // device leaving the desk mid-note.
  private notesOn = new Set<number>()
  // Notes let go of while the sustain pedal was down. They are still sounding,
  // and the pedal lifting is what ends them.
  private sustained = new Set<number>()
  private pedal = false

  private seen = 0
  // A turning knob sends far faster than anyone can read, so the readout lands
  // at a legible rate while the count stays exact.
  private lastTraffic = 0

  private pulses: number[] = []
  private lastPulse = 0
  private clockTimer: ReturnType<typeof setInterval> | null = null
  private lightRaf = 0
  // What each ring was last told, so a frame that moved one control doesn't
  // re-send the other 138.
  private lit = new Map<ControlKey, number>()

  constructor() {
    this.reindex()
    this.reindexPads()
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
        this.lightAll()
        // Devices plugged in after the grant still get wired up — and one
        // pulled out mid-note never sends the note off, so what it was holding
        // is let go of here or it is held for ever.
        this.onStateChange = (e: Event) => {
          if ((e as MIDIConnectionEvent).port?.state === 'disconnected')
            this.allNotesOff()
          this.listen(access)
          this.lightAll()
        }
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
    this.stopPadLearn()
    this.armed.set(key)
  }

  setNotes(on: boolean) {
    this.notes.set(on)
    write(NOTES_KEY, on ? '1' : '0')
    if (!on) this.allNotesOff()
  }

  setPads(on: boolean) {
    this.pads.set(on)
    write(PADS_KEY, on ? '1' : '0')
    if (!on) this.stopPadLearn()
  }

  /** Hit a pad for each voice, down the kit. Any layout on any channel: a pad
      bank that isn't on channel 10, or isn't General MIDI, is exactly what this
      is for. Replaces whatever was learned before. */
  learnPads() {
    this.armed.set(null)
    this.stopLearn()
    this.padSweep = { keys: VOICE_KEYS, index: 0, seen: new Set() }
    this.persistPads({})
    this.reportPadSweep()
  }

  stopPadLearn() {
    if (this.padSweep !== null) {
      this.padSweep = null
      this.padLearn.set(null)
    }
  }

  clearPad(key: DrumVoiceKey) {
    this.persistPads(omit(this.padBindings.get(), key))
  }

  clearPads() {
    this.persistPads({})
  }

  setClockLock(on: boolean) {
    this.clockLock.set(on)
    write(CLOCK_KEY, on ? '1' : '0')
  }

  setDebug(on: boolean) {
    this.debug.set(on)
    write(DEBUG_KEY, on ? '1' : '0')
  }

  setLights(on: boolean) {
    this.lights.set(on)
    write(LIGHTS_KEY, on ? '1' : '0')
    if (on) this.lightAll()
  }

  /** Replace every binding with a device's factory layout: each knob CC takes
      the next control down the spine. Returns how many controls got a knob. */
  autoMap(profile: DeviceProfile): number {
    const next: BindingMap = {}
    let n = 0
    for (const [i, key] of AUTOMAP_KEYS.entries()) {
      const cc = profile.ccs[i]
      if (cc === undefined) break
      next[key] =
        profile.relative === true
          ? { channel: profile.channel, controller: cc, relative: true }
          : { channel: profile.channel, controller: cc }
      n += 1
    }
    this.replace(next)
    return n
  }

  /** Device-agnostic bulk bind: start from a clean slate, then bind the next
      control down the spine to each fresh knob that turns. Works on any
      controller, whatever its CC layout. `relative` says whether those knobs are
      endless encoders, which is the one thing a sweep cannot tell by watching. */
  learnSequence(relative = false) {
    this.armed.set(null)
    this.stopPadLearn()
    this.sweep = { keys: AUTOMAP_KEYS, index: 0, seen: new Set(), relative }
    this.replace({})
    this.reportSweep()
  }

  /** Read a bound knob the other way. A knob that jumps its control to one end
      and sticks is an encoder being read as a position, and this is the fix. */
  setRelative(key: ControlKey, on: boolean) {
    const b = this.bindings.get()[key]
    if (b === undefined) return
    this.spelling.delete(sourceId(b))
    this.release(key)
    this.persist({
      ...this.bindings.get(),
      [key]: on
        ? { channel: b.channel, controller: b.controller, relative: true }
        : { channel: b.channel, controller: b.controller },
    })
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
    if (this.lightRaf !== 0) cancelAnimationFrame(this.lightRaf)
    this.lightRaf = 0
    if (this.access) {
      for (const input of this.access.inputs.values())
        input.onmidimessage = null
      if (this.onStateChange)
        this.access.removeEventListener('statechange', this.onStateChange)
    }
  }

  private listen(access: MIDIAccess) {
    for (const input of access.inputs.values())
      input.onmidimessage = e => this.onMessage(e, input.name ?? '')
  }

  // Clock ticks arrive 24 times a beat and would bury everything else, so they
  // count but only take the readout when nothing else is using it.
  private record(bytes: number[], port: string, voice?: string) {
    this.seen += 1
    const now = performance.now()
    const tick = bytes[0] === 0xf8
    if (this.debug.get() && !tick)
      console.log(
        `[midi] ${port} ${bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')} — ${describe(bytes)}`,
      )
    if (tick && now - this.lastTraffic < 900) return
    if (now - this.lastTraffic < 80) return
    this.lastTraffic = now
    this.traffic.set({
      bytes,
      text: describe(bytes),
      port,
      voice,
      at: now,
      count: this.seen,
    })
  }

  private reindex() {
    this.keyBySource.clear()
    for (const [key, b] of Object.entries(this.bindings.get()))
      if (b !== undefined) this.keyBySource.set(sourceId(b), key as ControlKey)
  }

  private reindexPads() {
    this.voiceByPad.clear()
    for (const [key, p] of Object.entries(this.padBindings.get()))
      if (p !== undefined)
        this.voiceByPad.set(padId(p), voiceIndex(key as DrumVoiceKey))
  }

  private persistPads(next: PadMap) {
    this.padBindings.set(next)
    this.reindexPads()
    write(PAD_MAP_KEY, JSON.stringify(next))
  }

  // A pad drives one voice at a time, the way a knob drives one control: the
  // voice a pad already had is dropped rather than doubled up on.
  private bindPad(key: DrumVoiceKey, p: PadBinding) {
    const prev = this.voiceByPad.get(padId(p))
    const map =
      prev === undefined
        ? { ...this.padBindings.get() }
        : omit(this.padBindings.get(), VOICE_KEYS[prev] ?? key)
    map[key] = p
    this.persistPads(map)
  }

  private reportPadSweep() {
    const s = this.padSweep
    this.padLearn.set(
      s === null
        ? null
        : {
            done: s.index,
            total: s.keys.length,
            next: s.keys[s.index] ?? null,
          },
    )
  }

  /** Which of the kit's voices a note strikes: what was learned first, then
      General MIDI on channel 10, and null for a note that is nobody's pad — a
      keyboard's, most of the time, which is where it goes instead. */
  padVoice(channel: number, note: number): number | null {
    if (!this.pads.get()) return null
    const learned = this.voiceByPad.get(padId({ channel, note }))
    if (learned !== undefined) return learned
    return channel === GM_CHANNEL ? gmVoice(note) : null
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
    this.spelling.clear()
    this.lit.clear()
    if (Object.keys(this.pickups.get()).length > 0) this.pickups.set({})
    this.persist(next)
    this.lightAll()
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
    this.lit.delete(key)
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
      this.lightSoon()
    })
  }

  // Every bound control's value, back out to the device. A knob with a lit ring
  // stops being stranded in the first place: the ring follows the preset, so
  // there is nothing to sweep back to and nothing for the amber mark to warn
  // about. An endless encoder needs it most — it has no pointer of its own, and
  // the ring is the only place its control's value can be shown at all.
  //
  // Coalesced to a frame because a 30s morph moves every control every frame,
  // and a serial wire carrying 139 controls at that rate is a wire with a
  // queue on it. One frame's worth is what the hardware can draw anyway.
  private lightSoon() {
    if (!this.lights.get() || this.lightRaf !== 0) return
    this.lightRaf = requestAnimationFrame(() => {
      this.lightRaf = 0
      this.lightAll()
    })
  }

  private lightAll() {
    if (!this.lights.get() || this.access === null) return
    const controls = engine.controls.get()
    for (const [k, b] of Object.entries(this.bindings.get())) {
      const key = k as ControlKey
      const def = SLIDER_BY_KEY.get(key)
      if (b === undefined || def === undefined) continue
      const cc = Math.round(toPos(def, controls[key]) * 127)
      if (this.lit.get(key) === cc) continue
      this.lit.set(key, cc)
      for (const out of this.access.outputs.values()) {
        if (isLoopback(out.name)) continue
        out.send([0xb0 | b.channel, b.controller, cc])
      }
    }
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
    // An endless encoder reports no position, so there is none to seed.
    if (def === undefined || b.relative === true) return
    const at = ccToValue(def, cc)
    this.knob.set(key, at)
    if (at !== engine.controls.get()[key]) this.setPickup(key, at)
  }

  private drive(key: ControlKey, b: Binding, cc: number) {
    const def = SLIDER_BY_KEY.get(key)
    if (def === undefined) return
    const live = engine.controls.get()[key]

    // An endless encoder has no position to disagree with the screen, so there
    // is nothing for soft takeover to catch and nothing to strand: a turn moves
    // the control from wherever it stands, which is what the whole pickup dance
    // was working around in the first place.
    if (b.relative === true) {
      const id = sourceId(b)
      const known = this.spelling.get(id)
      const offset = known ?? isOffsetSpelling(cc)
      if (known === undefined) this.spelling.set(id, offset)
      const delta = ccToDelta(cc, offset)
      if (delta !== 0) this.write(key, applyDelta(def, live, delta))
      return
    }

    const value = ccToValue(def, cc)
    if (hasCaught(def, live, this.knob.get(key), value)) this.engaged.add(key)
    this.knob.set(key, value)
    if (!this.engaged.has(key)) {
      this.setPickup(key, value)
      return
    }
    this.setPickup(key, null)
    this.write(key, value)
  }

  // One turn is one step in the walk, the way a slider drag is: there is no
  // pointer-up to close the gesture, so a quiet knob closes it.
  private write(key: ControlKey, value: number) {
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

  private strike(semitone: number, gain: number) {
    this.notesOn.add(semitone)
    this.sustained.delete(semitone)
    engine.noteOn(semitone, gain)
  }

  // A key let go of under a held pedal keeps sounding, and the pedal is what
  // ends it. The chip's voices latch, so a note nobody ends never stops.
  private letGo(semitone: number) {
    if (this.pedal) {
      this.sustained.add(semitone)
      return
    }
    this.notesOn.delete(semitone)
    this.sustained.delete(semitone)
    engine.noteOff(semitone)
  }

  private setPedal(down: boolean) {
    if (down === this.pedal) return
    this.pedal = down
    if (down) return
    for (const semitone of this.sustained) {
      this.notesOn.delete(semitone)
      engine.noteOff(semitone)
    }
    this.sustained.clear()
  }

  /** Let go of every note the wire is holding, pedal and all. */
  allNotesOff() {
    this.pedal = false
    this.sustained.clear()
    for (const semitone of this.notesOn) engine.noteOff(semitone)
    this.notesOn.clear()
  }

  private onMessage(e: MIDIMessageEvent, port = '') {
    const data = e.data
    const head = data?.[0]
    if (data === null || head === undefined) return
    // Resolved before the readout rather than after it, so a pad that is
    // driving the kit says which voice it drove: the bytes alone can't tell a
    // pad from a key, and that is the one thing you want to read while binding.
    const struck =
      this.padSweep === null &&
      data.length === 3 &&
      (head & 0xf0) === 0x90 &&
      (data[2] ?? 0) > 0
        ? this.padVoice(head & 0x0f, data[1] ?? 0)
        : null
    this.record(
      [...data],
      port,
      struck === null ? undefined : VOICE_LABELS[struck],
    )
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
    if (status === 0x90 || status === 0x80) {
      const channel = head & 0x0f
      const on = status === 0x90 && second > 0
      const sweep = this.padSweep
      if (sweep !== null) {
        // Only a hit binds — the finger coming back up is the same pad — and a
        // pad already claimed this sweep can be leaned on without eating the
        // voice after it.
        const waiting = sweep.keys[sweep.index]
        const id = `${channel}:${first}`
        if (!on || waiting === undefined || sweep.seen.has(id)) return
        sweep.seen.add(id)
        this.bindPad(waiting, { channel, note: first })
        sweep.index += 1
        if (sweep.index >= sweep.keys.length) this.padSweep = null
        this.reportPadSweep()
        return
      }
      const voice = this.padVoice(channel, first)
      // A drum has no release: the pad's note off is a finger lifting off a
      // switch that has already fired, so there is nothing to let go of.
      if (voice !== null) {
        if (on) engine.drumHit(voiceBit(voice), padGain(second))
        return
      }
      if (!this.notes.get()) return
      const semitone = toSemitone(first)
      if (on) this.strike(semitone, velocity(second))
      else this.letGo(semitone)
      return
    }
    // Control Change is 0xB0..0xBF: status, controller, value.
    if (status !== 0xb0) return
    const relative = this.sweep?.relative === true
    const b: Binding = relative
      ? { channel: head & 0x0f, controller: first, relative: true }
      : { channel: head & 0x0f, controller: first }
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
    const bound = key === undefined ? undefined : this.bindings.get()[key]
    if (key !== undefined && bound !== undefined) {
      this.drive(key, bound, second)
      return
    }
    // The controller messages a keyboard sends that aren't a knob. Only once
    // nothing has bound them: a CC deliberately given to a control is that
    // control's, and a desk with a spare pedal input is entitled to spend it on
    // the tape speed.
    if (!this.notes.get()) return
    // 64 is the sustain pedal, and 120 and 123 are the two spellings of "let go
    // of everything" — which is what a controller sends when it loses its own
    // place, and the standard cure for a note left ringing.
    if (first === 64) this.setPedal(second >= 64)
    else if (first === 120 || first === 123) this.allNotesOff()
  }
}

export const midi = new Midi()

// One manager per page, so nothing in the app tears it down. A dev reload does
// replace the module, though, and without this the old one keeps its handlers on
// the inputs and its clock timer running — two managers driving the board from
// one knob, which is a confusing thing to meet while working on this file.
import.meta.hot?.dispose(() => midi.destroy())
