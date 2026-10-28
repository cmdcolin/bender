export const PLUG = 18
const SLACK = 18
const CORNER = 10
const ARROW_LIFT = 14

export interface Point {
  x: number
  y: number
}

export type Facing = 'right' | 'up'

/** Where a plug sits, and which way its boot points out of the jack. */
export interface Anchor {
  at: Point
  facing: Facing
}

export interface Route {
  from: Anchor
  to: Anchor
  /** The corners the cable turns, plug boot to plug boot. */
  bends: Point[]
}

export const boot = ({ at, facing }: Anchor): Point =>
  facing === 'right' ? { x: at.x + PLUG, y: at.y } : { x: at.x, y: at.y - PLUG }

export interface Path {
  d: string
  arrow: Point & { angle: number }
}

/** Straight runs through `bends` with rounded corners, and an arrowhead on the
    last upright run, just short of its far end. */
export function laid(bends: Point[]): Path {
  const radius = (i: number) => {
    const p = bends[i - 1]!
    const q = bends[i]!
    const r = bends[i + 1]!
    const into = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
    const out = Math.abs(r.x - q.x) + Math.abs(r.y - q.y)
    return Math.min(CORNER, into / 2, out / 2)
  }
  const toward = (from: Point, to: Point, by: number) => {
    const len = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) || 1
    return {
      x: from.x + ((to.x - from.x) * by) / len,
      y: from.y + ((to.y - from.y) * by) / len,
    }
  }
  let d = `M${bends[0]!.x} ${bends[0]!.y}`
  for (let i = 1; i < bends.length - 1; i++) {
    const r = radius(i)
    const q = bends[i]!
    const enter = toward(q, bends[i - 1]!, r)
    const leave = toward(q, bends[i + 1]!, r)
    d += ` L${enter.x} ${enter.y} Q${q.x} ${q.y} ${leave.x} ${leave.y}`
  }
  const last = bends.at(-1)!
  d += ` L${last.x} ${last.y}`

  let corner = bends.length - 1
  while (corner > 1 && bends[corner]!.x !== bends[corner - 1]!.x) corner--
  const top = bends[corner - 1]!
  const turn = bends[corner]!
  const run = Math.abs(turn.y - top.y)
  const dir = turn.y >= top.y ? 1 : -1
  const round = corner < bends.length - 1 ? radius(corner) : 0
  return {
    d,
    arrow: {
      x: turn.x,
      y: turn.y - dir * Math.min(round + ARROW_LIFT, run / 2),
      angle: dir * 90,
    },
  }
}

const bezier = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  (1 - t) ** 3 * p0 +
  3 * (1 - t) ** 2 * t * p1 +
  3 * (1 - t) * t * t * p2 +
  t ** 3 * p3

const slope = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  3 * (1 - t) ** 2 * (p1 - p0) +
  6 * (1 - t) * t * (p2 - p1) +
  3 * t * t * (p3 - p2)

/** A cable with one end in the hand, sagging out the way both plugs face. */
export function hanging(from: Anchor, to: Anchor): Path {
  const a = boot(from)
  const b = boot(to)
  const reach = SLACK + Math.min(Math.hypot(a.x - b.x, a.y - b.y), 220) * 0.14
  const out = (anchor: Anchor, p: Point) =>
    anchor.facing === 'right'
      ? { x: p.x + reach, y: p.y }
      : { x: p.x, y: p.y - reach }
  const c1 = out(from, a)
  const c2 = out(to, b)
  const heading = Math.atan2(
    slope(0.5, a.y, c1.y, c2.y, b.y),
    slope(0.5, a.x, c1.x, c2.x, b.x),
  )
  return {
    d: `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`,
    arrow: {
      x: bezier(0.5, a.x, c1.x, c2.x, b.x),
      y: bezier(0.5, a.y, c1.y, c2.y, b.y),
      angle: (heading * 180) / Math.PI,
    },
  }
}

const LANE_IN = 15
const LANE_PITCH = 7
const BAND_IN = 6
const BAND_PITCH = 6

/** The gutter a bench with this many lanes needs past the cases' edge. */
export const gutterFor = (lanes: number) =>
  PLUG + LANE_IN + Math.max(1, lanes) * LANE_PITCH + 6

/** A cable to lay: each end on a case's right edge or on a plate, facing up.
    An inner run takes the lanes nearest the cases. */
export interface Run {
  id: string
  from: Anchor
  to: Anchor
  inner?: boolean
}

/** Every run's lane in the gutter past `edge`. Inner runs take the inner lanes,
    the lowest end innermost; the rest take the outer lanes, the shortest
    innermost. A run with an end on a plate crosses to the gutter above the
    plate, at a height of its own among the runs on that plate. */
export function layRuns(runs: readonly Run[], edge: number) {
  const inner = runs
    .filter(r => r.inner)
    .toSorted((a, b) => a.to.at.y - b.to.at.y)
  const outer = runs
    .filter(r => !r.inner)
    .toSorted(
      (a, b) =>
        Math.abs(a.to.at.y - a.from.at.y) - Math.abs(b.to.at.y - b.from.at.y),
    )
  const ordered = [...inner, ...outer]
  const lane = (i: number) => edge + PLUG + LANE_IN + i * LANE_PITCH

  const plates = new Map<number, number[]>()
  ordered.forEach((r, i) => {
    for (const end of [r.from, r.to])
      if (end.facing === 'up') {
        const on = plates.get(end.at.y) ?? []
        if (!on.includes(i)) on.push(i)
        plates.set(end.at.y, on)
      }
  })
  const band = (plateY: number, i: number) => {
    const on = plates.get(plateY)!
    return (
      plateY - PLUG - BAND_IN - (on.length - 1 - on.indexOf(i)) * BAND_PITCH
    )
  }

  const routes = new Map<string, Route>()
  ordered.forEach((r, i) => {
    const x = lane(i)
    const a = boot(r.from)
    const b = boot(r.to)
    const bends: Point[] = [a]
    if (r.from.facing === 'up') {
      const y = band(r.from.at.y, i)
      bends.push({ x: a.x, y }, { x, y })
    } else bends.push({ x, y: a.y })
    if (r.to.facing === 'up') {
      const y = band(r.to.at.y, i)
      bends.push({ x, y }, { x: b.x, y })
    } else bends.push({ x, y: b.y })
    bends.push(b)
    routes.set(r.id, { from: r.from, to: r.to, bends })
  })
  return routes
}
