import { DEFAULT_CONTROLS, type Controls } from '../controls'
import { bendAt, BENDS, GROUPS, groupKeys, sliderFor } from './controls'
import { arrowhead, el, route, textWidth, type El, type Point } from './svg'

// The signal path, laid out and drawn: live bend order, the feedback wire, and
// where it lands. The panel mounts the drawing as React elements and
// scripts/chain-svg.ts writes the README's copy to a file, both from here.
//
// The layout is by hand because the drawing is a rack — a column of boxes,
// short hops between them, and a handful of wires round the outside — and
// nothing in it needs a solver. It used to go through graphviz, which is a
// megabyte of wasm to rank fifteen boxes nobody ever asked to be ranked.

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
  'Toy keyboard',
  'Toy drums',
  'Spring verb',
  'Tape delay',
  // A wire onto another wire's depth lands inside the bay rather than on any
  // stage, so the map has nothing on the path to point it at — the bay's own
  // panel is where those pairs read.
  'Patch bay',
  'Patch bay',
  'Patch bay',
  'Patch bay',
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
  9: 'Toy drums',
  10: 'Toy keyboard',
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

function nodeId(name: string): string {
  return name.replace(/\W+/g, '_')
}

// Settled once: the drawing asks after twenty groups' keys every time it is
// built, and it is built on every frame a board is travelling.
const KEYS_BY_GROUP = new Map(GROUPS.map(g => [g.name, groupKeys(g)]))

function touchedCount(name: string, c: Controls): number {
  const keys = KEYS_BY_GROUP.get(name)
  if (!keys) return 0
  let n = 0
  for (const k of keys) if (c[k] !== DEFAULT_CONTROLS[k]) n++
  return n
}

const FONT = 10
const SMALL = 9
const BOX_H = 20
const MIN_W = 96
const PAD_X = 9
const ROW_GAP = 9
/** the channel the folded path's cable runs up, between the two columns */
const COL_GAP = 28
const STRIP_ROW_H = 17
const LABEL_H = 12
/** from a wire label in the gutter to the box it feeds */
const STUB = 14
/** the outermost lane, which the feedback wire runs home in */
const LANE = 11
const BUS_GAP = 30
const MARGIN = 2

type Side = 'left' | 'right'

/** One source in the strip that stands in for all five of them. */
export interface MapRow {
  name: string
  count: number
  active: boolean
  open: boolean
  /** relative to the strip's own box */
  y: number
  h: number
}

export interface MapNode {
  id: string
  kind: 'stage' | 'plain' | 'strip' | 'label'
  label: string
  count: number
  /** the group this opens, where it opens one */
  door?: string
  active: boolean
  open: boolean
  x: number
  y: number
  w: number
  h: number
  /** 'label' only: which end of the text x is */
  anchor?: 'start' | 'end'
  /** 'strip' only */
  rows?: MapRow[]
}

export interface MapWire {
  id: string
  from: string
  to: string
  d: string
  arrow: string
  color: string
  dash?: string
  door?: string
  label?: { text: string; x: number; y: number; anchor: 'start' | 'end' }
}

export interface ChainMap {
  nodes: MapNode[]
  wires: MapWire[]
  /** the groups the drawing opens a door onto */
  doors: Set<string>
  width: number
  height: number
  palette: Palette
  links: boolean
}

export interface Options {
  palette?: Palette
  /** A live board shows how far each stage is off stock, the feedback amount
      and each wire's depth; the README's copy just names the parts, and takes
      no clicks, so it carries no links either. */
  live?: boolean
  /** Folds the path into two columns joined by a slack cable. The panel wants
      it — a straight run is 500px tall and buries every control under itself —
      and the README, drawn as a standalone image, does not. */
  wrap?: boolean
  /** The stage whose controls the panel is showing, lit on the map. */
  open?: string
}

const midX = (n: MapNode) => n.x + n.w / 2
const midY = (n: MapNode) => n.y + n.h / 2

/** Stacked height, the way a column of nodes comes out. */
const stack = (col: MapNode[]) =>
  col.reduce((h, n) => h + n.h + ROW_GAP, -ROW_GAP)

// Where to cut the path in two. Split by height rather than by count: the
// source strip is five rows deep and everything else is one, so cutting down
// the middle of the list leaves one column half again as tall as the other.
function foldAt(path: MapNode[]): number {
  const taller = (n: number) =>
    Math.max(stack(path.slice(0, n)), stack(path.slice(n)))
  let best = 1
  for (let i = 2; i < path.length; i++) if (taller(i) < taller(best)) best = i
  return best
}

