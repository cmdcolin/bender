import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  isControlKey,
  type ControlKey,
  type Controls,
} from '../controls.ts'
import {
  asCond,
  asEventEvery,
  CELL_ROWS,
  COND_KEYS,
  CONDS,
  CYCLE,
  DRUM_VOICES,
  EVENT_EVERY,
  GRID_ROWS,
  parseCells,
  parseRow,
  RATCHET_KEYS,
  RATCHETS,
  rowText,
  STEPS,
  type CellRow,
} from '../drums.ts'
import { BLOCK, METER_EVERY } from '../dsp/stage.ts'
import { YOURS } from '../dsp/stages/roms.ts'
import { followsGate, gateLane } from '../dsp/trigbus.ts'
import { strayNames } from '../dsp/wander.ts'
import { engine, SOUND_FLOOR } from '../engine/engine.ts'
import { errorText } from '../errorText.ts'
import { semitoneName } from '../notes.ts'
import { phraseControls, phraseOf, phraseText } from '../prattle.ts'
import {
  asTuneLen,
  isNote,
  laneSteps,
  laneText,
  parseLane,
  parseSeqFlags,
  REST,
  seqFlagsText,
  TUNE_LANE_KEYS,
  TUNE_LANES,
} from '../tune.ts'
import { recorded } from './activity.ts'
import { CARDS, keyOf, type CardStage } from './cards.ts'
import {
  ALL_SLIDERS,
  CHANNELS,
  EDITOR_KEYS,
  GROUP_BY_KEY,
  GROUPS,
  SLIDER_BY_KEY,
  type SliderDef,
} from './controls/index.ts'
import { applyPreset, PRESETS, presetNameFor } from './presets/index.ts'
import { boardHash, coerceControl } from './share.ts'
import { formatValue } from './slider-scale.ts'
import { STRUCK_HOME, strike, type Struck } from './strikes.ts'

// The Claude in Chrome extension cuts a returned string at 1000 characters and
// blocks some longer ones outright, so each text an agent reads stays under
// GUIDE_MAX_CHARS.
export const GUIDE_MAX_CHARS = 900

const HELP = `window.bender controls bender, a circuit-bent toy keyboard and drum machine built on Web Audio. Each call reads or changes the controls the panel shows, and a person can move a control between two of your calls, so read the state again before relying on it. The browser tool cuts any single returned string at 1000 characters, so return arrays and objects as they are, since JSON.stringify turns a long list into one string. Start with bender.summary(). The rest is in ten topics: bender.guide('read') covers board, find and describe; 'change' covers set, presets, load, reset and undo; 'music' covers tune and drums, 'drums' the rest of the kit, and 'line' the bassline memory and 'lead' Howler's; 'sound' covers start, play, stop, listen and link; 'hit' strikes things by hand; 'speak' gives Prattle words; 'clock' lands changes on the bar with position, next and queue.`

