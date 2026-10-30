// The smallest double the hardware still handles in one piece. Under it,
// arithmetic falls to microcode and runs about twenty times slower.
export const SMALLEST_NORMAL = 2.2250738585072014e-308

const MAX_DEPTH = 24

export interface Tiny {
  path: string
  value: number
}

const childrenOf = (node: object): [string, unknown][] =>
  node instanceof Map || node instanceof Set
    ? [...node.entries()].map(([k, v]) => [`<${String(k)}>`, v])
    : Object.entries(node).map(([k, v]) => [
        Array.isArray(node) ? `[${k}]` : `.${k}`,
        v,
      ])

/** Every number held anywhere under `root` whose magnitude is under `below`,
    zero aside, by the shortest property path to it. Walks own enumerable
    properties, arrays, maps, sets and Float64Arrays. A Float32Array is left
    out: it widens to a normal double on the way out, so nothing reading it pays
    for its tiny values. */
export function tinyValues(root: object, name: string, below: number): Tiny[] {
  const found: Tiny[] = []
  const seen = new Set<object>()
  const queue: { node: unknown; key: string; from: number; depth: number }[] = [
    { node: root, key: name, from: -1, depth: 0 },
  ]
  const pathTo = (at: number): string =>
    at < 0 ? '' : pathTo(queue[at]!.from) + queue[at]!.key
  const isTiny = (value: number) => value !== 0 && Math.abs(value) < below
  for (let at = 0; at < queue.length; at++) {
    const { node, depth } = queue[at]!
    if (typeof node === 'number') {
      if (isTiny(node)) found.push({ path: pathTo(at), value: node })
    } else if (node instanceof Float64Array) {
      node.forEach((value, i) => {
        if (isTiny(value)) found.push({ path: `${pathTo(at)}[${i}]`, value })
      })
    } else if (
      typeof node === 'object' &&
      node !== null &&
      !ArrayBuffer.isView(node) &&
      !seen.has(node) &&
      depth < MAX_DEPTH
    ) {
      seen.add(node)
      for (const [key, child] of childrenOf(node)) {
        queue.push({ node: child, key, from: at, depth: depth + 1 })
      }
    }
  }
  return found
}

export const subnormals = (root: object, name: string) =>
  tinyValues(root, name, SMALLEST_NORMAL).map(t => `${t.path} = ${t.value}`)
