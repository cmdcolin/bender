import { createStore } from '../listeners.ts'

import type { RawBenderApi } from './agentApi.ts'

export const ACTIVITY_LINES = 40
const TEXT_CHARS = 32
const BODY_CHARS = 100

export interface ActivityLine {
  id: number
  at: number
  text: string
  said: boolean
}

export interface Activity {
  headline: string
  lines: readonly ActivityLine[]
}

export const activity = createStore<Activity>({ headline: '', lines: [] })

let nextId = 0

const short = (text: string, chars = TEXT_CHARS) =>
  text.length > chars ? `${text.slice(0, chars - 1)}…` : text

function note(text: string, said = false) {
  const { headline, lines } = activity.get()
  activity.set({
    headline,
    lines: [{ id: nextId++, at: Date.now(), text, said }, ...lines].slice(
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
  line: (result: R, ...args: NoInfer<A>) => string | undefined,
) {
  return (...args: A) => {
    const result = run(...args)
    const text = line(result, ...args)
    if (text !== undefined) note(text)
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
        : `set ${pairs(entries)}${glide(rest.at(typeof changes === 'string' ? 1 : 0))}`
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
