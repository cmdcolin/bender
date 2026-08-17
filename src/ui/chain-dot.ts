import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { GROUPS, groupKeys, sliderFor } from './controls'

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
  'Stompbox',
  'Freq shifter',
  'Crusher',
  'Toy drums',
] as const

const SRC_LABEL = sliderFor('mod0Src').choices ?? []

// A wire's label names what it picks up, so it opens the thing it is clipped
// onto rather than the bay — mod*Src order. The rest (the bay's own LFO, the
// supply sag, the output envelope) belong to no one stage, so they open the bay.
const SRC_GROUP: Record<number, string> = {
  4: 'Mic & sample',
  5: 'Body contact',
  6: 'Body contact',
  7: 'Feedback bus',
  8: 'Toy keyboard',
}

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
  /** fill behind the stage whose controls the panel is showing */
  open: string
}

export const PANEL: Palette = {
  bg: '#1b1b1f',
  fg: '#b9b9be',
  dim: '#5c5c63',
  border: '#2c2c31',
  accent: '#ff5d3b',
  accent2: '#ffb03b',
  mod: '#5ea9d8',
  open: '#332622',
}

export function groupAnchor(name: string): string {
  return `group-${name.replace(/\W+/g, '-')}`
}

function touchedCount(name: string, c: Controls): number {
  const group = GROUPS.find(g => g.name === name)
  if (!group) return 0
  return groupKeys(group).filter(k => c[k] !== DEFAULT_CONTROLS[k]).length
}

function nodeId(name: string): string {
  return name.replace(/\W+/g, '_')
}

function groupNode(
  name: string,
  c: Controls,
  active: boolean,
  o: Options,
): string {
  const k = o.palette ?? PANEL
  const touched = o.live === false ? 0 : touchedCount(name, c)
  const label = touched > 0 ? `${name}  ${touched}` : name
  const open = o.open === name
  const color = open ? k.fg : touched > 0 ? k.accent : k.border
  const fg = active || open ? k.fg : k.dim
  const fill = open ? k.open : k.bg
  return `  ${nodeId(name)} [label="${label}", fillcolor="${fill}", color="${color}", penwidth=${open ? 2 : 1}, fontcolor="${fg}", URL="#${groupAnchor(name)}"]`
}

function bendOrder(c: Controls): string[] {
  const slots = [
    c.bendSlot0,
    c.bendSlot1,
    c.bendSlot2,
    c.bendSlot3,
    c.bendSlot4,
    c.bendSlot5,
  ]
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
    const open = o.open === name
    const fg = isLive(c) || open ? k.fg : k.dim
    const count =
      touched > 0 ? ` <FONT COLOR="${k.accent}">${touched}</FONT>` : ''
    const fill = open ? ` BGCOLOR="${k.open}"` : ''
    return `<TR><TD PORT="${nodeId(name)}" HREF="#${groupAnchor(name)}" TITLE="${esc(name)}"${fill}><FONT COLOR="${fg}">${esc(name)}</FONT>${count}</TD></TR>`
  })
  return `<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5" BGCOLOR="${k.bg}" COLOR="${k.border}">${rows.join('')}</TABLE>`
}

// Everything the path doesn't reach: the slot rack, any bend sitting in no
// slot, and a patch bay or body pad with nothing wired to it. A shelf under the
// board rather than a row of chips beside it, because the map is the panel's
// only index — a stage the drawing can't hold still needs somewhere to be
// picked up from, and "nothing is wired to this" is easier to say in a shelf
// than in a picture made of wires. Three to a row: a bare board leaves nine
// parts off it, and a column of nine is taller than the path they came off.
const SHELF_COLS = 3

// Rows as even as the count allows — four parts read better as two and two than
// as three and a stray — and the last cell of a short row widens to fill it, so
// the shelf is a block rather than a staircase.
function shelfRows(names: string[]): string[][] {
  const rows = Math.ceil(names.length / SHELF_COLS)
  const each = Math.floor(names.length / rows)
  const wide = names.length % rows
  const out: string[][] = []
  for (let r = 0, i = 0; r < rows; r++) {
    const take = each + (r < wide ? 1 : 0)
    out.push(names.slice(i, i + take))
    i += take
  }
  return out
}

