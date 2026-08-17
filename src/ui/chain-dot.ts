import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { GROUPS, sliderFor } from './controls'

// The signal path, emitted as DOT so graphviz can draw what the chain actually
// does: live bend order, the feedback wire, and where it lands. The panel draws
// this live; scripts/chain-svg.ts draws the README's copy from the same source.

const BEND_GROUP = [
  undefined,
  'Ring mod',
  'Crusher',
  'Shaper',
  'Comb',
  'Glitch buffer',
  'Screech filter',
  'Freq shifter',
] as const

const FB_TARGET = ['mix', 'Chaos osc', 'Toy keyboard', 'Tape delay'] as const

// Which group owns each patch-bay destination, in mod*Dest order.
const WIRE_TARGET = [
  'Screech filter',
  'Ring mod',
  'Comb',
  'Crusher',
  'Toy keyboard',
  'Toy drums',
  'Tape delay',
  'Glitch buffer',
  'Feedback bus',
] as const

const SRC_LABEL = sliderFor('mod0Src').choices ?? []

const SOURCE_ACTIVE: Record<string, (c: Controls) => boolean> = {
  'Toy keyboard': c => c.chipLevel > 0,
  'Toy drums': c => c.drumLevel > 0,
  'Chaos osc': c => c.oscLevel > 0,
  'Noise & crackle': c => c.noiseLevel > 0 || c.crackleAmp > 0,
  'Mic & sample': c => c.micLevel > 0 || c.sampleLevel > 0,
}

export interface Palette {
  bg: string
  fg: string
  dim: string
  border: string
  accent: string
  accent2: string
  /** control wires, cool against the warm signal path */
  mod: string
}

export const PANEL: Palette = {
  bg: '#1b1b1f',
  fg: '#b9b9be',
  dim: '#5c5c63',
  border: '#2c2c31',
  accent: '#ff5d3b',
  accent2: '#ffb03b',
  mod: '#5ea9d8',
}

export function groupAnchor(name: string): string {
  return `group-${name.replace(/\W+/g, '-')}`
}

function touchedCount(name: string, c: Controls): number {
  const group = GROUPS.find(g => g.name === name)
  if (!group) return 0
  return group.sliders.filter(s => c[s.key] !== DEFAULT_CONTROLS[s.key]).length
}

function nodeId(name: string): string {
  return name.replace(/\W+/g, '_')
}

function groupNode(name: string, c: Controls, active: boolean, o: Options): string {
  const k = o.palette ?? PANEL
  const touched = o.live === false ? 0 : touchedCount(name, c)
  const label = touched > 0 ? `${name}  ${touched}` : name
  const color = touched > 0 ? k.accent : k.border
  const fg = active ? k.fg : k.dim
  return `  ${nodeId(name)} [label="${label}", color="${color}", fontcolor="${fg}", URL="#${groupAnchor(name)}"]`
}

function bendOrder(c: Controls): string[] {
  const slots = [c.bendSlot0, c.bendSlot1, c.bendSlot2, c.bendSlot3, c.bendSlot4, c.bendSlot5]
  const seen = new Set<number>()
  const names: string[] = []
  for (const slot of slots) {
    const id = Math.round(slot)
    const name = BEND_GROUP[id]
    if (!name || seen.has(id)) continue
    seen.add(id)
    names.push(name)
  }
  return names
}