// A run that leaves and arrives travelling the same way, turning at atY (or
// atX) in between — and a straight line when the two ends already line up.
const elbowV = (from: Point, to: Point, atY: number): Point[] =>
  from[0] === to[0] ? [from, to] : [from, [from[0], atY], [to[0], atY], to]

const elbowH = (from: Point, to: Point, atX: number): Point[] =>
  from[1] === to[1] ? [from, to] : [from, [atX, from[1]], [atX, to[1]], to]

export function buildMap(c: Controls, o: Options = {}): ChainMap {
  const k = o.palette ?? PANEL
  const live = o.live !== false
  // Every group the drawing opens, whether from a box, a strip row or a wire —
  // collected as it is drawn rather than worked out again afterwards, which is
  // how the tape machine came to be both on the path and listed as off it. The
  // panel shelves whatever is left, so no group is left without a door.
  const doors = new Set<string>(Object.keys(SOURCE_ACTIVE))
  const wires: MapWire[] = []

  const node = (
    id: string,
    kind: MapNode['kind'],
    label: string,
    extra: Partial<MapNode> = {},
  ): MapNode => ({
    id,
    kind,
    label,
    count: 0,
    active: true,
    open: false,
    x: 0,
    y: 0,
    w: 0,
    h: BOX_H,
    ...extra,
  })

  const stage = (name: string, active: boolean): MapNode => {
    doors.add(name)
    return node(nodeId(name), 'stage', name, {
      count: live ? touchedCount(name, c) : 0,
      active,
      open: o.open === name,
      door: name,
    })
  }

  // The sources ride one strip rather than five boxes of their own: a column
  // that is five stages longer at the top is five stages of map nobody needs.
  const rows: MapRow[] = Object.entries(SOURCE_ACTIVE).map(
    ([name, isLive], i) => ({
      name,
      count: live ? touchedCount(name, c) : 0,
      active: isLive(c),
      open: o.open === name,
      y: 1 + i * STRIP_ROW_H,
      h: STRIP_ROW_H,
    }),
  )
  const strip = node('sources', 'strip', 'sources', {
    rows,
    h: rows.length * STRIP_ROW_H + 2,
  })

  const path: MapNode[] = [strip, node('mix', 'plain', 'mix bus')]

  const bends = bendOrder(c)
  for (const name of bends) {
    const mixKey = BEND_MIX[name]
    path.push(stage(name, mixKey ? c[mixKey] > 0 : true))
  }
  if (bends.length === 0) {
    doors.add('Slot order')
    path.push(
      node('no_bends', 'plain', 'no bends patched', { door: 'Slot order' }),
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
    path.push(stage(name, active))
  }
  path.push(node('out', 'plain', 'dc block → clip → limit'))

  // The bus is soldered to the board whether or not it is turned up, so it
  // stays on the map — greyed at zero, like any other stage sitting at no mix.
  const fbUp = c.fbAmt > 0
  const bus = stage('Feedback bus', fbUp)

  // One width for every box on the rack, cut to the longest label on it.
  const boxW = Math.ceil(
    Math.max(
      MIN_W,
      ...[...path, bus].map(n =>
        n.kind === 'strip'
          ? Math.max(...n.rows!.map(r => cellWidth(r.name, r.count)))
          : cellWidth(n.label, n.count),
      ),
    ),
  )
  for (const n of [...path, bus]) n.w = boxW

  const cut = o.wrap ? foldAt(path) : path.length
  const [down, up] = [path.slice(0, cut), path.slice(cut)]
  for (const col of [down, up]) {
    let y = MARGIN
    for (const n of col) {
      n.y = y
      y += n.h + ROW_GAP
    }
  }
  const bodyBottom = MARGIN + Math.max(stack(down), stack(up))
  bus.y = bodyBottom + BUS_GAP

  // Where the feedback lands, and so which side of the map it comes home on.
  const dest = FB_TARGET[Math.round(c.fbDest)] ?? 'mix'
  const fbRow = rows.find(r => r.name === dest)
  const fbTarget = fbRow ? strip : path.find(n => n.id === nodeId(dest))!
  const fbSide: Side = up.includes(fbTarget) ? 'right' : 'left'

  const taps = collectTaps(c, o, {
    strip,
    rows,
    byId: new Map([...path, bus].map(n => [n.id, n])),
    doors,
    live,
  })
  const sideOf = (target: MapNode): Side =>
    target === bus
      ? fbSide === 'left'
        ? 'right'
        : 'left'
      : up.includes(target)
        ? 'right'
        : 'left'

  const spanW = up.length ? boxW * 2 + COL_GAP : boxW
  // A label hangs off the near edge of what it feeds, so one on the bus — which
  // sits in from both edges of the rack — needs none of the gutter to do it.
  const inset = (target: MapNode) => (target === bus ? (spanW - boxW) / 2 : 0)
  const gutter = (side: Side) =>
    Math.ceil(
      Math.max(
        fbSide === side ? LANE : 0,
        ...taps
          .filter(t => sideOf(t.target) === side)
          .map(
            t =>
              (fbSide === side ? LANE : 0) +
              textWidth(t.label, SMALL) +
              STUB -
              inset(t.target),
          ),
      ),
    )
  const [leftGutter, rightGutter] = [gutter('left'), gutter('right')]

  const colX = MARGIN + leftGutter
  for (const n of down) n.x = colX
  for (const n of up) n.x = colX + boxW + COL_GAP
  bus.x = colX + (spanW - boxW) / 2

  const width = MARGIN * 2 + leftGutter + spanW + rightGutter
  const laneX = (side: Side) =>
    side === 'left' ? MARGIN + LANE / 2 : width - MARGIN - LANE / 2

  const wire = (
    id: string,
    from: MapNode,
    to: MapNode,
    pts: Point[],
    rest: Partial<MapWire> & { color: string },
  ) => {
    wires.push({
      id,
      from: from.id,
      to: to.id,
      d: route(pts),
      arrow: arrowhead(pts),
      ...rest,
    })
  }

  // The path itself: a hop from the foot of each box to the head of the next.
  for (const col of [down, up]) {
    for (let i = 1; i < col.length; i++) {
      const [a, b] = [col[i - 1]!, col[i]!]
      wire(
        `${a.id}-${b.id}`,
        a,
        b,
        [
          [midX(a), a.y + a.h],
          [midX(b), b.y],
        ],
        { color: k.border },
      )
    }
  }

  // The fold: down the left, up the empty channel between the columns, into the
  // top of the right. Slack, and the one line on the map that isn't a short hop,
  // which is what makes it read as the cable carrying the eye across.
  if (up.length) {
    const [a, b] = [down[down.length - 1]!, up[0]!]
    const chan = colX + boxW + COL_GAP / 2
    wire(
      'fold',
      a,
      b,
      [
        [midX(a), a.y + a.h],
        [midX(a), a.y + a.h + ROW_GAP],
        [chan, a.y + a.h + ROW_GAP],
        [chan, midY(b)],
        [b.x, midY(b)],
      ],
      { color: k.accent },
    )
  }

  const tail = path[path.length - 1]!
  const fbColor = fbUp ? k.accent2 : k.dim
  wire(
    'fb-out',
    tail,
    bus,
    elbowV([midX(tail), tail.y + tail.h], [midX(bus), bus.y], bus.y - 10),
    { color: fbColor, dash: '4 3', door: 'Feedback bus' },
  )
  // Home the long way, round the outside of the rack. The wire carries the
  // bus's own door, so clicking the line that runs off the output opens the
  // bus's controls without hunting for the box.
  const fbY = fbRow ? strip.y + fbRow.y + fbRow.h / 2 : midY(fbTarget)
  {
    const lane = laneX(fbSide)
    const [busEdge, landing] =
      fbSide === 'left'
        ? [bus.x, fbTarget.x]
        : [bus.x + bus.w, fbTarget.x + fbTarget.w]
    wire(
      'fb-home',
      bus,
      fbTarget,
      [
        [busEdge, midY(bus)],
        [lane, midY(bus)],
        [lane, fbY],
        [landing, fbY],
      ],
      {
        color: fbColor,
        dash: '4 3',
        door: 'Feedback bus',
        label: {
          text: live ? c.fbAmt.toFixed(2) : 'feedback',
          x: lane + (fbSide === 'left' ? 4 : -4),
          y: bodyBottom + 13,
          anchor: fbSide === 'left' ? 'start' : 'end',
        },
      },
    )
  }

  // Every wire off the patch bay, and the trigger lines between the two toys,
  // as a label out in the gutter with a short run onto what it feeds. Both ends
  // of a trigger line sit in the source strip, where a wire from the strip onto
  // itself would be a loop drawn back through the middle of the path.
  const labels: MapNode[] = []
  // Where a label would be struck through by a line already drawn: its
  // neighbours, and the run the feedback wire comes home on.
  const taken: Record<Side, [number, number][]> = { left: [], right: [] }
  taken[fbSide].push([fbY - LABEL_H / 2, fbY + LABEL_H / 2])
  const clear = (side: Side, want: number) => {
    let y = want
    for (const [top, bottom] of taken[side].sort((a, b) => a[0] - b[0]))
      if (y < bottom && y + LABEL_H > top) y = bottom + 3
    taken[side].push([y, y + LABEL_H])
    return y
  }

  for (const tap of taps.sort((a, b) => tapY(a) - tapY(b))) {
    const side = sideOf(tap.target)
    const y = clear(side, tapY(tap) - LABEL_H / 2)
    const edge = side === 'left' ? tap.target.x : tap.target.x + tap.target.w
    const anchorX = edge + (side === 'left' ? -STUB : STUB)
    const label = node(tap.id, 'label', tap.label, {
      door: tap.door,
      x: anchorX,
      y,
      w: textWidth(tap.label, SMALL),
      h: LABEL_H,
      anchor: side === 'left' ? 'end' : 'start',
    })
    labels.push(label)
    wire(
      `${tap.id}-wire`,
      label,
      tap.target,
      elbowH(
        [anchorX + (side === 'left' ? 3 : -3), y + LABEL_H / 2],
        [edge, tapY(tap)],
        (anchorX + edge) / 2,
      ),
      { color: k.mod, dash: tap.dash, door: tap.wireDoor },
    )
  }

  return {
    nodes: [...path, bus, ...labels],
    wires,
    doors,
    width,
    height: Math.max(bus.y + bus.h, ...labels.map(l => l.y + l.h)) + MARGIN,
    palette: k,
    links: live,
  }
}

/** The gap between a stage's name and how far off stock it is sitting. */
const COUNT_GAP = 5

const cellWidth = (label: string, count: number) =>
  textWidth(label, FONT) +
  (count > 0 ? COUNT_GAP + textWidth(String(count), FONT) : 0) +
  PAD_X * 2

interface Tap {
  id: string
  label: string
  /** what the label opens: whatever this end is clipped onto */
  door: string
  /** what the wire opens: the bay it is patched at */
  wireDoor: string
  target: MapNode
  row?: MapRow
  dash: string
}

const tapY = (t: Tap) =>
  t.row ? t.target.y + t.row.y + t.row.h / 2 : midY(t.target)

function collectTaps(
  c: Controls,
  o: Options,
  ctx: {
    strip: MapNode
    rows: MapRow[]
    byId: Map<string, MapNode>
    doors: Set<string>
    live: boolean
  },
): Tap[] {
  const taps: Tap[] = []
  for (const [key, from, to] of [
    ['trigToKeys', 'Toy drums', 'Toy keyboard'],
    ['trigToDrum', 'Toy keyboard', 'Toy drums'],
  ] as const) {
    const choice = Math.round(c[key])
    if (choice <= 0) continue
    ctx.doors.add('Trigger patch')
    taps.push({
      id: key,
      label: `${sliderFor(key).choices?.[choice] ?? 'trig'} trig`,
      door: from,
      wireDoor: 'Trigger patch',
      target: ctx.strip,
      row: ctx.rows.find(r => r.name === to),
      dash: '4 3',
    })
  }

  // A wire onto a stage that isn't in the path does nothing, so it isn't drawn.
  for (const i of [0, 1, 2, 3] as const) {
    const src = Math.round(c[`mod${i}Src`])
    const depth = c[`mod${i}Depth`]
    const dest = WIRE_TARGET[Math.round(c[`mod${i}Dest`])]
    if (src === 0 || depth === 0 || !dest) continue
    const row = ctx.rows.find(r => r.name === dest)
    const target = row ? ctx.strip : ctx.byId.get(nodeId(dest))
    if (!target) continue
    const pickup = SRC_GROUP[src] ?? 'Patch bay'
    ctx.doors.add('Patch bay')
    ctx.doors.add(pickup)
    taps.push({
      id: `wire${i}`,
      label: ctx.live
        ? `${SRC_LABEL[src]} ${depth.toFixed(2)}`
        : `${SRC_LABEL[src]}`,
      door: pickup,
      wireDoor: 'Patch bay',
      target,
      row,
      dash: '1 3',
    })
  }
  return taps
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
    const bend = bendAt(id)
    if (!bend || seen.has(id)) continue
    seen.add(id)
    names.push(bend.group)
  }
  return names
}