const GUIDE = {
  read: `Reading the board. bender.summary() reports whether audio is running, what is playing, the preset, how many controls differ from their defaults, and the undo depth. bender.board() lists each changed control as a row with its key, value, group and default, plus the melody lanes and drum rows as text. Search before guessing a key. bender.find('delay feedback') ranks controls by key, label, group and help text and returns up to 8 rows with their ranges; bender.find('tape delay', 20) returns more, and bender.find() with no argument lists the groups. A row marked mix or level belongs to the control that makes its stage audible, and the stage adds nothing while that control is at 0. bender.describe('chipStarve') returns one control's range, step, unit, choices and help. Each bend and pedal has an Into key: set({ ampInto: 'clatter' }) patches Ember onto the kit alone.`,
  change: `Changing controls. bender.set({ chipStarve: 0.8, chipTone: 'reed' }), or set('chipStarve', 0.8) for one, accepts numbers, choice names and unique prefixes of them, and returns four lists. applied names what changed, adjusted lists values clamped to the range or rounded to the step, unknown lists unknown keys with the closest real ones, and failed lists values set could not read; set leaves those controls unchanged. Seconds as a second argument glide the controls there on animation frames, which the browser pauses in a hidden tab; set returns at once, so listen in a later call. Each call adds one undo step, and bender.undo() and bender.redo() walk them. bender.presets('word') lists presets, bender.load('dying toy') loads one, and bender.reset() restores the defaults; load and reset also take seconds. bender.say('the kick drops') labels the changes the page lists for a listener.`,
  music: `Writing music. bender.tune('C4 E4 G4 ~ . C5') writes the melody memory, one token a step, up to 32: a note name from C2 to C#7, a dot for a rest, or a tilde to hold. It also switches the chip to the memory, at tuneRate steps a second. An array of up to three strings writes one lane each. Glint, Parlor and Growler follow it on fmKeyGate, pcmKeyGate and monoKeyGate; 'lane 1' to 'lane 3' follow one lane, and tuneLift keeps lanes off Plinky. bender.drums({ kick: 'x...x...', hat: '..x...x.' }) writes the named rows: kick, snare, hat, clap, tom, bell, open hat, cymbal and accent. x is a hit, ? a hit with probability drumChance, . a rest. Each character is a sixteenth, so a beat is four. A row's length sets its loop, an empty string clears it, and rows left out keep theirs. bpm: 130 sets the tempo. bender.guide('drums') covers Euclid rows, ratchets, nudges, faults and bar conditions.`,
  drums: `More drums. In a row, a g is a ghost, a hit struck soft. x(3,8) is a Euclidean row of 3 hits over 8 steps (x(3,8,2) turns it by 2), and [xxx] strikes one step three times as a ratchet on that column. The rows ratchet ('..3...2.'), nudge (twelfths late, '....6...') and event (c cut, d drop, b brake, f freeze, r reboot: '............bbbb') take one character a column. 'event every': '4:4' fires the event row on the fourth bar of every four, and 'snare bars': '!4:4' plays a voice row on every bar but the fourth; the conditions are ${CONDS.join(', ')}, and '' or 'off' means every bar. bender.board().drums reads all of these back in the same form. drumWander from 0 to 1 strays the kit off the grid for a bar now and then, and the wander field of bender.listen names the strays it played.`,
  line: `The bassline. bender.line('. A3 A3 A4 . A3 A3 A3', { accent: '...x', slide: '' }) writes a second 32-step memory, one token a step as in tune, and turns it on. It steps with the kit's sixteenths while the kit runs; sync: 'eighths' or 'off' changes that, and off runs with the toy's song at monoSeqRate. It plays on Growler, whose stock 32′ range sounds each note two octaves down: write A3 for a 55 Hz A1, as sounds in the result shows. on: 'Glint' or 'Parlor' moves it. accent and slide take x and . a step: an accent hits harder and opens the filter, a slide glides into the next note. Left out, they keep theirs. The target's KeyGate jumper also plays the tune: 'no, cut' drops it, 'lane 1' keeps one lane. The result warns about anything keeping it silent. Growler's sound is monoCutoff, monoEmph, monoContour, monoFD and monoGate. The techno and acid techno presets load a groove to riff on.`,
  lead: `Howler, the lead: a second build of Growler's card with a 32-step memory of its own, so a lead plays over the bassline. bender.line('. . C5 ~ . C5 . D#5', { on: 'Howler', accent: '..x....x', slide: '...x' }) writes Howler's memory and leaves Growler's alone, with the same tokens, accent, slide and sync as the bassline. Howler's stock 8′ sounds the notes as written. Its level starts at 0: set leadLevel (0.9 is loud) and leadKeyGate: 'no, cut' to keep the toy's tune off it. Its sound is leadCutoff, leadEmph (near 1 it screams), leadSweep, leadFold, leadGate and leadAccent. The hard techno howl preset loads a 150 bpm groove with a lead to riff on, and howler torn tears the lead into noise.`,
  hit: `Hitting things. bender.hit('sheet') strikes the steel sheet once and bender.hit('bottle') taps the glass bottle; bender.hit('kick') or hit(['kick', 'open hat']) strikes kit voices by hand. { x: 0.2, y: 0.8 } picks the spot on the sheet or the bottle, 0 to 1 across and down its face, which changes the modes that ring, and { gain: 0.5 } hits softer. A hit plays at once; inside bender.queue it waits for the queue's bar and lands within about 20 ms of it. The sheet and the bottle start at Level 0, and hit warns while sheetLevel or bottleLevel is 0. To keep them ringing between calls, sheetStrikes and bottleStrikes hit at random so many times a second, and sheetStruckBy and bottleStruckBy name a kit voice, any hit or a key that strikes them too. Shake feeds the board's sound back in and howls turned well up; bottleFill pours in water, lower and duller.`,
  speak: `Prattle, a talking toy's speech chip. bender.speak('kill the bass') loads the phrase and says it once; speak('kill the bass', { struck: 'open hat' }) speaks the next syllable on each open hat hit, so words land on the grid, and { repeat: true } says it round and round. It knows numbers and techno words (bass, kick, drop, noise, acid, machine, error, reboot, again…) and sounds out the rest. Level starts at 0, so speak brings talkLevel up to 0.8. Bends: talkClock, talkFrameDiv ('stopped' drones), talkLock (frame clock off the kit), talkLoopBit and talkLoopSlip (a stuttering loop), talkDataLine/talkDataFault (D10 'to +V' howls), talkPitchLine/Fault, talkVoicing and talkLeak. The mic jack 'Prattle in' talks through its mouth.`,
  clock: `The kit's clock. bender.position() returns the kit's counter as bar, beat 0 to 3 and step 0 to 15, the bpm it runs at, and the bars queued changes wait for. Bars count as 'snare bars': '4:4' counts them. await bender.next() resolves within about 16 ms after the next downbeat, next(4) after the next bar divisible by 4, and next('beat') after the next beat. bender.queue(() => { bender.drums({ kick: 'x.x.x.x.' }); bender.set({ dlyFb: 0.9 }) }, 4) lands the set, load, reset, tune, line and drums writes made inside the function on the next bar divisible by 4, exactly on the kit's step; queue(fn, { bar: 32 }) names the bar. A glide inside starts on that bar. queue returns a promise of where the writes landed, and the writes' own results describe the board before the bar. While the kit is stopped, queue lands at once, and stop lands everything waiting. bender.unqueue() drops it.`,
  sound: `Sound. Audio stays suspended until the page gets a click or key press. await bender.start() returns running, or a message while audio is still suspended; then click an empty area of the page and call start again. bender.play() starts the drums, the bassline and a melody written with tune; the toy's demo songs start only with bender.play('song'), bender.play('drums') starts the kit alone, and bender.stop() stops all. A screenshot measures nothing of the sound. await bender.listen(1500) reads the meters for that many milliseconds, at most 20000, and returns the meters that arrived against those due (short means missed audio blocks), the peak in dBFS, the largest limiter gain reduction, the lowest toy supply rail (1 is full batteries), watchdog reboots, the sources with signal and their sourcePeaks, each audible machine's notes, drum hits. bender.link() returns a URL that loads this board.`,
}

type Topic = keyof typeof GUIDE

const isTopic = (topic: string): topic is Topic => Object.hasOwn(GUIDE, topic)

const toUnit = (v: number) => (v >= 0 ? Math.min(v, 1) : 0)

const isStruck = (name: string): name is Struck =>
  Object.hasOwn(STRUCK_HOME, name)

const MAX_LISTEN_MS = 20000
const SPEAK_LEVEL = 0.8

const talk = () => engine.talk()
const BACKLOG = 1.25
const START_WAIT_MS = 1000
const CHOICES_SHOWN = 4
const ROW_HELP_CHARS = 90

