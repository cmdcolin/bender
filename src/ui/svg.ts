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
