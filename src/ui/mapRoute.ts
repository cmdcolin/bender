import type { ChainMap, MapNode, MapWire } from './chain-map.ts'

const SIDE_WIRES = /^(rail|supply-feed|key-line|fb-out|pad-bay)/

const inside = (n: MapNode, frame: MapNode) =>
  n.x >= frame.x &&
  n.y >= frame.y &&
  n.x + n.w <= frame.x + frame.w &&
  n.y + n.h <= frame.y + frame.h

/** The box a stage's door opens from, the audio wires from it down to the
    output in the order the signal takes them, and the boxes those wires reach.
    A voice inside a frame leaves by the frame's wire. */
export function routeOut(map: ChainMap, door: string) {
  const node = map.nodes.find(n => n.door === door)
  const audio = map.wires.filter(w => w.from !== w.to && !SIDE_WIRES.test(w.id))
  const leaves = (id: string) => audio.find(w => w.from === id)
  const frame =
    node && !leaves(node.id)
      ? map.nodes.find(f => f.kind === 'frame' && f !== node && inside(node, f))
      : undefined
  const wires: MapWire[] = []
  const seen = new Set<string>()
  let at = frame?.id ?? node?.id
  while (at !== undefined && !seen.has(at)) {
    seen.add(at)
    const wire = leaves(at)
    if (wire) wires.push(wire)
    at = wire?.to
  }
  const stops = wires.flatMap(w => map.nodes.filter(n => n.id === w.to))
  return { node, wires, stops }
}