const BEND_MIX: Record<string, keyof Controls> = Object.fromEntries(
  BENDS.map(b => [b.group, b.mix]),
)

// ---- the drawing ----------------------------------------------------------

const baseline = (y: number, h: number, size: number) => y + h / 2 + size * 0.35

function door(inner: El[], name: string | undefined, links: boolean): El[] {
  if (!name || !links) return inner
  return [el('a', { href: `#${groupAnchor(name)}`, 'data-door': name }, inner)]
}

function cell(
  label: string,
  count: number,
  x: number,
  y: number,
  size: number,
  fill: string,
  accent: string,
  anchor?: 'start' | 'end',
): El {
  // dx, not a space: a run of spaces at the head of a tspan collapses away.
  const kids: (El | string)[] = [label]
  if (count > 0)
    kids.push(el('tspan', { dx: COUNT_GAP, fill: accent }, [String(count)]))
  return el(
    'text',
    { x, y, fill, fontSize: size, textAnchor: anchor ?? 'middle' },
    kids,
  )
}

function drawNode(n: MapNode, k: Palette, links: boolean): El {
  if (n.kind === 'label') {
    return el('g', { className: 'tap' }, [
      ...door(
        [
          cell(
            n.label,
            0,
            n.x,
            baseline(n.y, n.h, SMALL),
            SMALL,
            k.mod,
            k.mod,
            n.anchor,
          ),
        ],
        n.door,
        links,
      ),
    ])
  }
  if (n.kind === 'strip') {
    const parts: El[] = [
      el('rect', {
        className: 'box',
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: 3,
        fill: k.bg,
        stroke: k.border,
      }),
    ]
    for (const [i, r] of n.rows!.entries()) {
      const y = n.y + r.y
      // The row's own fill is the lit one when it is open and a transparent one
      // when it isn't, which is what gives a row the whole of itself to click.
      const inner: El[] = [
        el('rect', {
          x: n.x + 1,
          y,
          width: n.w - 2,
          height: r.h,
          fill: r.open ? k.open : 'transparent',
        }),
      ]
      inner.push(
        cell(
          r.name,
          r.count,
          midX(n),
          baseline(y, r.h, FONT),
          FONT,
          r.active || r.open ? k.fg : k.dim,
          k.accent,
        ),
      )
      parts.push(el('g', { className: 'row' }, door(inner, r.name, links)))
      if (i > 0)
        parts.push(
          el('line', {
            x1: n.x + 1,
            y1: y,
            x2: n.x + n.w - 1,
            y2: y,
            stroke: k.border,
          }),
        )
    }
    return el('g', { className: 'node' }, parts)
  }
  const lit = n.open ? k.fg : n.count > 0 ? k.accent : k.border
  const inner = [
    el('rect', {
      className: 'box',
      x: n.x,
      y: n.y,
      width: n.w,
      height: n.h,
      rx: 4,
      fill: n.open ? k.open : k.bg,
      stroke: n.kind === 'plain' ? k.border : lit,
      strokeWidth: n.open ? 2 : 1,
    }),
    cell(
      n.label,
      n.count,
      midX(n),
      baseline(n.y, n.h, FONT),
      FONT,
      n.kind === 'plain' ? k.dim : n.active || n.open ? k.fg : k.dim,
      k.accent,
    ),
  ]
  return el('g', { className: 'node' }, door(inner, n.door, links))
}