const BEND_MIX: Record<string, keyof Controls> = {
  'Ring mod': 'ringMix',
  Crusher: 'crushMix',
  Shaper: 'distMix',
  Comb: 'combMix',
  'Glitch buffer': 'glitchMix',
  'Screech filter': 'filtMix',
  'Freq shifter': 'shiftMix',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function sourceStrip(c: Controls, o: Options): string {
  const k = o.palette ?? PANEL
  const rows = Object.entries(SOURCE_ACTIVE).map(([name, isLive]) => {
    const touched = o.live === false ? 0 : touchedCount(name, c)
    const fg = isLive(c) ? k.fg : k.dim
    const count = touched > 0 ? ` <FONT COLOR="${k.accent}">${touched}</FONT>` : ''
    return `<TR><TD PORT="${nodeId(name)}" HREF="#${groupAnchor(name)}" TITLE="${esc(name)}"><FONT COLOR="${fg}">${esc(name)}</FONT>${count}</TD></TR>`
  })
  return `<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5" BGCOLOR="${k.bg}" COLOR="${k.border}">${rows.join('')}</TABLE>`
}

export interface Options {
  palette?: Palette
  /** A live board shows how far each stage is off stock, and the feedback
      amount; the README's copy just names the parts. */
  live?: boolean
}

export function buildDot(c: Controls, o: Options = {}): string {
  const k = o.palette ?? PANEL
  const lines: string[] = [
    'digraph chain {',
    '  bgcolor="transparent"',
    '  rankdir=TB',
    '  nodesep=0.18',
    '  ranksep=0.22',
    `  node [shape=box, style="filled,rounded", fillcolor="${k.bg}", color="${k.border}", fontcolor="${k.fg}", fontname="Helvetica", fontsize=12, height=0.3, margin="0.14,0.06"]`,
    `  edge [color="${k.border}", arrowsize=0.6, penwidth=1.1]`,
  ]

  const drawn = new Set<string>()
  const node = (name: string, active: boolean) => {
    drawn.add(nodeId(name))
    return groupNode(name, c, active, o)
  }

  // The sources ride one strip rather than five nodes on a rank of their own:
  // a column of boxes keeps the whole path narrow enough to read at this size.
  lines.push(`  sources [shape=none, margin=0, label=<${sourceStrip(c, o)}>]`)
  lines.push(`  mix [label="mix bus", shape=box, fontcolor="${k.dim}"]`)
  lines.push('  sources -> mix')

  let prev = 'mix'
  const bends = bendOrder(c)
  for (const name of bends) {
    const mixKey = BEND_MIX[name]
    lines.push(node(name, mixKey ? c[mixKey] > 0 : true))
    lines.push(`  ${prev} -> ${nodeId(name)}`)
    prev = nodeId(name)
  }
  if (bends.length === 0) {
    lines.push(`  no_bends [label="no bends patched", fontcolor="${k.dim}"]`)
    lines.push(`  mix -> no_bends`)
    prev = 'no_bends'
  }

  for (const [name, active] of [
    ['Tape delay', c.dlyMix > 0],
    ['Spring verb', c.revMix > 0],
    ['Brownout', c.brownAmt > 0 || c.brownRate > 0 || c.humLevel > 0],
    ['Output', true],
  ] as const) {
    lines.push(node(name, active))
    lines.push(`  ${prev} -> ${nodeId(name)}`)
    prev = nodeId(name)
  }

  lines.push(`  out [label="dc block → clip → limit", shape=box, fontcolor="${k.dim}"]`)
  lines.push(`  ${prev} -> out`)

  if (c.fbAmt > 0) {
    const dest = FB_TARGET[Math.round(c.fbDest)] ?? 'mix'
    const target =
      dest === 'mix' ? 'mix' : dest in SOURCE_ACTIVE ? `sources:${nodeId(dest)}` : nodeId(dest)
    lines.push(node('Feedback bus', true))
    lines.push(
      `  out -> ${nodeId('Feedback bus')} [color="${k.accent2}", style=dashed]`,
    )
    lines.push(
      `  ${nodeId('Feedback bus')} -> ${target} [color="${k.accent2}", style=dashed, constraint=false, label=" ${o.live === false ? 'feedback' : c.fbAmt.toFixed(2)}", fontcolor="${k.accent2}", fontsize=10]`,
    )
  }

  // Patch wires ride over the top of the signal path, dotted and cool, from
  // whatever the wire picks up onto the group it is soldered to. A wire to a
  // stage that isn't in the path does nothing, so it isn't drawn.
  for (const i of [0, 1] as const) {
    const src = Math.round(c[`mod${i}Src`])
    const depth = c[`mod${i}Depth`]
    const dest = WIRE_TARGET[Math.round(c[`mod${i}Dest`])]
    if (src === 0 || depth === 0 || !dest) continue
    if (dest === 'Feedback bus' && !drawn.has(nodeId(dest))) lines.push(node(dest, true))
    const inStrip = dest in SOURCE_ACTIVE
    if (!inStrip && !drawn.has(nodeId(dest))) continue
    const anchor = inStrip ? 'sources' : nodeId(dest)
    lines.push(
      `  wire${i} [label="${SRC_LABEL[src]}", shape=plaintext, fontcolor="${k.mod}", fontsize=10]`,
    )
    lines.push(
      `  wire${i} -> ${inStrip ? `sources:${nodeId(dest)}` : anchor} [color="${k.mod}", style=dotted, constraint=false, label=" ${o.live === false ? 'patch wire' : depth.toFixed(2)}", fontcolor="${k.mod}", fontsize=10]`,
    )
    // sit the wire beside what it feeds, or it floats to the top and stretches
    // the whole drawing sideways
    lines.push(`  { rank=same; wire${i}; ${anchor} }`)
  }

  lines.push('}')
  return lines.join('\n')
}
