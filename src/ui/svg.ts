// A drawing as data: enough of an element tree that React can mount it and a
// script can write it to a file, from the one description. The panel renders
// the tree with createElement, so its attribute names are React's — camelCase,
// className — and serialize() puts them back the way a file wants them.

export type Attrs = Record<string, string | number | undefined>

export interface El {
  tag: string
  attrs: Attrs
  kids?: (El | string)[]
}

export function el(tag: string, attrs: Attrs, kids?: (El | string)[]): El {
  return { tag, attrs, kids }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ESCAPES[c]!)

// viewBox is the one SVG attribute that is camelCase in the file too.
const KEEP = new Set(['viewBox'])
const RENAME: Record<string, string> = { className: 'class' }

function attrName(key: string): string {
  return (
    RENAME[key] ??
    (KEEP.has(key) ? key : key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`))
  )
}

export function serialize(node: El | string): string {
  if (typeof node === 'string') return esc(node)
  const attrs = Object.entries(node.attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${attrName(k)}="${esc(String(v))}"`)
    .join('')
  const body = (node.kids ?? []).map(serialize).join('')
  return body
    ? `<${node.tag}${attrs}>${body}</${node.tag}>`
    : `<${node.tag}${attrs}/>`
}

// Helvetica at a given size, near enough to pick a box width. Every box on the
// map is cut to the widest label on it, so a few percent out shows up as a few
// percent of slack inside the boxes rather than as a label running off one.
const NARROW = new Set('iljtfI.,:;\'"!|()[]{} ')
const WIDE = new Set('mwMW@')

export function textWidth(s: string, size: number): number {
  let ems = 0
  for (const ch of s)
    ems += NARROW.has(ch)
      ? 0.32
      : WIDE.has(ch)
        ? 0.86
        : ch >= 'A' && ch <= 'Z'
          ? 0.68
          : 0.53
  return ems * size
}

export type Point = [number, number]

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1])

const toward = (from: Point, to: Point, by: number): Point => {
  const d = dist(from, to)
  if (d === 0) return from
  return [
    from[0] + ((to[0] - from[0]) * by) / d,
    from[1] + ((to[1] - from[1]) * by) / d,
  ]
}

const at = (p: Point) => `${round(p[0])} ${round(p[1])}`

const round = (n: number) => Math.round(n * 100) / 100

/** A wire run as right angles, with the corners rounded off. */
export function route(pts: Point[], radius = 6): string {
  const d = [`M ${at(pts[0]!)}`]
  for (let i = 1; i < pts.length - 1; i++) {
    const [prev, corner, next] = [pts[i - 1]!, pts[i]!, pts[i + 1]!]
    const r = Math.min(radius, dist(prev, corner) / 2, dist(corner, next) / 2)
    d.push(`L ${at(toward(corner, prev, r))}`)
    d.push(`Q ${at(corner)} ${at(toward(corner, next, r))}`)
  }
  d.push(`L ${at(pts[pts.length - 1]!)}`)
  return d.join(' ')
}

/** The head on the end of a run, pointing the way the last leg travels. */
export function arrowhead(pts: Point[], size = 4): string {
  const tip = pts[pts.length - 1]!
  const back = toward(tip, pts[pts.length - 2]!, size)
  const [dx, dy] = [tip[0] - back[0], tip[1] - back[1]]
  const [nx, ny] = [-dy / 2, dx / 2]
  return `M ${at(tip)} L ${at([back[0] + nx, back[1] + ny])} L ${at([back[0] - nx, back[1] - ny])} Z`
}