function drawWire(w: MapWire, links: boolean): El {
  const parts: El[] = [
    el('path', {
      className: 'line',
      d: w.d,
      fill: 'none',
      stroke: w.color,
      strokeWidth: 1.2,
      strokeDasharray: w.dash,
    }),
    el('path', { className: 'head', d: w.arrow, fill: w.color }),
  ]
  if (w.label)
    parts.push(
      el(
        'text',
        {
          x: w.label.x,
          y: w.label.y,
          fill: w.color,
          fontSize: SMALL,
          textAnchor: w.label.anchor,
        },
        [w.label.text],
      ),
    )
  // A hairline is a hard thing to click and a dashed one only takes the dashes,
  // so a wire that is a door lays a transparent twin under itself — 8 wide, so
  // the band stays inside the gap to whatever it runs past.
  if (w.door && links)
    parts.unshift(
      el('path', {
        d: w.d,
        fill: 'none',
        stroke: 'transparent',
        strokeWidth: 8,
      }),
    )
  return el('g', { className: 'wire' }, door(parts, w.door, links))
}

export function drawMap(map: ChainMap): El {
  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${map.width} ${map.height}`,
      width: map.width,
      height: map.height,
      fontFamily: 'Helvetica, Arial, sans-serif',
    },
    [
      ...map.wires.map(w => drawWire(w, map.links)),
      ...map.nodes.map(n => drawNode(n, map.palette, map.links)),
    ],
  )
}
