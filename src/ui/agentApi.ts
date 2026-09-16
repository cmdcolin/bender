import {
  CONTROL_KEYS,
  DEFAULT_CONTROLS,
  isControlKey,
  type ControlKey,
  type Controls,
} from '../controls'
import { DRUM_VOICES, GRID_ROWS, parseRow, rowText } from '../drums'
import { YOURS } from '../dsp/stages/roms'
import { engine } from '../engine/engine'
import { STEM_FILES } from '../engine/params'
import { semitoneName } from '../notes'
import {
  asTuneLen,
  isNote,
  laneSteps,
  laneText,
  parseLane,
  REST,
  TUNE_LANE_KEYS,
  TUNE_LANES,
} from '../tune'
import {
  ALL_SLIDERS,
  EDITOR_KEYS,
  GROUP_BY_KEY,
  GROUPS,
  SLIDER_BY_KEY,
  type SliderDef,
} from './controls'
import { applyPreset, PRESETS, presetNameFor } from './presets'
import { coerceControl, encodeControls } from './share'
import { formatValue } from './slider-scale'

const HELP = `window.bender controls bender, a circuit-bent toy keyboard, drum machine and effects chain built on Web Audio. Each call reads or changes the controls the panel shows. A person can move a control between two of your calls, so read the state again before relying on it.

Reading state: bender.summary() reports whether audio is running, what is playing, the preset and the undo depth. bender.board() lists each control that differs from its default as "key = value", the melody and drum pattern as text, and a link to the board. bender has about 250 controls. bender.find('starve rail') searches control keys, labels, groups and help text, and bender.find() with no argument lists the groups. bender.describe('chipStarve') returns one control's range, unit, choices and help.

Changing controls: bender.set({ chipStarve: 0.8, chipTone: 'reed' }, seconds?) accepts numbers, choice names, and unique prefixes of choice names. It returns { applied, adjusted, unknown, failed }: adjusted lists values clamped to the range or rounded to the step, unknown lists keys that match no control, and failed lists values set could not read. set leaves the controls in unknown and failed unchanged. With seconds > 0 the controls glide to the new values on animation frames, and the browser pauses animation frames in a hidden tab. Each call to set adds one undo step: bender.undo() and bender.redo(). bender.presets(search?) lists the presets, bender.load('dying toy', seconds?) loads one, and bender.reset(seconds?) restores the defaults.

Writing music: bender.tune('C4 E4 G4 ~ . C5 | ...') writes the melody memory, one token per step: a note name from C2 to C#7, '.' for a rest, or '~' to hold the previous note, up to 32 steps. tune also switches the chip to play the melody memory, at tuneRate steps per second. An array of up to three strings writes chords, one string per lane. bender.drums({ kick: 'x...x...x...x...', hat: '..x...x...x...x.' }) writes the named rows: kick, snare, hat, clap, tom, bell, open hat, cymbal and accent. 'x' is a hit, '?' is a hit with probability drumChance, and '.' is a rest. The string length sets the row's loop length, an empty string clears the row, and drums leaves the rows missing from the call unchanged. drumBpm sets the tempo.

Starting audio: the browser keeps the AudioContext suspended until the page receives a click or key press. await bender.start() returns 'running' or a suspended message; while suspended, click anywhere on the page and call start again. bender.play('both' | 'song' | 'drums') starts the sequencers, and bender.stop() stops both.

Measuring sound: a screenshot shows the panel and the scope and contains no measurement of the sound. await bender.listen(ms) reads the meters for ms milliseconds (default 1500, maximum 20000) and returns the peak level in dBFS, the largest limiter gain reduction, the lowest level of the toy supply rail (1 is full batteries), the number of watchdog reboots, the sources with signal, the notes each chip played and the drum voices hit.

bender.link() returns a #set= URL that loads the current board in any tab.`

const MAX_LISTEN_MS = 20000
const START_WAIT_MS = 1000
const CHOICES_SHOWN = 8

declare global {
  interface Window {
    bender?: BenderApi
  }
}

type Value = number | string

const groupOf = (key: ControlKey) => GROUP_BY_KEY.get(key) ?? 'board'

const show = (key: ControlKey, value: number) => {
  const def = SLIDER_BY_KEY.get(key)
  return def ? formatValue(def, value) : String(value)
}

