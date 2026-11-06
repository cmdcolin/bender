import { isControlKey, type ControlKey } from '../controls.ts'
import { engine } from '../engine/engine.ts'
import { createStore } from '../listeners.ts'
import { createTrace, laneKeys } from './trace.ts'

import type { RawBenderApi } from './agentApi.ts'

export const ACTIVITY_LINES = 40
const TEXT_CHARS = 32
const BODY_CHARS = 100

export interface Bend {
  key: ControlKey
  value: string
}

export interface ActivityLine {
  id: number
  at: number
  text: string
  said: boolean
  bends: readonly Bend[]
  times: number
}

export interface Activity {
  headline: string
  lines: readonly ActivityLine[]
}

export const activity = createStore<Activity>({ headline: '', lines: [] })

export const trace = createTrace(engine.controls.get())

engine.controls.subscribe(() =>
  trace.controls(engine.controls.get(), Date.now()),
)

engine.meter.subscribe(() => {
  if (activity.get().lines.length > 0) {
    const at = Date.now()
    trace.meter(engine.meter.get(), at)
    trace.prune(at)
  }
})

activity.subscribe(() =>
  trace.follow(laneKeys(activity.get().lines), Date.now()),
)

const FRESH_MS = 1000
const REPEAT_MS = 3000

/** Calls `fn` once for each line the activity gains from now on, oldest first,
    and for any line already there that is under a second old. */
export function onFreshLines(fn: (line: ActivityLine) => void) {
  let seen = -1
  const check = () => {
    const now = Date.now()
    const { lines } = activity.get()
    const fresh = lines.filter(l => l.id > seen && now - l.at < FRESH_MS)
    seen = Math.max(seen, lines[0]?.id ?? -1)
    for (const line of fresh.toReversed()) fn(line)
  }
  check()
  return activity.subscribe(check)
}

let nextId = 0

const short = (text: string, chars = TEXT_CHARS) =>
  text.length > chars ? `${text.slice(0, chars - 1)}…` : text

// A call repeated within a few seconds counts up on its line rather than
// pushing the rest of the record off the panel.
function note(text: string, said = false, bends: readonly Bend[] = []) {
  const { headline, lines } = activity.get()
  const at = Date.now()
  const top = lines[0]
  activity.set({
    headline,
    lines:
      top && !said && top.text === text && at - top.at < REPEAT_MS
        ? [{ ...top, at, times: top.times + 1 }, ...lines.slice(1)]
        : [{ id: nextId++, at, text, said, bends, times: 1 }, ...lines].slice(
            0,
            ACTIVITY_LINES,
          ),
  })
}

const glide = (seconds: unknown) => {
  const s = Number(seconds)
  return Number.isFinite(s) && s > 0 ? `  (glide ${s}s)` : ''
}

const pair = ([key, value]: [string, unknown]) =>
  `${key} ${short(String(value)) || '—'}`

const pairs = (entries: [string, unknown][]) =>
  short(entries.map(pair).join(', '), BODY_CHARS)

function after<A extends unknown[], R>(
  run: (...args: A) => R,
  line: (
    result: R,
    ...args: NoInfer<A>
  ) => string | { text: string; bends: readonly Bend[] } | undefined,
) {
  return (...args: A) => {
    const result = run(...args)
    const said = line(result, ...args)
    if (typeof said === 'string') note(said)
    else if (said) note(said.text, false, said.bends)
    return result
  }
}

export function recorded(api: RawBenderApi) {
  return {
    ...api,

    say(text: string) {
      const headline = short(text.trim(), BODY_CHARS)
      activity.set({ ...activity.get(), headline })
      note(headline, true)
      return headline
    },

    set: after(api.set.bind(api), ({ applied }, changes, ...rest) => {
      const entries = Object.entries(applied)
      return entries.length === 0
        ? undefined
        : {
            text: `set ${pairs(entries)}${glide(rest.at(typeof changes === 'string' ? 1 : 0))}`,
            bends: entries.flatMap(([key, value]) =>
              isControlKey(key) ? [{ key, value }] : [],
            ),
          }
    }),

    load: after(
      api.load.bind(api),
      ({ loaded }, _name, seconds = 0) => `load ${loaded}${glide(seconds)}`,
    ),

    reset: after(
      api.reset.bind(api),
      (_summary, seconds = 0) => `reset${glide(seconds)}`,
    ),

    undo: after(api.undo.bind(api), () => 'undo'),

    redo: after(api.redo.bind(api), () => 'redo'),

    tune: after(
      api.tune.bind(api),
      (_result, lanes) =>
        `tune ${short(typeof lanes === 'string' ? lanes : lanes.join(' | '))}`,
    ),

    line: after(
      api.line.bind(api),
      (_result, text, opts = {}) =>
        `line ${[short(text), ...Object.entries(opts).map(pair)].join(', ')}`,
    ),

    drums: after(
      api.drums.bind(api),
      (_result, rows) => `drums ${pairs(Object.entries(rows))}`,
    ),

    play: after(api.play.bind(api), (_summary, which = 'both') =>
      which === 'both' ? 'play' : `play ${which}`,
    ),

    stop: after(api.stop.bind(api), () => 'stop'),

    hit: after(
      api.hit.bind(api),
      (_result, what, _at = {}) =>
        `hit ${typeof what === 'string' ? what : what.join(', ')}`,
    ),

    speak: after(
      api.speak.bind(api),
      ({ phrase }, _text, _opts = {}) => `speak ${short(phrase)}`,
    ),

    queue: after(
      api.queue.bind(api),
      (_landing, _write, when = 1) =>
        `queue the writes below for ${
          typeof when === 'object'
            ? `bar ${when.bar}`
            : when === 1 || when === 'bar'
              ? 'the next bar'
              : when === 'beat'
                ? 'the next beat'
                : `the next bar of ${when}`
        }`,
    ),

    unqueue() {
      const result = api.unqueue()
      note(`unqueue ${result.dropped}`)
      return result
    },

    async start() {
      const state = await api.start()
      if (state === 'running') note('start')
      return state
    },
  }
}