declare global {
  interface Window {
    bender?: BenderApi
  }
}

type Value = number | string

interface SetReport {
  applied: Record<string, string>
  adjusted: string[]
  unknown: string[]
  failed: string[]
}

const groupOf = (key: ControlKey) => GROUP_BY_KEY.get(key) ?? 'board'

const show = (key: ControlKey, value: number) => {
  const def = SLIDER_BY_KEY.get(key)
  return def ? formatValue(def, value) : String(value)
}

function firstSentence(text: string) {
  const sentence = /^.*?[.!?](\s|$)/.exec(text)?.[0].trim() ?? text
  return sentence.length > ROW_HELP_CHARS
    ? `${sentence.slice(0, ROW_HELP_CHARS).replace(/\s+\S*$/, '')}…`
    : sentence
}

function range(def: SliderDef) {
  if (def.choices) {
    const more = def.choices.length - CHOICES_SHOWN
    const listed = def.choices.slice(0, CHOICES_SHOWN).join(' | ')
    return `choices ${listed}${more > 0 ? ` | and ${more} more` : ''}`
  }
  const unit = def.unit ? ` ${def.unit}` : ''
  const normal = def.normal ? `, normal ${def.normal[0]}..${def.normal[1]}` : ''
  return `${def.min}..${def.max}${unit}${normal}`
}

function score(def: SliderDef, word: string): number {
  const key = def.key.toLowerCase()
  const label = def.label.toLowerCase()
  if (key === word || label === word) return 100
  if (key.includes(word) || label.includes(word)) return 50
  if (groupOf(def.key).toLowerCase().includes(word)) return 20
  if (def.choices?.some(c => c.toLowerCase().includes(word))) return 15
  return def.help.toLowerCase().includes(word) ? 5 : 0
}

// A query naming a group or a label as a phrase ranks that group's controls
// above controls that match its words one at a time, so 'tape delay' lists the
// Tape delay controls before tapeMix.
function search(query: string, limit: number) {
  const phrase = query.toLowerCase().trim()
  const words = phrase.split(/\s+/).filter(Boolean)
  return ALL_SLIDERS.map(def => {
    const scores = words.map(w => score(def, w))
    if (scores.includes(0)) return { def, score: 0 }
    const named = `${groupOf(def.key)} ${def.label}`.toLowerCase()
    return {
      def,
      score:
        scores.reduce((a, b) => a + b, 0) +
        (words.length > 1 && named.includes(phrase) ? 100 : 0) +
        (def.role ? 5 : 0),
    }
  })
    .filter(hit => hit.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(hit => hit.def)
}

function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    row = next
  }
  return row[b.length]!
}

function unknownKey(name: string) {
  const lower = name.toLowerCase()
  const near = CONTROL_KEYS.map(key => ({
    key,
    d: distance(lower, key.toLowerCase()),
  }))
    .filter(k => k.d <= Math.max(2, Math.floor(name.length / 4)))
    .toSorted((a, b) => a.d - b.d)
    .slice(0, 3)
  return near.length > 0
    ? `${name}: no control has this key; closest keys: ${near.map(k => k.key).join(', ')}`
    : `${name}: no control has this key; bender.find(words) searches the controls`
}

function numberFor(key: ControlKey, asked: Value): number {
  if (typeof asked === 'number') {
    if (!Number.isFinite(asked)) throw new Error('not a finite number')
    return asked
  }
  const def = SLIDER_BY_KEY.get(key)
  if (!def?.choices) {
    const n = Number(asked)
    if (asked.trim() === '' || !Number.isFinite(n))
      throw new Error(`'${asked}' is not a number`)
    return n
  }
  const lower = asked.toLowerCase()
  const exact = def.choices.findIndex(c => c.toLowerCase() === lower)
  const prefixed = def.choices.flatMap((c, i) =>
    c.toLowerCase().startsWith(lower) ? [i] : [],
  )
  const at = exact >= 0 ? exact : prefixed.length === 1 ? prefixed[0]! : -1
  if (at < 0)
    throw new Error(
      `${prefixed.length > 1 ? `'${asked}' matches more than one choice` : `no choice matches '${asked}'`}; ${range(def)}`,
    )
  return def.min + at
}

interface Queued {
  cut: Partial<Controls>
  glide: Partial<Controls>
  seconds: number
  force: Set<ControlKey>
  hits: (() => void)[]
}

let queueing: Queued | null = null

function land(
  patch: Partial<Controls>,
  seconds: number,
  force?: ReadonlySet<ControlKey>,
) {
  const glide = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0
  const board = engine.controls.get()
  if (queueing && glide > 0) {
    Object.assign(queueing.glide, patch)
    queueing.seconds = Math.max(queueing.seconds, glide)
    for (const key of force ?? []) queueing.force.add(key)
  } else if (queueing) {
    Object.assign(queueing.cut, patch)
  } else if (
    CONTROL_KEYS.some(k => patch[k] !== undefined && patch[k] !== board[k])
  ) {
    engine.morphNow({ ...board, ...patch }, glide, force)
    engine.flush()
  }
}

const BEAT = 4
// A change aimed nearer its downbeat than this goes to the next one, since the
// meter it was aimed from is up to one meter period old.
const CUE_LEAD_MS = 25

type Bars = number | 'bar' | 'beat'

function runOf(bars: Bars) {
  const steps = Math.round(
    (bars === 'bar' ? 1 : bars === 'beat' ? 1 / BEAT : bars) * STEPS,
  )
  if (!(steps >= 1))
    throw new Error(
      `'${bars}' is not a count of bars; use 'bar', 'beat', or a number such as 4, 0.25 for a beat or 1/16 for a step`,
    )
  return steps
}

const counting = () => engine.drumsPlaying.get() && engine.running.get()