function shelfStrip(names: string[], c: Controls, o: Options): string {
  const k = o.palette ?? PANEL
  const rows = shelfRows(names)
  const cols = Math.max(...rows.map(r => r.length))
  const cell = (name: string, span: number) => {
    const touched = touchedCount(name, c)
    const open = o.open === name
    const count =
      touched > 0 ? ` <FONT COLOR="${k.accent}">${touched}</FONT>` : ''
    const fill = open ? ` BGCOLOR="${k.open}"` : ''
    const wide = span > 1 ? ` COLSPAN="${span}"` : ''
    return `<TD HREF="#${groupAnchor(name)}" TITLE="${esc(name)}"${fill}${wide}><FONT COLOR="${open ? k.fg : k.dim}">${esc(name)}</FONT>${count}</TD>`
  }
  const drawn = rows.map(row => {
    const cells = row.map((name, i) =>
      cell(name, i === row.length - 1 ? cols - row.length + 1 : 1),
    )
    return `<TR>${cells.join('')}</TR>`
  })
  return `<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5" BGCOLOR="${k.bg}" COLOR="${k.border}"><TR><TD COLSPAN="${cols}" BORDER="0"><FONT COLOR="${k.dim}" POINT-SIZE="10">off the board</FONT></TD></TR>${drawn.join('')}</TABLE>`
}

export interface Options {
  palette?: Palette
  /** A live board shows how far each stage is off stock, and the feedback
      amount; the README's copy just names the parts. */
  live?: boolean
  /** Folds the path into two columns joined by a slack cable. The panel wants
      it — a straight run is 810px tall and buries every control under itself —
      and the README, drawn as a standalone image, does not. */
  wrap?: boolean
  /** The stage whose controls the panel is showing, lit on the map. */
  open?: string
}

// The path, wired between the nodes that are already declared. Straight down
// the page, or folded in half so the panel gets a map roughly as wide as it is
// tall instead of a 810px ribbon down one side of a 420px column.
//
// The fold is two chains pinned rank-by-rank into columns, with the cable from
// the foot of the first to the head of the second carrying the eye across.
// `constraint=false` is what lets that edge exist without graphviz stacking the
// second column back under the first, and the slack in it is graphviz's own
// spline routing around the rows between — it reads as cable because it is the
// one line on the map that isn't a short vertical hop.
// Split down the middle by count, not by drawn height. Graphviz pins the
// columns rank by rank, so the row holding the five-deep source strip is five
// deep whatever sits opposite it — the strip's extra rows come free, and
// evening the two columns out by height only pushes nodes past the tail of the
// short one, where each costs a row of its own.
function columns(seq: string[], o: Options): [string[]] | [string[], string[]] {
  if (!o.wrap) return [seq]
  const half = Math.ceil(seq.length / 2)
  return [seq.slice(0, half), seq.slice(half)]
}

function wireRun(seq: string[], k: Palette, o: Options): string[] {
  const chain = (col: string[]) =>
    col.slice(1).map((id, i) => `  ${col[i]} -> ${id}`)
  const [down, up] = columns(seq, o)
  if (!up) return chain(down)
  return [
    ...chain(down),
    ...chain(up),
    `  ${down[down.length - 1]} -> ${up[0]} [constraint=false, color="${k.accent}", penwidth=1.8, arrowsize=0.8]`,
    // Row i of one column beside row i of the other. Graphviz keeps them in
    // declaration order, so the path always reads down the left and up the
    // right rather than swapping sides as the bend count changes.
    ...down
      .slice(0, up.length)
      .map((id, i) => `  { rank=same; ${id}; ${up[i]} }`),
  ]
}

