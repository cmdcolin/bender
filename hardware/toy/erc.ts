import { netsOf, type Board } from './board.ts'

export interface Groups {
  of: (net: string) => string
  members: Map<string, string[]>
}

export function groupsOf(b: Board): Groups {
  const parent = new Map<string, string>()
  const find = (n: string): string => {
    const p = parent.get(n) ?? n
    if (p === n) return n
    const root = find(p)
    parent.set(n, root)
    return root
  }
  const union = (a: string, c: string) => {
    const ra = find(a)
    const rc = find(c)
    if (ra === rc) return
    if (rc === 'GND' || (rc === 'VCC' && ra !== 'GND')) parent.set(ra, rc)
    else parent.set(rc, ra)
  }
  for (const part of b.parts.values())
    for (const [x, y] of part.closed) {
      const nx = part.conn.get(x)
      const ny = part.conn.get(y)
      if (nx && ny) union(nx, ny)
    }
  const members = new Map<string, string[]>()
  for (const net of netsOf(b).keys()) {
    const root = find(net)
    members.set(root, [...(members.get(root) ?? []), net])
  }
  return { of: find, members }
}

const SUPPLY = new Set(['VCC', 'GND'])

export function erc(b: Board): string[] {
  const errors: string[] = []
  const groups = groupsOf(b)
  const drivers = new Map<string, string[]>()
  const loads = new Map<string, string[]>()
  const anchored = new Set<string>()

  for (const part of b.parts.values()) {
    for (const pin of part.def.pins) {
      const net = part.conn.get(pin.name)
      const id = `${part.ref}.${pin.name}`
      if (net === undefined) {
        if (pin.dir === 'i' || pin.dir === 'v' || part.def.passive)
          errors.push(`${id} is not connected`)
        continue
      }
      const g = groups.of(net)
      const bucket = (m: Map<string, string[]>) =>
        m.set(g, [...(m.get(g) ?? []), id])
      if (pin.dir === 'o') bucket(drivers)
      if (pin.dir === 'i') bucket(loads)
      if (pin.dir === 'v' && SUPPLY.has(net)) anchored.add(g)
    }
    if (part.def.passive) {
      const nets = [...part.conn.values()].map(n => groups.of(n))
      if (nets.some(g => SUPPLY.has(g))) for (const g of nets) anchored.add(g)
    }
  }

  for (const [g, list] of drivers)
    if (list.length > 1 && !SUPPLY.has(g))
      errors.push(`net ${g} has ${list.length} drivers: ${list.join(' ')}`)
  for (const [g, list] of loads)
    if (!drivers.has(g) && !anchored.has(g))
      errors.push(`net ${g} drives nothing: ${list.join(' ')} read it`)
  for (const [net, pins] of netsOf(b))
    if (pins.length < 2 && !pins.every(p => p.ref.startsWith('TP_')))
      errors.push(`net ${net} has a single pin ${pins[0]!.ref}.${pins[0]!.pin}`)
  return errors
}