function kitState() {
  return counting()
    ? 'running'
    : engine.drumsPlaying.get()
      ? audioState()
      : 'stopped: bender.play() starts the counter'
}

function position() {
  const m = engine.meter.get()
  const step = m.tick % STEPS
  return {
    bar: Math.floor(m.tick / STEPS),
    beat: Math.floor(step / BEAT),
    step,
    bpm: m.drumStepMs > 0 ? Number((15000 / m.drumStepMs).toFixed(1)) : 0,
    kit: kitState(),
    waiting: engine.cueTicks().map(t => `bar ${Math.floor(t / STEPS)}`),
  }
}

function nextDownbeat(bars: Bars = 1) {
  const run = runOf(bars)
  if (!counting()) throw new Error(`the kit is ${kitState()}`)
  const from = Math.floor(engine.meter.get().tick / run)
  return new Promise<ReturnType<typeof position>>((resolve, reject) => {
    const done = () => {
      offMeter()
      offRun()
    }
    const offMeter = engine.meter.subscribe(() => {
      if (Math.floor(engine.meter.get().tick / run) !== from) {
        done()
        resolve(position())
      }
    })
    const offRun = engine.drumsPlaying.subscribe(() => {
      if (!engine.drumsPlaying.get()) {
        done()
        reject(new Error('the kit stopped before the downbeat'))
      }
    })
  })
}

function cueAt(when: Bars | { bar: number }) {
  const tick = engine.meter.get().tick
  if (typeof when === 'object') {
    const at = Math.round(when.bar) * STEPS
    if (!(at >= 0 && at < CYCLE))
      throw new Error(`{ bar: ${when.bar} } is not a bar of the counter`)
    if (at <= tick && counting())
      throw new Error(
        `bar ${when.bar} has begun or passed; the counter is on bar ${Math.floor(tick / STEPS)}`,
      )
    return { at, every: 0 }
  }
  const every = runOf(when)
  const first = (Math.floor(tick / every) + 1) * every
  const at = engine.msUntil(first) < CUE_LEAD_MS ? first + every : first
  return { at: at % CYCLE, every }
}

function queue(write: () => unknown, when: Bars | { bar: number } = 1) {
  if (queueing) throw new Error('queue cannot run inside another queue')
  if (typeof write !== 'function')
    throw new Error(
      "queue takes a function that writes, as bender.queue(() => bender.drums({ kick: 'x...' }), 4)",
    )
  const { at, every } = cueAt(when)
  const taken: Queued = {
    cut: {},
    glide: {},
    seconds: 0,
    force: new Set(),
    hits: [],
  }
  queueing = taken
  try {
    if (write() instanceof Promise)
      throw new Error(
        'queue takes a plain function; writes after an await are not queued',
      )
  } finally {
    queueing = null
  }
  const now = !counting()
  return engine.cue(taken.cut, at, every).then(tick => {
    if (tick !== null) {
      land(taken.glide, taken.seconds, taken.force)
      for (const fire of taken.hits) fire()
    }
    return {
      landed:
        tick === null
          ? 'dropped by unqueue'
          : now
            ? 'at once, as the kit is not running'
            : `on bar ${Math.floor(tick / STEPS)}`,
      ...position(),
    }
  })
}

function changed(c: Controls) {
  return ALL_SLIDERS.filter(
    def =>
      !EDITOR_KEYS.has(def.key) && c[def.key] !== DEFAULT_CONTROLS[def.key],
  )
}

function tuneLines(c: Controls) {
  const len = asTuneLen(c.tuneLen)
  return TUNE_LANE_KEYS.map((_, lane) => laneSteps(c, lane).slice(0, len))
    .filter((steps, lane) => lane === 0 || steps.some(isNote))
    .map(laneText)
}

const LINE_TARGETS = [
  {
    name: 'Growler',
    level: 'monoLevel',
    mute: 'monoMute',
    gate: 'monoKeyGate',
  },
  { name: 'Glint', level: 'fmLevel', mute: 'fmMute', gate: 'fmKeyGate' },
  { name: 'Parlor', level: 'pcmLevel', mute: 'pcmMute', gate: 'pcmKeyGate' },
] as const satisfies readonly {
  name: string
  level: ControlKey
  mute: ControlKey
  gate: ControlKey
}[]

function playedBy(c: Controls) {
  return Object.fromEntries(
    LINE_TARGETS.filter(
      t => c[t.level] > 0 && c[t.mute] === 0 && followsGate(c[t.gate]),
    ).map(t => [
      t.name,
      gateLane(c[t.gate]) < 0 ? 'every lane' : show(t.gate, c[t.gate]),
    ]),
  )
}

const HOWLER_TARGET = {
  name: 'Howler',
  level: 'leadLevel',
  mute: 'leadMute',
  gate: 'leadKeyGate',
} as const

// A card's footage moves every note it plays, and an agent hears none of it:
// listen names the written notes. Growler's stock 32′ puts a line written at A2
// down at 27 Hz; Howler's 8′ plays it as written.
function sounds(c: Controls, steps: readonly number[], stage: CardStage) {
  const notes = steps.filter(isNote)
  const elsewhere = stage === 'Growler' && Math.round(c.monoSeqTo) !== 0
  if (notes.length === 0 || elsewhere) return undefined
  const footage = keyOf(stage, 'Range1')
  const shift = 12 * Math.round(c[footage])
  const lo = semitoneName(Math.min(...notes) + shift)
  const hi = semitoneName(Math.max(...notes) + shift)
  return `${lo} to ${hi}, at ${stage}'s ${show(footage, c[footage])} osc 1 range`
}

