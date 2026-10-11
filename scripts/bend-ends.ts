import {
  DEFAULT_CONTROLS,
  type ControlKey,
  type Controls,
} from '../src/controls'
import { render, rms, SR } from '../src/dsp/testRender'
import { gateUp, HIGH_POS, LOW_POS } from '../src/ui/bendDeal'
import { groupFor, sliderFor, snapToStep } from '../src/ui/controls'
import { applyPreset } from '../src/ui/presets/apply'
import { drivable, gateOf, heard, inChain } from '../src/ui/presets/scenarios'
import { PRESETS } from '../src/ui/presets/table'
import { YOURS } from '../src/ui/presets/yours'
import { fromPos } from '../src/ui/slider-scale'

// Which end of each control a bend key can be heard at, measured with the
// control's stage brought up the way a key brings it up.
//
//   pnpm bend-ends          rewrite src/ui/bendEnds.ts
//
// A key that slams a control nobody can hear is a dead pad with a name on it,
// and a key that only brings a silent stage up sounds like every other key on
// that stage. So each end is rendered against the stage already up, on the
// stock board and a few presets, and an end that never moves the take's shape
// by SHAPE_DB, its frames by MOTION_DB or its level by LEVEL_DB is written
// down as dead. The frames threshold sits above what a feedback loop does when
// a control only shifts its phase. The dealer skips dead ends and reads the
// level change of live ones to keep a key from coming out much louder than the
// board.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const SECONDS = 2.5
const SETTLE = SR / 2
const SHAPE_DB = 1.5
const LEVEL_DB = 3
const MOTION_DB = 3
const OUT = 'src/ui/bendEnds.ts'

const BANDS = Array.from(
  { length: 24 },
  (_, i) => 40 * Math.pow(18000 / 40, i / 23),
)
const FRAME = 2048

// Power in two dozen log-spaced bands, frame by frame after the take settles.
function frames(x: Float32Array): number[][] {
  const out: number[][] = []
  for (let start = SETTLE; start + FRAME < x.length; start += FRAME)
    out.push(
      BANDS.map(hz => {
        const w = 2 * Math.cos((2 * Math.PI * hz) / SR)
        let s1 = 0
        let s2 = 0
        for (let i = 0; i < FRAME; i++) {
          const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME)
          const s0 = x[start + i]! * win + w * s1 - s2
          s2 = s1
          s1 = s0
        }
        return s1 * s1 + s2 * s2 - w * s1 * s2
      }),
    )
  return out
}

const toDb = (power: number) => 10 * Math.log10(power + 1e-12)

const average = (f: number[][]) =>
  BANDS.map((_, b) => toDb(f.reduce((s, frame) => s + frame[b]!, 0) / f.length))

// Mean distance between two spectra with the overall level taken out: what a
// change does to the sound's colour over the whole take.
function shape(a: number[][], b: number[][]): number {
  const [sa, sb] = [average(a), average(b)]
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
  const ma = mean(sa)
  const mb = mean(sb)
  return (
    sa.reduce((s, v, i) => s + Math.abs(v - ma - (sb[i]! - mb)), 0) / sa.length
  )
}

// Mean distance frame by frame, which hears what the average smooths away: a
// wobble in pitch, a dropout, a hit that moved. Bands more than 60 dB under a
// frame's loudest count as the floor, so hiss trading places is not a change.
function motion(a: number[][], b: number[][]): number {
  let total = 0
  for (const [i, fa] of a.entries()) {
    const fb = b[i]!.map(toDb)
    const da = fa.map(toDb)
    const floor = Math.max(...da, ...fb) - 60
    total +=
      da.reduce(
        (s, v, j) => s + Math.abs(Math.max(v, floor) - Math.max(fb[j]!, floor)),
        0,
      ) / da.length
  }
  return total / a.length
}

const levelDb = (x: Float32Array) =>
  20 * Math.log10(rms(x.subarray(SETTLE)) + 1e-9)

interface Take {
  frames: number[][]
  db: number
}

const takes = new Map<string, Take>()
function take(board: Controls): Take {
  const id = JSON.stringify(board)
  const cached = takes.get(id)
  if (cached) return cached
  const x = render(board, SECONDS)
  const t = { frames: frames(x), db: levelDb(x) }
  takes.set(id, t)
  return t
}

const round = (v: number) => Math.round(v * 2) / 2

// The stock board first, since its numbers are the ones written down, then a
// few presets that reach what the stock board leaves at rest: a wire in the
// bay, the crusher down to a few bits, the tape stopping.
const BOARDS: Controls[] = [
  DEFAULT_CONTROLS,
  ...[
    'dusty kit',
    'dropped in the post',
    'drum machine on the die',
    'acid line',
    'tape stop',
  ].map(name =>
    applyPreset(
      PRESETS.find(p => p.name === name)!,
      DEFAULT_CONTROLS,
    ),
  ),
]

const stageDb = new Map<ControlKey, number>()
const ends = new Map<ControlKey, [number | null, number | null]>()

for (const [b, board] of BOARDS.entries()) {
  const defs = drivable(board).filter(d => inChain(board, groupFor(d.key)))
  for (const [i, def] of defs.entries()) {
    const gate = gateOf(groupFor(def.key))
    const silent =
      gate !== undefined &&
      gate !== def.key &&
      !YOURS.has(gate) &&
      !heard(board, def.key)
    const up: Controls = silent ? { ...board, [gate]: gateUp(gate) } : board
    if (silent && b === 0 && !stageDb.has(gate)) {
      const off = take({ ...board, [gate]: sliderFor(gate).min })
      stageDb.set(gate, round(take(up).db - off.db))
    }
    const base = take(up)
    const had = ends.get(def.key) ?? [null, null]
    const measured = [LOW_POS, HIGH_POS].map((pos, end) => {
      if (had[end] !== null) return had[end]
      const t = take({ ...up, [def.key]: snapToStep(def, fromPos(def, pos)) })
      const db = t.db - base.db
      const live =
        shape(base.frames, t.frames) >= SHAPE_DB ||
        motion(base.frames, t.frames) >= MOTION_DB ||
        Math.abs(db) >= LEVEL_DB
      return live ? round(db) : null
    }) as [number | null, number | null]
    ends.set(def.key, measured)
    process.stderr.write(
      `\r${b + 1}/${BOARDS.length} ${i + 1}/${defs.length} ${def.key}`.padEnd(
        50,
      ),
    )
  }
}
process.stderr.write('\n')

const dead = [...ends].filter(
  ([, [low, high]]) => low === null && high === null,
)
console.log(
  `${ends.size} controls, ${dead.length} dead at both ends: ${dead.map(([k]) => k).join(' ')}`,
)

const entry = (v: number | null) => (v === null ? 'null' : String(v))
writeFileSync(
  OUT,
  `// Written by \`pnpm bend-ends\`: each control's level change in dB at the low
// and high end of its travel, measured on the stock board with its stage up,
// or null where the end made no change anyone could hear.
import type { ControlKey } from '../controls'

export const BEND_ENDS: Partial<
  Record<ControlKey, readonly [low: number | null, high: number | null]>
> = {
${[...ends].map(([k, [low, high]]) => `  ${k}: [${entry(low)}, ${entry(high)}],`).join('\n')}
}

/** How much louder the board gets when a key brings a silent stage up. */
export const STAGE_DB: Partial<Record<ControlKey, number>> = {
${[...stageDb].map(([k, db]) => `  ${k}: ${db},`).join('\n')}
}
`,
)
execFileSync('pnpm', ['exec', 'oxfmt', OUT], { stdio: 'inherit' })
