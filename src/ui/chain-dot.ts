import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { GROUPS } from './controls'

// The panel's signal path, emitted as DOT so graphviz can draw what the chain
// actually does: live bend order, the feedback wire, and where it lands.

const BEND_GROUP = [
  undefined,
  'Ring mod',
  'Crusher',
  'Shaper',
  'Comb',
  'Glitch buffer',
  'Screech filter',
] as const

const FB_TARGET = ['mix', 'Chaos osc', 'Toy keyboard', 'Tape delay'] as const

const SOURCE_ACTIVE: Record<string, (c: Controls) => boolean> = {
  'Toy keyboard': c => c.chipLevel > 0,
  'Toy drums': c => c.drumLevel > 0,
  'Chaos osc': c => c.oscLevel > 0,
  'Noise & crackle': c => c.noiseLevel > 0 || c.crackleAmp > 0,
  'Mic & sample': c => c.micLevel > 0 || c.sampleLevel > 0,
}

const COLORS = {
  bg: '#1b1b1f',
  fg: '#b9b9be',
  dim: '#5c5c63',
  border: '#2c2c31',
  accent: '#ff5d3b',
  accent2: '#ffb03b',
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

function groupNode(name: string, c: Controls, active: boolean): string {
  const touched = touchedCount(name, c)
  const label = touched > 0 ? `${name}  ${touched}` : name
  const color = touched > 0 ? COLORS.accent : COLORS.border
  const fg = active ? COLORS.fg : COLORS.dim
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
}

export function buildDot(c: Controls): string {
  const lines: string[] = [
    'digraph chain {',
    '  bgcolor="transparent"',
    '  rankdir=TB',
    '  nodesep=0.14',
    '  ranksep=0.2',
    `  node [shape=box, style="filled,rounded", fillcolor="${COLORS.bg}", color="${COLORS.border}", fontcolor="${COLORS.fg}", fontname="Helvetica", fontsize=9, height=0.24, margin="0.09,0.04"]`,
    `  edge [color="${COLORS.border}", arrowsize=0.5, penwidth=0.9]`,
  ]

  const sources = Object.keys(SOURCE_ACTIVE)
  for (const name of sources) lines.push(groupNode(name, c, SOURCE_ACTIVE[name]!(c)))
  lines.push(
    `  mix [label="mix bus", shape=box, style=filled, fillcolor="${COLORS.bg}", fontcolor="${COLORS.dim}"]`,
  )
  for (const name of sources) lines.push(`  ${nodeId(name)} -> mix`)

  let prev = 'mix'
  const bends = bendOrder(c)
  for (const name of bends) {
    const mixKey = BEND_MIX[name]
    lines.push(groupNode(name, c, mixKey ? c[mixKey] > 0 : true))
    lines.push(`  ${prev} -> ${nodeId(name)}`)
    prev = nodeId(name)
  }
  if (bends.length === 0) {
    lines.push(`  no_bends [label="no bends patched", fontcolor="${COLORS.dim}"]`)
    lines.push(`  mix -> no_bends`)
    prev = 'no_bends'
  }

  for (const [name, active] of [
    ['Tape delay', c.dlyMix > 0],
    ['Spring verb', c.revMix > 0],
    ['Brownout', c.brownAmt > 0 || c.brownRate > 0 || c.humLevel > 0],
    ['Output', true],
  ] as const) {
    lines.push(groupNode(name, c, active))
    lines.push(`  ${prev} -> ${nodeId(name)}`)
    prev = nodeId(name)
  }

  lines.push(
    `  out [label="dc block → clip → limit", shape=box, style=filled, fillcolor="${COLORS.bg}", fontcolor="${COLORS.dim}"]`,
  )
  lines.push(`  ${prev} -> out`)

  if (c.fbAmt > 0) {
    const target = FB_TARGET[Math.round(c.fbDest)] ?? 'mix'
    lines.push(groupNode('Feedback bus', c, true))
    lines.push(
      `  out -> ${nodeId('Feedback bus')} [color="${COLORS.accent2}", style=dashed]`,
    )
    lines.push(
      `  ${nodeId('Feedback bus')} -> ${target === 'mix' ? 'mix' : nodeId(target)} [color="${COLORS.accent2}", style=dashed, constraint=false, label=" ${c.fbAmt.toFixed(2)}", fontcolor="${COLORS.accent2}", fontsize=8]`,
    )
  }

  lines.push('}')
  return lines.join('\n')
}