function lineOf(c: Controls, stage: CardStage = 'Growler') {
  const card = CARDS[stage]
  const [on, sync] = [keyOf(stage, 'SeqOn'), keyOf(stage, 'SeqSync')]
  const len = asTuneLen(c[keyOf(stage, 'SeqLen')])
  const flags = (keys: readonly [ControlKey, ControlKey]) =>
    seqFlagsText(c[keys[0]], c[keys[1]], len)
  const steps = card.steps.slice(0, len).map(k => c[k])
  return {
    line: laneText(steps),
    sounds: sounds(c, steps, stage),
    accent: flags(card.accents),
    slide: flags(card.slides),
    on: show(on, c[on]),
    ...(stage === 'Growler' && {
      'plays on': show('monoSeqTo', c.monoSeqTo),
    }),
    sync: show(sync, c[sync]),
  }
}

const lineRuns = (c: Controls, stage: CardStage) =>
  engine.lineRuns(c, c[keyOf(stage, 'SeqSync')])

// What stands between the line and the speaker, in the words of the controls
// that fix it.
function lineWarnings(c: Controls, stage: CardStage = 'Growler') {
  const target =
    stage === 'Howler'
      ? HOWLER_TARGET
      : (LINE_TARGETS[Math.round(c.monoSeqTo)] ?? LINE_TARGETS[0])
  const notes: string[] = []
  if (c[target.level] === 0)
    notes.push(`${target.level} is 0, so ${target.name} is silent`)
  if (c[target.mute] !== 0)
    notes.push(`${target.mute} is on, so ${target.name} is muted`)
  if (followsGate(c[target.gate]) && engine.songPlaying.get())
    notes.push(
      `${target.name} also plays the toy's tune; set ${target.gate}: 'no, cut' to hear the line alone`,
    )
  if (!lineRuns(c, stage))
    notes.push(
      c[keyOf(stage, 'SeqSync')] === 0
        ? "unsynced, the line runs with the toy's song, which is stopped; bender.play('song') starts both"
        : 'the kit clocks the line and is stopped; bender.play() starts both',
    )
  return notes
}

const lineState = (c: Controls, stage: CardStage) =>
  `${lineRuns(c, stage) ? 'playing' : 'stopped'} on ${stage === 'Howler' ? 'Howler' : show('monoSeqTo', c.monoSeqTo)}`

const isHowler = (on: Value | undefined) =>
  typeof on === 'string' && on.trim().toLowerCase() === 'howler'

const barsText = (bars: number) => `${bars}:${bars}`

function drumLines(c: Controls) {
  const rows: Record<string, string> = {}
  for (const row of GRID_ROWS) {
    const maybe = row.maybe ? c[row.maybe] : 0
    const ghost = row.ghost ? c[row.ghost] : 0
    if (c[row.key] === 0 && maybe === 0 && ghost === 0) continue
    rows[row.label] = rowText(c[row.key], maybe, c[row.len], ghost)
  }
  for (const [v, key] of COND_KEYS.entries())
    if (c[key] !== 0)
      rows[`${DRUM_VOICES[v]!.label} bars`] = CONDS[asCond(c[key])]!
  for (const [name, row] of Object.entries(CELL_ROWS))
    if (row.keys.some(k => c[k] !== 0))
      rows[name] = row.keys.map(k => row.write(c[k])).join('')
  if (c.drumEventEvery !== 0)
    rows['event every'] = barsText(EVENT_EVERY[asEventEvery(c.drumEventEvery)]!)
  return rows
}

const squash = (name: string) => name.toLowerCase().replace(/\s/g, '')
const isCellRow = (name: string): name is CellRow =>
  Object.hasOwn(CELL_ROWS, name)

const audioState = () =>
  engine.running.get()
    ? 'running'
    : 'suspended: click an empty area of the page, then call bender.start() again'

const presetName = (c: Controls) =>
  presetNameFor(c) ??
  (CONTROL_KEYS.every(k => c[k] === DEFAULT_CONTROLS[k]) ? 'stock' : 'modified')

const noteNames = (notes: Set<number>) =>
  [...notes].toSorted((a, b) => a - b).map(semitoneName)

const decibels = (x: number) =>
  x > 1e-5 ? `${(20 * Math.log10(x)).toFixed(1)} dBFS` : 'silent'

function link() {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#${boardHash('#set=', engine.controls.get())}`
}

function summary() {
  const c = engine.controls.get()
  const h = engine.history.get()
  const busy = [
    engine.morphProgress.get() !== null && 'gliding',
    engine.hunting.get() && 'hunting',
    engine.drifting.get() && 'drifting',
    engine.recording.get() && 'recording',
  ].filter(Boolean)
  return {
    audio: audioState(),
    song: engine.songPlaying.get()
      ? `playing ${show('chipTune', c.chipTune)}${c.chipLevel === 0 ? ', silent at chipLevel 0' : ''}`
      : 'stopped',
    line: c.monoSeqOn === 0 ? 'off' : lineState(c, 'Growler'),
    lead: c.leadSeqOn === 0 ? 'off' : lineState(c, 'Howler'),
    drums: engine.drumsPlaying.get()
      ? `playing at ${show('drumBpm', c.drumBpm)}`
      : 'stopped',
    preset: presetName(c),
    changed: changed(c).length,
    busy: busy.length > 0 ? busy.join(', ') : 'idle',
    undo: h.past.length,
    redo: h.future.length,
  }
}

const PLAYERS = [
  { name: 'Plinky', notes: engine.chipNotes },
  { name: 'Glint', notes: engine.fmNotes },
  { name: 'Parlor', notes: engine.pcmNotes },
  { name: 'Growler', notes: engine.monoNotes },
  { name: 'Howler', notes: engine.leadNotes },
]

