import { SLIDER_BY_KEY } from './controls/index.ts'
import { toPos } from './slider-scale.ts'

import type { ControlKey, Controls } from '../controls.ts'
import type { ActivityLine } from './activity.ts'

export const TRACE_MS = 12_000
export const TRACE_LANES = 5
const STEPS_PER_BAR = 16
const LEVEL_MS = 80

interface Point {
  at: number
  pos: number
}

export interface Lane {
  key: ControlKey
  label: string
  points: Point[]
}

interface Hit {
  at: number
  voices: number
}

interface Bar {
  at: number
}

interface Level {
  at: number
  peak: number
}

interface MeterReading {
  hits: number
  peak: number
  tick: number
}

export const LANE_COLORS = ['--accent', '--accent2', '--cool', '--mod', '--fg2']

export const laneKeys = (lines: readonly ActivityLine[]) =>
  [
    ...new Set(
      lines.flatMap(line =>
        line.bends.map(b => b.key).filter(key => SLIDER_BY_KEY.has(key)),
      ),
    ),
  ].slice(0, TRACE_LANES)

export function bendColor(
  key: ControlKey,
  lines: readonly ActivityLine[],
  fallback: number,
) {
  const lane = laneKeys(lines).indexOf(key)
  return `var(${LANE_COLORS[(lane < 0 ? fallback : lane) % LANE_COLORS.length]})`
}

const posOf = (key: ControlKey, controls: Controls) => {
  const def = SLIDER_BY_KEY.get(key)
  return def ? Math.min(Math.max(toPos(def, controls[key]), 0), 1) : 0
}

function dropBefore(list: { at: number }[], edge: number) {
  const fresh = list.findIndex(item => item.at >= edge)
  list.splice(0, fresh < 0 ? list.length : fresh)
}

function holdFrom(points: Point[], edge: number) {
  const fresh = points.findIndex(p => p.at >= edge)
  points.splice(0, Math.max((fresh < 0 ? points.length : fresh) - 1, 0))
}

export function createTrace(controls: Controls) {
  let lanes: Lane[] = []
  let before = controls
  let latest = controls
  let bar = -1
  const hits: Hit[] = []
  const levels: Level[] = []
  const bars: Bar[] = []

  return {
    lanes: (): readonly Lane[] => lanes,
    hits: (): readonly Hit[] => hits,
    levels: (): readonly Level[] => levels,
    bars: (): readonly Bar[] => bars,

    follow(keys: readonly ControlKey[], at: number) {
      lanes = keys.map(
        key =>
          lanes.find(lane => lane.key === key) ?? {
            key,
            label: SLIDER_BY_KEY.get(key)?.label ?? key,
            points:
              before[key] === latest[key]
                ? [{ at: at - TRACE_MS, pos: posOf(key, latest) }]
                : [
                    { at: at - TRACE_MS, pos: posOf(key, before) },
                    { at, pos: posOf(key, latest) },
                  ],
          },
      )
    },

    controls(next: Controls, at: number) {
      before = latest
      latest = next
      for (const lane of lanes)
        if (before[lane.key] !== next[lane.key])
          lane.points.push({ at, pos: posOf(lane.key, next) })
    },

    meter({ hits: voices, peak, tick }: MeterReading, at: number) {
      if (voices !== 0) hits.push({ at, voices })
      const last = levels.at(-1)
      if (last && at - last.at < LEVEL_MS) last.peak = Math.max(last.peak, peak)
      else levels.push({ at, peak })
      const now = Math.floor(tick / STEPS_PER_BAR)
      if (now > bar && bar >= 0) bars.push({ at })
      bar = now
    },

    prune(at: number) {
      const edge = at - TRACE_MS
      dropBefore(hits, edge)
      dropBefore(levels, edge)
      dropBefore(bars, edge)
      for (const lane of lanes) holdFrom(lane.points, edge)
    },
  }
}

export type Trace = ReturnType<typeof createTrace>