const firstSentence = (text: string) =>
  /^.*?[.!?](\s|$)/.exec(text)?.[0].trim() ?? text

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function range(def: SliderDef) {
  if (def.choices) {
    const more = def.choices.length - CHOICES_SHOWN
    const listed = def.choices.slice(0, CHOICES_SHOWN).join(' | ')
    return `choices ${listed}${more > 0 ? ` | and ${more} more` : ''}`
  }
  return `${def.min}..${def.max}${def.unit ? ` ${def.unit}` : ''}`
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

function search(query: string, limit: number) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return ALL_SLIDERS.map(def => {
    const scores = words.map(w => score(def, w))
    return {
      def,
      score: scores.includes(0) ? 0 : scores.reduce((a, b) => a + b, 0),
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

function land(
  patch: Partial<Controls>,
  seconds: number,
  force?: ReadonlySet<ControlKey>,
) {
  const board = engine.controls.get()
  const changes = CONTROL_KEYS.some(
    k => patch[k] !== undefined && patch[k] !== board[k],
  )
  if (!changes) return
  engine.morphTo({ ...board, ...patch }, Math.max(seconds, 0), force)
  engine.flush()
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

function drumLines(c: Controls) {
  const rows: Record<string, string> = {}
  for (const row of GRID_ROWS) {
    const maybe = row.maybe ? c[row.maybe] : 0
    if (c[row.key] === 0 && maybe === 0) continue
    rows[row.label] = rowText(c[row.key], maybe, c[row.len])
  }
  return rows
}

const audioState = () =>
  engine.running.get()
    ? 'running'
    : 'suspended: click anywhere on the page, then call bender.start() again'

const presetName = (c: Controls) =>
  presetNameFor(c) ??
  (CONTROL_KEYS.every(k => c[k] === DEFAULT_CONTROLS[k]) ? 'stock' : 'modified')

const noteNames = (notes: Set<number>) =>
  [...notes].toSorted((a, b) => a - b).map(semitoneName)

const decibels = (x: number) =>
  x > 1e-5 ? `${(20 * Math.log10(x)).toFixed(1)} dBFS` : 'silent'

function link() {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#set=${encodeControls(engine.controls.get())}`
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
      ? `playing ${show('chipTune', c.chipTune)}`
      : 'stopped',
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

async function listen(ms = 1500) {
  if (!engine.running.get()) return { audio: audioState() }
  const span = Math.min(Math.max(ms, 100), MAX_LISTEN_MS)
  const start = engine.meter.get()
  let meters = 0
  let peak = 0
  let duck = 0
  let rail = 1
  let hits = 0
  let sounding = 0
  const toy = new Set<number>()
  const fm = new Set<number>()
  const off = engine.meter.subscribe(() => {
    const m = engine.meter.get()
    meters++
    peak = Math.max(peak, m.peak)
    duck = Math.max(duck, m.duck)
    rail = Math.min(rail, m.rail)
    hits |= m.hits
    sounding |= engine.sounding.get()
    for (const n of engine.chipNotes.get()) toy.add(n)
    for (const n of engine.fmNotes.get()) fm.add(n)
  })
  await new Promise(resolve => setTimeout(resolve, span))
  off()
  if (meters === 0)
    return {
      audio: audioState(),
      meters: 'no meter messages arrived from the audio worklet',
    }
  return {
    seconds: span / 1000,
    peak: decibels(peak),
    limiter: `${(-20 * Math.log10(1 - duck)).toFixed(2)} dB gain reduction`,
    rail: Number(rail.toFixed(2)),
    reboots: engine.meter.get().reboots - start.reboots,
    sources: STEM_FILES.filter((_, k) => sounding & (1 << k)),
    toyNotes: noteNames(toy),
    fmNotes: noteNames(fm),
    drumHits: DRUM_VOICES.filter((_, v) => hits & (1 << v)).map(v => v.label),
  }
}

export function createBenderApi() {
  return {
    help: HELP,
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
        link: link(),
      }
    },

    find(query = '', limit = 12) {
      if (query.trim() === '')
        return GROUPS.map(g => `${g.name} (${g.sliders.length} controls)`)
      const c = engine.controls.get()
      return search(query, limit).map(
        def =>
          `${def.key} = ${formatValue(def, c[def.key])}  ${groupOf(def.key)}: ${def.label}, ${range(def)}. ${firstSentence(def.help)}`,
      )
    },

    describe(key: string) {
      const def = isControlKey(key) ? SLIDER_BY_KEY.get(key) : undefined
      if (!def) throw new Error(unknownKey(key))
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

    set(changes: Record<string, Value>, seconds = 0) {
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
          failed.push(`${name}: ${message(e)}`)
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
      const preset =
        PRESETS.find(p => p.name.toLowerCase() === lower) ??
        PRESETS.find(p => p.name.toLowerCase().startsWith(lower))
      if (!preset)
        throw new Error(
          `no preset named '${name}'; bender.presets() lists all ${PRESETS.length}`,
        )
      land(applyPreset(preset, engine.controls.get()), seconds)
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
          throw new Error(`lane ${lane + 1}: ${message(e)}`, { cause: e })
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
      return { tune: tuneLines(c), rate: show('tuneRate', c.tuneRate) }
    },

    drums(rows: Record<string, string>) {
      const patch: Partial<Controls> = {}
      for (const [name, text] of Object.entries(rows)) {
        const wanted = name.toLowerCase().replace(/\s/g, '')
        const row = GRID_ROWS.find(r => r.label.replace(/\s/g, '') === wanted)
        if (!row)
          throw new Error(
            `no drum row named '${name}'; rows: ${GRID_ROWS.map(r => r.label).join(', ')}`,
          )
        const { mask, maybe, len } = parseRow(text)
        if (maybe !== 0 && !row.maybe)
          throw new Error(`the ${row.label} row accepts only 'x' and '.'`)
        patch[row.key] = mask
        if (row.maybe) patch[row.maybe] = maybe
        patch[row.len] = len
      }
      land(patch, 0)
      return { drums: drumLines(engine.controls.get()) }
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
      if (which !== 'drums') engine.setSongPlaying(true)
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
  }
}

export type BenderApi = ReturnType<typeof createBenderApi>

export function exposeBenderApi() {
  window.bender = createBenderApi()
  console.info(
    'window.bender is a scripting API for this page: read bender.help, then call bender.summary()',
  )
}