async function listen(ms = 1500) {
  if (!engine.running.get()) return { audio: audioState() }
  const span = Math.min(
    Math.max(Number.isNaN(ms) ? 1500 : ms, 100),
    MAX_LISTEN_MS,
  )
  const start = engine.meter.get()
  const perSecond = engine.sampleRate() / BLOCK / METER_EVERY
  let meters = 0
  let peak = 0
  let duck = 0
  let rail = 1
  let arc = 0
  let hits = 0
  let sounding = 0
  const loudest = CHANNELS.map(() => 0)
  const strays = new Set<string>()
  const played = PLAYERS.map(() => new Set<number>())
  // Each meter message carries peaks since the previous one, so the first
  // message after subscribing covers audio from before this call.
  let first = true
  const off = engine.meter.subscribe(() => {
    if (first) {
      first = false
      return
    }
    const m = engine.meter.get()
    meters++
    peak = Math.max(peak, m.peak)
    duck = Math.max(duck, m.duck)
    rail = Math.min(rail, m.rail)
    arc = Math.max(arc, m.arc)
    hits |= m.hits
    for (const name of strayNames(m.strays)) strays.add(name)
    for (const [i, channel] of CHANNELS.entries()) {
      const tap = m.taps[channel.tap] ?? 0
      if (tap > SOUND_FLOOR) sounding |= 1 << i
      loudest[i] = Math.max(loudest[i]!, tap)
    }
    for (const [i, player] of PLAYERS.entries())
      for (const n of player.notes.get()) played[i]!.add(n)
  })
  await new Promise(resolve => setTimeout(resolve, span))
  off()
  if (meters === 0)
    return {
      audio: audioState(),
      meters: 'no meter messages arrived from the audio worklet',
    }
  const heard = CHANNELS.flatMap((c, i) =>
    sounding & (1 << i) ? [{ name: c.name, peak: loudest[i]! }] : [],
  )
  const sources = heard.map(c => c.name)
  // A machine at level 0 still runs its tune, and its notes would read as
  // music nobody can hear.
  const notes = Object.fromEntries(
    PLAYERS.flatMap((player, i) =>
      sources.includes(player.name) && played[i]!.size > 0
        ? [[player.name, noteNames(played[i]!)]]
        : [],
    ),
  )
  return {
    seconds: span / 1000,
    // What the worklet actually delivered, against what it owes. It posts one
    // meter every METER_EVERY blocks from inside its render, so the rate is the
    // one reading on the board that says whether the audio thread is keeping
    // up: short of its own budget means blocks went unrendered, which is a hole
    // in the sound rather than anything the panel did. Over budget means the
    // page's own thread stalled and then took a backlog at once, which an agent
    // otherwise reads as the meters being broken.
    meters: `${meters} in ${(span / 1000).toFixed(1)}s, ${perSecond.toFixed(1)}/s expected${meters > perSecond * (span / 1000) * BACKLOG ? '; more than due, so the page lagged and delivered a backlog, and the readings span more time than asked' : ''}`,
    peak: decibels(peak),
    limiter: `${(-20 * Math.log10(1 - duck)).toFixed(2)} dB gain reduction`,
    rail: Number(rail.toFixed(2)),
    reboots: engine.meter.get().reboots - start.reboots,
    sources,
    sourcePeaks: Object.fromEntries(heard.map(c => [c.name, decibels(c.peak)])),
    notes,
    drumHits: DRUM_VOICES.filter((_, v) => hits & (1 << v)).map(v => v.label),
    wander: [...strays],
    arc: Number(arc.toFixed(2)),
  }
}