export function buildDot(c: Controls, o: Options = {}): string {
  const k = o.palette ?? PANEL
  const lines: string[] = [
    'digraph chain {',
    '  bgcolor="transparent"',
    '  rankdir=TB',
    `  nodesep=${o.wrap ? 0.22 : 0.18}`,
    '  ranksep=0.22',
    `  node [shape=box, style="filled,rounded", fillcolor="${k.bg}", color="${k.border}", fontcolor="${k.fg}", fontname="Helvetica", fontsize=12, height=0.3, margin="0.14,0.06"]`,
    `  edge [color="${k.border}", arrowsize=0.6, penwidth=1.1]`,
  ]

  const drawn = new Set<string>()
  // Every group the drawing opens, whether from a box, a strip row or a wire.
  // The shelf at the foot is the rest, so no group is left without a door.
  const doors = new Set<string>(Object.keys(SOURCE_ACTIVE))
  const node = (name: string, active: boolean) => {
    drawn.add(nodeId(name))
    doors.add(name)
    return groupNode(name, c, active, o)
  }

  // The path is collected in signal order before any of it is wired, because
  // the wrap below needs to know how long the run is to find its middle.
  const seq: string[] = []
  const run = (id: string, decl: string) => {
    lines.push(decl)
    seq.push(id)
  }

  // The sources ride one strip rather than five nodes on a rank of their own:
  // a column of boxes keeps the whole path narrow enough to read at this size.
  run(
    'sources',
    `  sources [shape=none, margin=0, label=<${sourceStrip(c, o)}>]`,
  )
  run('mix', `  mix [label="mix bus", shape=box, fontcolor="${k.dim}"]`)

  const bends = bendOrder(c)
  for (const name of bends) {
    const mixKey = BEND_MIX[name]
    run(nodeId(name), node(name, mixKey ? c[mixKey] > 0 : true))
  }
  if (bends.length === 0) {
    doors.add('Slot order')
    run(
      'no_bends',
      `  no_bends [label="no bends patched", fontcolor="${k.dim}", URL="#${groupAnchor('Slot order')}", tooltip="Slot order"]`,
    )
  }

  for (const [name, active] of [
    ['Stompbox', c.stompMix > 0],
    ['Tape delay', c.dlyMix > 0],
    ['Spring verb', c.revMix > 0],
    ['Brownout', c.brownAmt > 0 || c.brownRate > 0 || c.humLevel > 0],
    ['Tape machine', c.tapeMix > 0],
    ['Output', true],
  ] as const) {
    run(nodeId(name), node(name, active))
  }

  run(
    'out',
    `  out [label="dc block → clip → limit", shape=box, fontcolor="${k.dim}"]`,
  )

  lines.push(...wireRun(seq, k, o))

  // The bus is soldered to the board whether or not it is turned up, so it
  // stays on the map — greyed at zero, like any other stage sitting at no mix.
  // The wire carries the same URL as the box, so clicking the line that runs
  // off the output opens the bus's controls without hunting for the node.
  {
    const up = c.fbAmt > 0
    const wire = up ? k.accent2 : k.dim
    const dest = FB_TARGET[Math.round(c.fbDest)] ?? 'mix'
    const target =
      dest === 'mix'
        ? 'mix'
        : dest in SOURCE_ACTIVE
          ? `sources:${nodeId(dest)}`
          : nodeId(dest)
    const door = `URL="#${groupAnchor('Feedback bus')}", tooltip="Feedback bus"`
    lines.push(node('Feedback bus', up))
    lines.push(
      `  out -> ${nodeId('Feedback bus')} [color="${wire}", style=dashed, ${door}]`,
    )
    lines.push(
      `  ${nodeId('Feedback bus')} -> ${target} [color="${wire}", style=dashed, constraint=false, label=" ${o.live === false ? 'feedback' : c.fbAmt.toFixed(2)}", fontcolor="${wire}", fontsize=10, ${door}]`,
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
    const inStrip = dest in SOURCE_ACTIVE
    if (!inStrip && !drawn.has(nodeId(dest))) continue
    const anchor = inStrip ? 'sources' : nodeId(dest)
    const door = `URL="#${groupAnchor('Patch bay')}", tooltip="Patch bay"`
    const pickup = SRC_GROUP[src] ?? 'Patch bay'
    doors.add('Patch bay')
    doors.add(pickup)
    lines.push(
      `  wire${i} [label="${SRC_LABEL[src]}", shape=plaintext, fontcolor="${k.mod}", fontsize=10, URL="#${groupAnchor(pickup)}", tooltip="${pickup}"]`,
    )
    lines.push(
      `  wire${i} -> ${inStrip ? `sources:${nodeId(dest)}` : anchor} [color="${k.mod}", style=dotted, constraint=false, label=" ${o.live === false ? 'patch wire' : depth.toFixed(2)}", fontcolor="${k.mod}", fontsize=10, ${door}]`,
    )
    // sit the wire beside what it feeds, or it floats to the top and stretches
    // the whole drawing sideways
    lines.push(`  { rank=same; wire${i}; ${anchor} }`)
  }

  // The shelf hangs off the foot of every column, on invisible wire so it sits
  // under the board without drawing a signal that isn't there. The README's
  // copy is a picture of the path and nothing else, so it goes without.
  const shelf = GROUPS.map(g => g.name).filter(name => !doors.has(name))
  if (o.live !== false && shelf.length > 0) {
    const tails = [
      ...columns(seq, o).flatMap(col => col.slice(-1)),
      nodeId('Feedback bus'),
    ]
    lines.push(
      `  shelf [shape=none, margin=0, label=<${shelfStrip(shelf, c, o)}>]`,
      ...tails.map(tail => `  ${tail} -> shelf [style=invis]`),
    )
  }

  lines.push('}')
  return lines.join('\n')
}
