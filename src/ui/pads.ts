// The kit's half of the wire. A pad is a switch: it has no position to catch up
// with and no ring to light, so none of the knob side's soft-takeover machinery
// reaches over here. What is left is which pad plays which voice, how hard a hit
// lands, and the two ways a pad gets bound — General MIDI for free, or a sweep
// down the kit.

import { ACCENT_GAIN, DRUM_VOICES, voiceBit, type DrumVoiceKey } from '../drums'
import { engine } from '../engine/engine'
import { createStore } from '../listeners'
import { omit, parseMap, read, write } from './persist'

// One pad = a (channel, note) pair, the way a knob is a (channel, controller)
// one. A pad has no position to keep and nothing to catch up with: it is a
// switch, so this is the whole of it.
export interface PadBinding {
  channel: number
  note: number
}

export type PadMap = Partial<Record<DrumVoiceKey, PadBinding>>

// Live progress of a pad sweep: hit a pad for each voice, down the kit.
export interface PadLearnState {
  done: number
  total: number
  next: DrumVoiceKey | null
}

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

const padId = (p: PadBinding) => `${p.channel}:${p.note}`

/** A stored pad map read back, dropping anything that no longer names a voice. */
export const parsePads = (raw: string | null): PadMap =>
  parseMap(
    raw,
    name => VOICE_KEYS.find(k => k === name) ?? null,
    stored => {
      const { channel, note } = stored as Partial<PadBinding>
      return typeof channel === 'number' && typeof note === 'number'
        ? { channel, note }
        : null
    },
  )

const PADS_KEY = 'bender.midi.pads'
const PAD_MAP_KEY = 'bender.midi.padmap'

// The kit as the wire sees it. One of these per page, owned by the MIDI manager
// — it is the manager that reads the bytes, and it hands the note ones here.
export class PadKit {
  /** Pads play the kit. Channel 10 needs no binding at all; anything else does. */
  readonly on = createStore(read(PADS_KEY) !== '0')
  readonly bindings = createStore<PadMap>(parsePads(read(PAD_MAP_KEY)))
  readonly learn = createStore<PadLearnState | null>(null)

  private voiceByPad = new Map<string, number>()
  private sweep: {
    keys: DrumVoiceKey[]
    index: number
    seen: Set<string>
  } | null = null

  constructor() {
    this.reindex()
  }

  setOn(on: boolean) {
    this.on.set(on)
    write(PADS_KEY, on ? '1' : '0')
    if (!on) this.stopLearn()
  }

  /** Hit a pad for each voice, down the kit. Any layout on any channel: a pad
      bank that isn't on channel 10, or isn't General MIDI, is exactly what this
      is for. Replaces whatever was learned before. */
  learnAll() {
    this.sweep = { keys: VOICE_KEYS, index: 0, seen: new Set() }
    this.persist({})
    this.report()
  }

  stopLearn() {
    if (this.sweep !== null) {
      this.sweep = null
      this.learn.set(null)
    }
  }

  clear(key: DrumVoiceKey) {
    this.persist(omit(this.bindings.get(), key))
  }

  clearAll() {
    this.persist({})
  }

  /** Which of the kit's voices a note strikes: what was learned first, then
      General MIDI on channel 10, and null for a note that is nobody's pad — a
      keyboard's, most of the time, which is where it goes instead. */
  voiceFor(channel: number, note: number): number | null {
    if (!this.on.get()) return null
    const learned = this.voiceByPad.get(padId({ channel, note }))
    if (learned !== undefined) return learned
    return channel === GM_CHANNEL ? gmVoice(note) : null
  }

  /** Waiting on a pad. A pad you are pointing at is not a pad you played, so
      the readout must not name a voice while this holds. */
  get binding(): boolean {
    return this.sweep !== null
  }

  /** A note message off the wire. True once the kit has dealt with it — struck a
      voice, bound one, or swallowed the finger coming back up — and false for a
      note that was nobody's pad, which is a key and goes to the chip. */
  play(channel: number, note: number, on: boolean, velocity: number): boolean {
    const sweep = this.sweep
    if (sweep !== null) {
      // Only a hit binds — the finger coming back up is the same pad — and a
      // pad already claimed this sweep can be leaned on without eating the
      // voice after it.
      const waiting = sweep.keys[sweep.index]
      const id = padId({ channel, note })
      if (!on || waiting === undefined || sweep.seen.has(id)) return true
      sweep.seen.add(id)
      this.bind(waiting, { channel, note })
      sweep.index += 1
      if (sweep.index >= sweep.keys.length) this.sweep = null
      this.report()
      return true
    }
    const voice = this.voiceFor(channel, note)
    if (voice === null) return false
    // A drum has no release: the pad's note off is a finger lifting off a
    // switch that has already fired, so there is nothing to let go of.
    if (on) engine.drumHit(voiceBit(voice), padGain(velocity))
    return true
  }

  // A pad drives one voice at a time, the way a knob drives one control: the
  // voice a pad already had is dropped rather than doubled up on.
  private bind(key: DrumVoiceKey, p: PadBinding) {
    const prev = this.voiceByPad.get(padId(p))
    const map =
      prev === undefined
        ? { ...this.bindings.get() }
        : omit(this.bindings.get(), VOICE_KEYS[prev] ?? key)
    map[key] = p
    this.persist(map)
  }

  private persist(next: PadMap) {
    this.bindings.set(next)
    this.reindex()
    write(PAD_MAP_KEY, JSON.stringify(next))
  }

  private reindex() {
    this.voiceByPad.clear()
    for (const [key, p] of Object.entries(this.bindings.get()))
      if (p !== undefined)
        this.voiceByPad.set(padId(p), voiceIndex(key as DrumVoiceKey))
  }

  private report() {
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
}