function rawBenderApi() {
  return {
    help: HELP,

    guide(topic = '') {
      if (!isTopic(topic))
        throw new Error(
          `no guide topic '${topic}'; topics: ${Object.keys(GUIDE).join(', ')}`,
        )
      return GUIDE[topic]
    },

    summary,

    board() {
      const c = engine.controls.get()
      return {
        preset: presetName(c),
        controls: changed(c).map(
          def =>
            `${def.key} = ${formatValue(def, c[def.key])}  (${groupOf(def.key)}: ${def.label}, default ${formatValue(def, DEFAULT_CONTROLS[def.key])})`,
        ),
        song: show('chipTune', c.chipTune),
        tune: tuneLines(c),
        drums: drumLines(c),
        ...(c.monoSeqOn !== 0 && { line: lineOf(c) }),
        ...(c.leadSeqOn !== 0 && { lead: lineOf(c, 'Howler') }),
      }
    },

    find(query = '', limit = 8) {
      if (query.trim() === '')
        return GROUPS.map(g => `${g.name} (${g.sliders.length} controls)`)
      const c = engine.controls.get()
      return search(query, limit).map(
        def =>
          `${def.key} = ${formatValue(def, c[def.key])}  ${groupOf(def.key)}: ${def.label}${def.role ? ` (${def.role})` : ''}, ${range(def)}. ${firstSentence(def.help)}`,
      )
    },

    describe(key: string) {
      const def = isControlKey(key) ? SLIDER_BY_KEY.get(key) : undefined
      if (!def) {
        const group = GROUPS.find(
          g => g.name.toLowerCase() === key.toLowerCase(),
        )
        throw new Error(
          group
            ? `'${key}' is a group; bender.find('${group.name}') lists its controls`
            : unknownKey(key),
        )
      }
      const c = engine.controls.get()
      return {
        key: def.key,
        group: groupOf(def.key),
        label: def.label,
        value: formatValue(def, c[def.key]),
        default: formatValue(def, DEFAULT_CONTROLS[def.key]),
        range: def.choices ? undefined : range(def),
        step: def.step,
        choices: def.choices?.join(' | '),
        help: def.help,
      }
    },

    set(
      changes: Record<string, Value> | string,
      ...rest: [seconds?: number] | [value: Value, seconds?: number]
    ): SetReport {
      if (typeof changes === 'string')
        return this.set({ [changes]: rest[0] ?? '' }, rest[1] ?? 0)
      const seconds = Number(rest[0] ?? 0)
      const applied: Record<string, string> = {}
      const adjusted: string[] = []
      const unknown: string[] = []
      const failed: string[] = []
      const patch: Partial<Controls> = {}
      const named = new Set<ControlKey>()
      for (const [name, asked] of Object.entries(changes)) {
        if (!isControlKey(name)) {
          unknown.push(unknownKey(name))
          continue
        }
        try {
          const want = numberFor(name, asked)
          const got = coerceControl(name, want)
          if (got !== want)
            adjusted.push(`${name}: asked ${asked}, set ${show(name, got)}`)
          patch[name] = got
          named.add(name)
          applied[name] = show(name, got)
        } catch (e) {
          failed.push(`${name}: ${errorText(e)}`)
        }
      }
      land(patch, seconds, named)
      return { applied, adjusted, unknown, failed }
    },

    presets(query = '') {
      const lower = query.toLowerCase()
      return PRESETS.filter(
        p =>
          p.name.toLowerCase().includes(lower) ||
          p.blurb.toLowerCase().includes(lower),
      ).map(p => `${p.name}: ${p.blurb}`)
    },

    load(name: string, seconds = 0) {
      const lower = name.toLowerCase()
      if (lower === '')
        throw new Error('name a preset; bender.presets() lists them')
      const preset =
        PRESETS.find(p => p.name.toLowerCase() === lower) ??
        PRESETS.find(p => p.name.toLowerCase().startsWith(lower))
      if (!preset)
        throw new Error(
          `no preset named '${name}'; bender.presets() lists all ${PRESETS.length}`,
        )
      land(applyPreset(preset, engine.controls.get()), seconds)
      if (preset.shelf) void engine.fillFromShelf(preset.shelf)
      return { loaded: preset.name, blurb: preset.blurb, ...summary() }
    },

    reset(seconds = 0) {
      land({ ...DEFAULT_CONTROLS }, seconds)
      return summary()
    },

    undo() {
      engine.undo(0)
      engine.flush()
      return summary()
    },

    redo() {
      engine.redo(0)
      engine.flush()
      return summary()
    },

    tune(lanes: string | string[]) {
      const texts = typeof lanes === 'string' ? [lanes] : lanes
      if (texts.length === 0 || texts.length > TUNE_LANES)
        throw new Error(`tune accepts 1 to ${TUNE_LANES} strings`)
      const parsed = texts.map((text, lane) => {
        try {
          return parseLane(text)
        } catch (e) {
          throw new Error(`lane ${lane + 1}: ${errorText(e)}`, { cause: e })
        }
      })
      const len = Math.max(...parsed.map(steps => steps.length))
      if (len === 0) throw new Error('the tune is empty')
      const patch: Partial<Controls> = { chipTune: YOURS, tuneLen: len }
      for (const [lane, keys] of TUNE_LANE_KEYS.entries())
        for (const [i, key] of keys.entries())
          patch[key] = parsed[lane]?.[i] ?? REST
      if (parsed.length > 1) patch.tunePoly = 1
      land(patch, 0)
      const c = engine.controls.get()
      return {
        tune: tuneLines(c),
        rate: show('tuneRate', c.tuneRate),
        lifted: show('tuneLift', c.tuneLift),
        'played by': playedBy(c),
      }
    },

    line(
      text: string,
      opts: { accent?: string; slide?: string; sync?: Value; on?: Value } = {},
    ) {
      const stage: CardStage = isHowler(opts.on) ? 'Howler' : 'Growler'
      const card = CARDS[stage]
      let steps: number[]
      try {
        steps = parseLane(text)
      } catch (e) {
        const low =
          stage === 'Growler' && errorText(e).includes('outside the range')
        throw new Error(
          low
            ? `${errorText(e)}; the line names keys, and Growler's stock 32′ range sounds each two octaves lower, so A3 sounds A1`
            : errorText(e),
          { cause: e },
        )
      }
      if (steps.length === 0) throw new Error('the line is empty')
      const sync = keyOf(stage, 'SeqSync')
      const patch: Partial<Controls> = {}
      patch[keyOf(stage, 'SeqOn')] = 1
      patch[keyOf(stage, 'SeqLen')] = steps.length
      for (const [i, key] of card.steps.entries()) patch[key] = steps[i] ?? REST
      for (const [name, keys] of [
        ['accent', card.accents],
        ['slide', card.slides],
      ] as const) {
        const flags = opts[name]
        if (flags === undefined) continue
        try {
          ;[patch[keys[0]], patch[keys[1]]] = parseSeqFlags(flags)
        } catch (e) {
          throw new Error(`${name}: ${errorText(e)}`, { cause: e })
        }
      }
      const c = engine.controls.get()
      const synced = opts.sync ?? (c[sync] === 0 ? 'sixteenths' : null)
      if (synced !== null) patch[sync] = numberFor(sync, synced)
      if (opts.on !== undefined && stage === 'Growler')
        patch.monoSeqTo = numberFor('monoSeqTo', opts.on)
      land(patch, 0)
      const now = engine.controls.get()
      return { ...lineOf(now, stage), warnings: lineWarnings(now, stage) }
    },

    drums(rows: Record<string, string | number>) {
      const patch: Partial<Controls> = {}
      const cells: [CellRow, string][] = []
      for (const [name, value] of Object.entries(rows)) {
        const wanted = squash(name)
        // Agents reach for the tempo here more often than not.
        if (wanted === 'bpm' || wanted === 'drumbpm') {
          patch.drumBpm = coerceControl('drumBpm', numberFor('drumBpm', value))
          continue
        }
        const text = String(value)
        if (isCellRow(wanted)) {
          cells.push([wanted, text])
          continue
        }
        const everyBar = text.trim() === '' || text.trim() === 'off'
        if (wanted === 'eventevery') {
          const at = everyBar
            ? 0
            : EVENT_EVERY.findIndex(b => barsText(b) === text.trim())
          if (at < 0)
            throw new Error(
              `event every takes ${EVENT_EVERY.map(barsText).join(', ')}`,
            )
          patch.drumEventEvery = at
          continue
        }
        if (wanted.endsWith('bars')) {
          const v = DRUM_VOICES.findIndex(
            d => squash(d.label) === wanted.slice(0, -4),
          )
          const at = everyBar
            ? 0
            : (CONDS as readonly string[]).indexOf(text.trim())
          if (v < 0 || at < 0)
            throw new Error(
              `'${name}' takes a voice and one of ${CONDS.join(', ')}, as { 'snare bars': '!4:4' }`,
            )
          patch[COND_KEYS[v]!] = at
          continue
        }
        const row = GRID_ROWS.find(r => squash(r.label) === wanted)
        if (!row)
          throw new Error(
            `no drum row named '${name}'; rows: ${GRID_ROWS.map(r => r.label).join(', ')}, ${Object.keys(CELL_ROWS).join(', ')}, event every, and a voice's bars`,
          )
        const { mask, maybe, ghost, len, ratchets } = parseRow(text)
        if ((maybe | ghost) !== 0 && !row.maybe)
          throw new Error(`the ${row.label} row accepts only 'x' and '.'`)
        patch[row.key] = mask
        if (row.maybe) patch[row.maybe] = maybe
        if (row.ghost) patch[row.ghost] = ghost
        patch[row.len] = len
        for (const [s, count] of Object.entries(ratchets))
          patch[RATCHET_KEYS[Number(s)]!] = RATCHETS.indexOf(count)
      }
      for (const [row, text] of cells) {
        const values = parseCells(row, text)
        for (const [s, key] of CELL_ROWS[row].keys.entries())
          patch[key] = values[s]!
      }
      land(patch, 0)
      return { drums: drumLines(engine.controls.get()) }
    },

    hit(
      what: string | readonly string[],
      at: { x?: number; y?: number; gain?: number } = {},
    ) {
      const names = (typeof what === 'string' ? [what] : what).map(squash)
      const gain = toUnit(at.gain ?? 1)
      let bits = 0
      const struck: Struck[] = []
      for (const name of names) {
        const voice = DRUM_VOICES.findIndex(v => squash(v.label) === name)
        if (isStruck(name)) struck.push(name)
        else if (voice >= 0) bits |= 1 << voice
        else
          throw new Error(
            `nothing to hit named '${name}'; hit takes sheet, bottle or a kit voice: ${DRUM_VOICES.map(v => v.label).join(', ')}`,
          )
      }
      const fire = () => {
        for (const target of struck) {
          const home = STRUCK_HOME[target]
          strike(target, toUnit(at.x ?? home.x), toUnit(at.y ?? home.y), gain)
        }
        engine.drumHit(bits, gain)
      }
      if (queueing) queueing.hits.push(fire)
      else fire()
      const c = engine.controls.get()
      const silent = CHANNELS.filter(
        ch =>
          c[ch.key] === 0 &&
          (ch.key === 'drumLevel'
            ? bits !== 0
            : struck.some(t => t === squash(ch.name))),
      )
      return {
        hit: names,
        ...(queueing && {
          lands: 'when the queue lands, within about 20 ms of its bar',
        }),
        warnings: [
          ...(engine.running.get() ? [] : [audioState()]),
          ...silent.map(ch => `${ch.key} is 0, so ${ch.name} is silent`),
        ],
      }
    },

    speak(text: string, opts: { struck?: string; repeat?: boolean } = {}) {
      const struck =
        opts.struck === undefined
          ? undefined
          : ['off', ...DRUM_VOICES.map(v => v.label), 'any hit'].findIndex(
              v => squash(v) === squash(opts.struck ?? ''),
            )
      if (struck === -1)
        throw new Error(
          `speak's struck takes off, a kit voice or 'any hit': ${DRUM_VOICES.map(v => v.label).join(', ')}`,
        )
      const c = engine.controls.get()
      land(
        {
          ...phraseControls(text),
          ...(c.talkLevel === 0 && { talkLevel: SPEAK_LEVEL }),
          ...(struck !== undefined && { talkStruck: struck }),
          ...(opts.repeat !== undefined && { talkRepeat: opts.repeat ? 1 : 0 }),
        },
        0,
      )
      if (queueing) queueing.hits.push(talk)
      else talk()
      return {
        phrase: phraseText(phraseOf(engine.controls.get())),
        ...(queueing && { lands: 'when the queue lands' }),
        warnings: engine.running.get() ? [] : [audioState()],
      }
    },

    async start() {
      // AudioContext.resume() stays pending until the page gets a gesture.
      await Promise.race([
        engine.start(),
        new Promise(resolve => setTimeout(resolve, START_WAIT_MS)),
      ])
      return audioState()
    },

    play(which: 'both' | 'song' | 'drums' = 'both') {
      if (!['both', 'song', 'drums'].includes(which))
        throw new Error(`play accepts 'both', 'song' or 'drums'`)
      // A demo song starts only when asked for by name: play() is how an agent
      // starts a groove, and the toy's lullaby over it is never what was meant.
      const written = engine.controls.get().chipTune === YOURS
      if (which === 'song' || (which === 'both' && written))
        engine.setSongPlaying(true)
      if (which !== 'song') engine.setDrumsPlaying(true)
      return summary()
    },

    stop() {
      engine.setSongPlaying(false)
      engine.setDrumsPlaying(false)
      return summary()
    },

    listen,
    link,
    position,
    next: nextDownbeat,
    queue,

    unqueue() {
      return { dropped: engine.uncue() }
    },
  }
}

export type RawBenderApi = ReturnType<typeof rawBenderApi>

export const createBenderApi = () => recorded(rawBenderApi())

export type BenderApi = ReturnType<typeof createBenderApi>

export function exposeBenderApi() {
  window.bender = createBenderApi()
  console.info(
    'window.bender is a scripting API for this page: read bender.help, then call bender.summary()',
  )
}
