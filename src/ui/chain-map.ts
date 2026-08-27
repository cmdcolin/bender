import type { ControlKey, Controls } from '../controls'
import { PEDALS, pedalOrderAt } from '../pedals'
import { bendAt, BENDS, sliderFor, touchedCount } from './controls'
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
  // stage, so it draws onto the bay's own box at the foot of the map.
  'Patch bay',
  'Patch bay',
  'Patch bay',
  'Patch bay',
  'Delay pedal',
] as const

// The stages that can be wired to droop with the board's supply, and the
// control on each that wires it. Brownout drags that rail — so does the toy's
// starve knob — and this is the only thing on the map that says how far its
// reach goes past its own box.
const RAIL_LINK = [
  ['stompSag', 'Stompbox'],
  ['tapeMotorRail', 'Tape delay'],
  ['fbSag', 'Feedback bus'],
] as const satisfies readonly (readonly [ControlKey, string])[]

const SRC_LABEL = sliderFor('mod0Src').choices ?? []

/** what the rack calls the bends riding in it rather than in one of its slots.
    They are on the board — every one of them is soldered in and has a panel of
    its own — and out of the path, which is the thing worth saying. */
const OFF_BOARD = 'in no slot'

/** what the empty trigger lane calls itself, which is also its door */
const NO_TRIG = 'no trig patched'

// A wire's label names what it picks up, so it opens the thing it is clipped
// onto rather than the bay — mod*Src order. The rest (the bay's own LFO, the
// supply sag, the output envelope) belong to no one stage, so they open the bay.
const SRC_GROUP: Record<number, string> = {
  4: 'Mic',
  5: 'Body contact',
  6: 'Body contact',
  7: 'Feedback bus',
  8: 'Toy keyboard',
  9: 'Toy drums',
  10: 'Toy keyboard',
}

// Where the mic wire is soldered, in micPatch order. Only the first of the
// seven reaches the mix; the rest land in the middle of something.
const MIC_TARGET = [
  'mix',
  // The rail is the keyboard's to own — it holds the starve knob that moves it.
  'Toy keyboard',
  'Chaos osc',
  'Tape delay',
  'Ring mod',
  'Toy drums',
  'Glitch buffer',
] as const

// What each source is turned up to, which is also whether it is in the mix at
// all. The loudest of its levels, as a share of that fader's own travel, so the
// sampler — which goes to 2 — reads against the same wall as the chip, which
// goes to 1.
const SOURCE_LEVELS: Record<string, readonly ControlKey[]> = {
  'Toy keyboard': ['chipLevel'],
  'FM chip': ['fmLevel'],
  'Toy drums': ['drumLevel'],
  'Chaos osc': ['oscLevel'],
  'Noise & crackle': ['noiseLevel', 'crackleAmp'],
  Sampler: ['sampleLevel'],
}

// The two you play, side by side across the head of the toy board. They are the
// pair: two machines with a run switch, a pattern and a set of keys each.
const TOY_ROW = ['Toy keyboard', 'Toy drums'] as const

// And the one you don't. The FM chip has no keyboard and no sequencer of its
// own — its key input is soldered onto the toy's gate line — so it stands next
// to the keyboard, on the end of that wire, rather than beside the drums as an
// equal. It hung underneath for a while, which said the same thing and cost a
// whole row of the drawing to say: a 34px band holding one box, with the half
// beside it empty. Adjacency says it for nothing, and the row had the width to
// give — two boxes were being stretched to 190 to carry labels wanting 128.
//
// All three are inside the frame because all three are one piece of hardware on
// one supply, which is what the frame and its rail are there to say; the starve
// knob on the keyboard's panel bends every one of them.
const FM_CHIP = 'FM chip'

// The three that take no supply and no trigger from anything: they start where
// they stand, and they are the only sources on the board that do.
const LINE_ROW = ['Chaos osc', 'Noise & crackle', 'Sampler'] as const

const sourceLevel = (name: string, c: Controls): number =>
  Math.max(...SOURCE_LEVELS[name]!.map(key => c[key] / sliderFor(key).max))

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
  /** fill under the two toys, which sit in the rack rather than beside it */
  raise: string
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
  raise: '#242429',
}

export function groupAnchor(name: string): string {
  return `group-${name.replace(/\W+/g, '-')}`
}

function nodeId(name: string): string {
  return name.replace(/\W+/g, '_')
}

// The drawing's own scale, which is not the size it ends up: the panel fits it
// to the column, so what these set is how big the labels are *relative to the
// boxes and the gaps*. Going up a step here is not the same as scaling the
// whole drawing up — CAP_H, LABEL_H and every gap stay where they are, so the
// text grows and the picture barely does.
const FONT = 11
const SMALL = 10
const BOX_H = 22
const MIN_W = 100
const PAD_X = 9
const ROW_GAP = 9
/** the channel the folded path's cable runs up, between the two columns */
const COL_GAP = 28
/** an instrument's own box: a name and a count over a fader */
const INST_H = 34
const INST_GAP = 12
/** the lip a frame carries its name on */
const CAP_H = 12
/** the inset the chips sit at inside the toy board's frame */
const FRAME_PAD = 6
/** the supply bar over the chips, and the trigger cables under them */
const RAIL_H = 10
const TRIG_H = 13
/** from the foot of the source rows down to the bar that collects them */
const COLLECT_H = 14
/** from the collector to the mix bus, and from the mix bus to the fold */
const BAND_GAP = 12
/** a source's own glyph, and the column it sits in at the left of its box */
const ICON = 12
const ICON_COL = 16
/** a loose bend riding in the rack: its own row inside the box, and the pad
    round the short name it wears in a slot */
const CHIP_H = 16
const CHIP_GAP = 4
const CHIP_PAD = 5
/** the column a stage's off-stock count, and its way back, sits in — wide
    enough that a two-digit count is inside the button it is the face of */
const COUNT_COL = 18
const COUNT_INSET = 6
const LABEL_H = 12
/** from a wire label in the gutter to the box it feeds */
const STUB = 14
/** the outermost lane, which the feedback wire runs home in */
const LANE = 11
const BUS_GAP = 30
const MARGIN = 2

type Side = 'left' | 'right'

export interface MapNode {
  id: string
  kind: 'stage' | 'inst' | 'frame' | 'label' | 'rack' | 'chip'
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
  /** 'inst' only: how far its fader is up, along that fader's own travel */
  level?: number
  /** 'inst' only: running right now, off a switch of its own */
  playing?: boolean
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
  label?: {
    text: string
    x: number
    y: number
    anchor: 'start' | 'middle' | 'end'
  }
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
  /** Sources sounding right now, which is a thing about the run switches
      rather than about the board — the panel knows it and the README doesn't. */
  playing?: readonly string[]
}

const midX = (n: MapNode) => n.x + n.w / 2
const midY = (n: MapNode) => n.y + n.h / 2

/** Stacked height, the way a column of nodes comes out. */
const stack = (col: MapNode[]) =>
  col.reduce((h, n) => h + n.h + ROW_GAP, -ROW_GAP)

// Where to cut the path in two, by height rather than by count — which is what
// keeps the two columns level when a box that isn't one row tall lands in one.
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

// A row of boxes across a span, each as wide as its own name needs and the
// slack shared out in proportion. Uniform widths would be cut to the longest
// name on the row, which is 'Noise & crackle' — and three of those across is a
// band half again as wide as the panel has to give it.
function spread(
  row: MapNode[],
  x0: number,
  span: number,
  gaps: number[],
  natural: (n: MapNode) => number,
) {
  const want = row.map(natural)
  const total = want.reduce((a, b) => a + b, 0)
  const between = gaps.slice(0, row.length - 1).reduce((a, b) => a + b, 0)
  const slack = span - between - total
  let x = x0
  for (const [i, n] of row.entries()) {
    n.w = want[i]! + (slack * want[i]!) / total
    n.x = x
    x += n.w + (gaps[i] ?? 0)
  }
}

interface Bridge {
  id: string
  from: string
  to: string
  label: string
}

/** The trigger lines you can bridge the two toys with, where one is patched. */
function triggerBridges(c: Controls): Bridge[] {
  const bridges: Bridge[] = []
  for (const [key, from, to] of [
    ['trigToKeys', 'Toy drums', 'Toy keyboard'],
    ['trigToDrum', 'Toy keyboard', 'Toy drums'],
  ] as const) {
    const choice = Math.round(c[key])
    if (choice <= 0) continue
    bridges.push({
      id: key,
      from,
      to,
      label: `${sliderFor(key).choices?.[choice] ?? 'trig'} trig`,
    })
  }
  return bridges
}

export function buildMap(c: Controls, o: Options = {}): ChainMap {
  const k = o.palette ?? PANEL
  const live = o.live !== false
  // Every group the drawing opens, whether from a box, a strip row or a wire —
  // collected as it is drawn rather than worked out again afterwards, which is
  // how the tape machine came to be both on the path and listed as off it. The
  // panel shelves whatever is left, so no group is left without a door.
  const doors = new Set<string>(Object.keys(SOURCE_LEVELS))
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

  // The sources, as the six boxes they are. Which of them is wired to which is
  // the thing the map is here to say, and a rack of six alike rows said none of
  // it: three of these share a supply, one of the three has no keyboard of its
  // own, and the other three start where they stand.
  const playing = new Set(o.playing ?? [])
  const instrument = (name: string): MapNode => {
    const level = sourceLevel(name, c)
    return node(nodeId(name), 'inst', name, {
      count: live ? touchedCount(name, c) : 0,
      active: level > 0,
      open: o.open === name,
      door: name,
      level,
      playing: playing.has(name),
      h: INST_H,
    })
  }
  const toys = TOY_ROW.map(instrument)
  const fm = instrument(FM_CHIP)
  const chips = [...toys, fm]
  const lines = LINE_ROW.map(instrument)
  // The frame is a door too: the parts on the board — the cap on the timing
  // pin, the reset chip, the one output stage — are what the outline is round.
  // So the lip says what it opens rather than what the outline is: three named
  // machines and a supply rail across them already say that this is the toy
  // board, and nothing else on the drawing said where its parts were.
  doors.add('Board parts')
  const board = node('toy_board', 'frame', 'board parts', {
    door: 'Board parts',
  })
  // The bus is a stage like any other: it has a door, a count and a way back,
  // because what the six faders are set to against each other is a setting of
  // the board and was the one the panel had nowhere to show. Its id stays 'mix'
  // — the feedback return and the mic wire both name it by that.
  doors.add('Mix bus')
  const mix = node('mix', 'stage', 'mix bus', {
    count: live ? touchedCount('Mix bus', c) : 0,
    // Only the first of the mic's seven solder points is the mix — the rest land
    // in the middle of something, and a shout browning the toy out is not a
    // channel on this desk.
    active:
      [...lines, ...chips].some(n => n.active) ||
      (c.micLevel > 0 && Math.round(c.micPatch) === 0),
    open: o.open === 'Mix bus',
    door: 'Mix bus',
  })

  const path: MapNode[] = []

  // The rack itself, at the head of the run rather than on a shelf under the
  // drawing: the signal walks into it before it walks the slots. Six slots and
  // seven bends, so one is always in none of them — those ride at the head of
  // the path as loose chips, each a door of its own, which is where a stage
  // that is on the board and not in the path belongs.
  const bends = bendOrder(c)
  const loose = BENDS.filter(b => !bends.includes(b.group))
  const chipW = loose.map(b => textWidth(b.label, SMALL) + CHIP_PAD * 2)
  // With nothing in any slot, every bend on the board is a loose chip, which
  // is plain enough without a caption saying so.
  const capW = bends.length ? textWidth(OFF_BOARD, SMALL) + 6 : 0
  for (const b of loose) doors.add(b.group)
  // No box of its own, and no door: which bend runs where is Signal order's to
  // open, off the foot of the drawing. What's left of the rack is a place to
  // anchor the loose chips and the run down to the first bend — nothing worth
  // drawing a frame around.
  const rack = node(
    'rack',
    'rack',
    bends.length ? 'signal chain' : 'no bends patched',
  )
  path.push(rack)
  for (const name of bends) {
    const mixKey = BEND_MIX[name]
    path.push(stage(name, mixKey ? c[mixKey] > 0 : true))
  }

  // Where the bends end and the pedals begin — no head on the second run, since
  // nothing here is a door any more: both runs are Signal order's, off the foot
  // of the drawing, and the four pedal boxes need no header to say they are the
  // board's rather than the rack's.
  const active: Record<string, boolean> = {
    Stompbox: c.stompMix > 0,
    'Tape delay': c.dlyMix > 0,
    'Delay pedal': c.echoLevel > 0,
    'Spring verb': c.revMix > 0 || c.revDryCut > 0,
  }
  for (const i of pedalOrderAt(c.pedalOrder)) {
    const name = PEDALS[i]!.group
    path.push(stage(name, active[name]!))
  }

  for (const [name, on] of [
    ['Brownout', c.brownAmt > 0 || c.brownRate > 0 || c.humLevel > 0],
    ['Tape machine', c.tapeMix > 0],
    ['Output', true],
  ] as const) {
    path.push(stage(name, on))
  }

  // The bus is soldered to the board whether or not it is turned up, so it
  // stays on the map — greyed at zero, like any other stage sitting at no mix.
  const fbUp = c.fbAmt > 0 || c.fb2Amt > 0 || c.fb3Amt > 0
  const bus = stage('Feedback bus', fbUp)

  // The fittings the path runs past rather than through: the bay, whose wires
  // fly down the outside of the rack, the pad you push one with, the wear that
  // covers the board rather than landing on any one stage, and which order the
  // bends and the pedals run in — a setting about the two runs together rather
  // than about a position in either. They sit at the foot of the drawing, under
  // the bus, because that is where everything that goes round the path rather
  // than along it already is — and they stay there with nothing patched, greyed,
  // for the reason the bus does.
  const patched = ([0, 1, 2, 3] as const).filter(
    i => Math.round(c[`mod${i}Src`]) > 0 && c[`mod${i}Depth`] !== 0,
  )
  const bay = stage('Patch bay', patched.length > 0)
  const pad = stage(
    'Body contact',
    patched.some(
      i => SRC_GROUP[Math.round(c[`mod${i}Src`])] === 'Body contact',
    ),
  )
  // Heat, the burst rate every fault on the board rolls against, the loop
  // wired to its own supply, and the solder under the bend slots: nothing here
  // is about one stage, so none of it has a box to hang off.
  const wear = stage(
    'Wear',
    c.heatAmt > 0 ||
      c.faultCluster > 0 ||
      c.couple > 0 ||
      c.jointChatter > 0 ||
      c.relayRate > 0,
  )
  const order = stage('Signal order', touchedCount('Signal order', c) > 0)
  // Pad then bay, left to right, because that is the way the one wire between
  // them runs: the pad's two axes reach the board only through the bay. Wear
  // and Signal order touch neither, so they stand clear on the end.
  const foot = [pad, bay, wear, order]

  // How wide a box has to be to hold what is written on it. The count column is
  // held open whether or not anything is off stock yet: it is a button, and a
  // rack that grows a column the first time a control moves would resize itself
  // under every morph.
  const countCol = live ? COUNT_COL : 0
  const natural = (n: MapNode) =>
    PAD_X * 2 +
    (n.kind === 'inst' ? ICON_COL : 0) +
    textWidth(n.label, FONT) +
    countCol
  const sum = (row: MapNode[]) => row.reduce((a, n) => a + natural(n), 0)

  // The trigger bridges are patch cables, so they are only in the way when one
  // is patched — and the board's frame is only as deep as what is inside it.
  const trigs = triggerBridges(c)
  doors.add('Trigger patch')

  const cut = o.wrap ? foldAt(path) : path.length
  const [down, up] = [path.slice(0, cut), path.slice(cut)]
  const cols = up.length ? 2 : 1

  // One content width for the whole drawing, wide enough for the source band
  // and for the folded path both, and whichever came out narrower stretches to
  // it. The band is the usual winner: six boxes across beats two columns.
  const content = Math.ceil(
    Math.max(
      sum(chips) + INST_GAP * 2 + FRAME_PAD * 2,
      sum(lines) + INST_GAP * (lines.length - 1),
      sum(foot) + INST_GAP * (foot.length - 1),
      cols *
        Math.max(
          MIN_W,
          // Whatever the widest chip in the rack needs beside the caption: a
          // column cut to the names on the path would spill them out of it.
          PAD_X * 2 + capW + Math.max(0, ...chipW),
          // The rack draws no box of its own, so its label costs no width —
          // only the stages actually on the path do.
          ...[...path, bus]
            .filter(n => n.kind !== 'rack')
            .map(
              n =>
                PAD_X * 2 +
                iconCol(n.label) +
                textWidth(n.label, FONT) +
                countCol,
            ),
        ) +
        (cols - 1) * COL_GAP,
    ),
  )
  const boxW = (content - (cols - 1) * COL_GAP) / cols
  for (const n of [...path, bus]) n.w = boxW
  mix.w = content
  board.w = content
  for (const n of foot) n.w = natural(n)

  // The loose bends laid across the rack's own width, wrapping onto another row
  // rather than off the box — six of them at panel width is two rows, and a
  // rack spilling its chips would be a drawing lying about where they are.
  const rackChips: {
    group: string
    label: string
    x: number
    row: number
    w: number
  }[] = []
  {
    let [x, row] = [0, 0]
    for (const [i, b] of loose.entries()) {
      const w = chipW[i]!
      if (x > 0 && PAD_X + capW + x + w > boxW - PAD_X) {
        row++
        x = 0
      }
      rackChips.push({
        group: b.group,
        label: b.label,
        x: PAD_X + capW + x,
        row,
        w,
      })
      x += w + CHIP_GAP
    }
  }
  const lastChip = rackChips[rackChips.length - 1]
  rack.h = BOX_H + (lastChip ? lastChip.row + 1 : 0) * CHIP_H

  // --- down the drawing -----------------------------------------------------

  board.y = MARGIN
  const railY = board.y + CAP_H + 6
  const chipY = railY + RAIL_H
  for (const n of chips) n.y = chipY
  // The lane under the row, which carries everything written about the row
  // rather than about one box in it: what the key line is, the bridges you have
  // patched across it, and — when you have patched none — that there are none.
  const laneY = chipY + INST_H
  const trigY = laneY + TRIG_H
  board.h = laneY + Math.max(CHIP_H, trigs.length * TRIG_H) - board.y + 4

  const lineY = board.y + board.h + BAND_GAP
  for (const n of lines) n.y = lineY
  const collectY = lineY + INST_H + COLLECT_H
  mix.y = collectY + BAND_GAP

  const pathTop = mix.y + mix.h + ROW_GAP
  for (const col of [down, up]) {
    let y = pathTop
    for (const n of col) {
      n.y = y
      y += n.h + ROW_GAP
    }
  }
  const bodyBottom = pathTop + Math.max(stack(down), stack(up))
  bus.y = bodyBottom + BUS_GAP
  for (const n of foot) n.y = bus.y + bus.h + ROW_GAP

  // --- across it, at an origin of zero, so the gutters can be measured off the
  // --- x each box has already landed on and everything shifted once after ----

  // By their labels rather than evenly: the chip is the one you do not play and
  // it should not come out the size of the two you do.
  spread(
    [toys[0]!, fm, toys[1]!],
    FRAME_PAD,
    content - FRAME_PAD * 2,
    [INST_GAP, INST_GAP],
    natural,
  )
  spread(lines, 0, content, [INST_GAP, INST_GAP], natural)
  board.x = 0
  mix.x = 0
  for (const n of down) n.x = 0
  for (const n of up) n.x = boxW + COL_GAP
  bus.x = (content - boxW) / 2
  const footSpan =
    foot.reduce((a, n) => a + n.w, 0) + INST_GAP * (foot.length - 1)
  {
    let x = (content - footSpan) / 2
    for (const n of foot) {
      n.x = x
      x += n.w + INST_GAP
    }
  }

  // What the rack is carrying, drawn inside it now that it has landed: the
  // bends in none of its slots, and what to call those.
  const loosePart = new Map(
    rackChips.map(ch => [
      ch.group,
      node(nodeId(ch.group), 'chip', ch.label, {
        door: ch.group,
        active: false,
        open: o.open === ch.group,
        x: rack.x + ch.x,
        y: rack.y + BOX_H + ch.row * CHIP_H + 1,
        w: ch.w,
        h: CHIP_H - 2,
      }),
    ]),
  )
  const parts: MapNode[] = [...loosePart.values()]
  if (capW > 0)
    parts.push(
      node('off_board', 'label', OFF_BOARD, {
        active: false,
        x: rack.x + PAD_X,
        y: rack.y + BOX_H + 2,
        w: capW,
        h: LABEL_H,
        anchor: 'start',
      }),
    )
  const band = [...chips, ...lines]
  const byId = new Map(
    [...path, ...band, ...foot, mix, bus].map(n => [n.id, n]),
  )

  // Where the feedback lands, and so which side of the map it comes home on.
  const fbTarget = byId.get(nodeId(FB_TARGET[Math.round(c.fbDest)] ?? 'mix'))!
  const taps = collectTaps(c, { byId, doors, live, loosePart, rack, foot })

  // Which edge of the drawing a label on this box hangs off. A box in the right
  // column, or in the right-hand half of the band, reaches for the right — and
  // the feedback bus takes the edge the feedback wire isn't already using.
  const half = (n: MapNode): Side => (midX(n) > content / 2 ? 'right' : 'left')
  const fbSide = half(fbTarget)
  const sideOf = (target: MapNode): Side =>
    target === bus ? (fbSide === 'left' ? 'right' : 'left') : half(target)

  // How much gutter a tap needs: its label, its run onto the box, and back off
  // whatever the box already sits in from that edge.
  const reach = (t: Tap, side: Side) =>
    textWidth(t.label, SMALL) +
    STUB -
    (side === 'left' ? t.edge.x : content - (t.edge.x + t.edge.w))
  const gutter = (side: Side) =>
    Math.ceil(
      Math.max(
        fbSide === side ? LANE : 0,
        ...taps
          .filter(t => sideOf(t.edge) === side)
          .map(t => (fbSide === side ? LANE : 0) + reach(t, side)),
      ),
    )
  const [leftGutter, rightGutter] = [gutter('left'), gutter('right')]
  // Which edge each tap reaches for, settled here and carried: sideOf reads an
  // x measured from zero, and the whole drawing is about to move right by the
  // gutter it just sized.
  const tapSide = new Map(taps.map(t => [t, sideOf(t.edge)]))

  const colX = MARGIN + leftGutter
  for (const n of [...path, ...band, ...foot, ...parts, board, mix, bus])
    n.x += colX

  const width = MARGIN * 2 + leftGutter + content + rightGutter
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

  // A run with no head on it: a supply bar is not a signal going anywhere.
  const bar = (
    id: string,
    from: MapNode,
    to: MapNode,
    pts: Point[],
    rest: Partial<MapWire> & { color: string },
  ) => wire(id, from, to, pts, { ...rest, arrow: '' })

  // --- inside the toy board -------------------------------------------------

  // The supply: one bar over all three, because it is one rail. The starve knob
  // that drags it sits on the keyboard's panel, and this is the only thing on
  // the map that says the other two go with it.
  bar(
    'rail',
    board,
    board,
    [
      [board.x + FRAME_PAD, railY],
      [board.x + board.w - FRAME_PAD, railY],
    ],
    {
      color: k.dim,
      dash: '1 2',
      label: {
        text: 'shared supply',
        x: board.x + board.w - FRAME_PAD,
        y: railY - 4,
        anchor: 'end',
      },
    },
  )
  // Droppers onto the two boxes the bar is over. The FM chip takes the same
  // supply and has no dropper of its own: it is under the keyboard, inside the
  // frame, and a dotted line reaching it would have to cross the row to do it.
  for (const toy of chips)
    bar(
      `rail-${toy.id}`,
      board,
      toy,
      [
        [midX(toy), railY],
        [midX(toy), chipY],
      ],
      { color: k.dim, dash: '1 2' },
    )

  // The key line, which is solder rather than a cable you patched: the FM chip
  // has no keyboard and no sequencer, so every note it plays arrives on the
  // gate line the toy brings out. Straight across the joint between the two,
  // which standing next to each other is what the shape of the thing has
  // become.
  const joint = (toys[0]!.x + toys[0]!.w + fm.x) / 2
  wire(
    'key-line',
    toys[0]!,
    fm,
    [
      [toys[0]!.x + toys[0]!.w, chipY + INST_H / 2],
      [fm.x, chipY + INST_H / 2],
    ],
    {
      color: k.accent2,
      door: 'Toy keyboard',
      // In the lane under the joint rather than on it. The gap between two
      // boxes is twelve pixels and the word is twice that, so a label written
      // there lands on the count column of whichever box it overhangs — which
      // is a button, and a word sitting on a button reads as its name.
      label: {
        text: 'key',
        x: joint,
        y: laneY + LABEL_H,
        anchor: 'middle',
      },
    },
  )

  // Notes the drawing writes on itself: a part that is on the board with
  // nothing wired to it, named where it would be wired rather than left off the
  // map for the panel to list underneath.
  const notes: MapNode[] = []
  // Neither toy fires the other, and the lane they would be bridged across is
  // empty — so the lane says so, the way the rack says an empty rack. A chip
  // rather than a line of text, because it is a door: the drawing writes plain
  // words on itself too, and a reader who has to press one to find out which is
  // which has been told nothing by either.
  if (trigs.length === 0) {
    const w = textWidth(NO_TRIG, SMALL) + CHIP_PAD * 2
    notes.push(
      node('no_trig', 'chip', NO_TRIG, {
        door: 'Trigger patch',
        active: false,
        open: o.open === 'Trigger patch',
        x: midX(toys[1]!) - w / 2,
        // Clear of the box above it: a line of text could start at the lane's
        // own top, and an outline starting there would run along the foot of
        // the drums as if it were part of them.
        y: laneY + 1,
        w,
        h: CHIP_H - 2,
      }),
    )
  }

  // The bridges you patch yourself, under the row and in the patch colour, so
  // nothing here reads like the soldered line above it.
  for (const [i, t] of trigs.entries()) {
    const [from, to] = [byId.get(nodeId(t.from))!, byId.get(nodeId(t.to))!]
    const y = trigY + i * TRIG_H
    wire(
      t.id,
      from,
      to,
      [
        [midX(from), from.y + from.h],
        [midX(from), y],
        [midX(to), y],
        [midX(to), to.y + to.h],
      ],
      {
        color: k.mod,
        dash: '4 3',
        door: 'Trigger patch',
        label: {
          text: t.label,
          x: (midX(from) + midX(to)) / 2,
          y: y - 3,
          anchor: 'middle',
        },
      },
    )
  }

  // --- and out of the band --------------------------------------------------

  // Everything meets on one bar and the bar feeds the mix. The board's own
  // output comes down the channel between two of the boxes under it rather than
  // through one of them, which is the whole reason the band is a grid.
  const drop =
    lines.length > 1
      ? (lines[0]!.x + lines[0]!.w + lines[1]!.x) / 2
      : mix.x + mix.w / 2
  bar(
    'board-out',
    board,
    mix,
    [
      [drop, board.y + board.h],
      [drop, collectY],
    ],
    { color: k.border },
  )
  for (const src of lines)
    bar(
      `${src.id}-out`,
      src,
      mix,
      [
        [midX(src), src.y + src.h],
        [midX(src), collectY],
      ],
      { color: k.border },
    )
  bar(
    'collect',
    mix,
    mix,
    [
      [Math.min(drop, midX(lines[0]!)), collectY],
      [Math.max(drop, midX(lines[lines.length - 1]!)), collectY],
    ],
    { color: k.border },
  )
  wire(
    'collect-mix',
    mix,
    mix,
    [
      [midX(mix), collectY],
      [midX(mix), mix.y],
    ],
    { color: k.border },
  )
  if (down.length)
    wire(
      'mix-path',
      mix,
      down[0]!,
      [
        [midX(down[0]!), mix.y + mix.h],
        [midX(down[0]!), down[0]!.y],
      ],
      { color: k.border },
    )

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
  const fbY = midY(fbTarget)
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

  // The one wire the foot row carries. Dotted and cool, like every other line
  // off the bay: it is a control line rather than anything you can hear.
  wire(
    'pad-bay',
    pad,
    bay,
    [
      [pad.x + pad.w, midY(pad)],
      [bay.x, midY(bay)],
    ],
    { color: pad.active ? k.mod : k.dim, dash: '1 3', door: 'Patch bay' },
  )

  // Every wire off the patch bay, and the mic, as a label out in the gutter
  // with a short run onto what it feeds.
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
    const side = tapSide.get(tap)!
    const y = clear(side, tapY(tap) - LABEL_H / 2)
    const edge = side === 'left' ? tap.edge.x : tap.edge.x + tap.edge.w
    const land = side === 'left' ? tap.target.x : tap.target.x + tap.target.w
    const anchorX = edge + (side === 'left' ? -STUB : STUB)
    const label = node(tap.id, 'label', tap.label, {
      door: tap.door,
      active: tap.active,
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
        [land, tapY(tap)],
        (anchorX + edge) / 2,
      ),
      {
        color: tap.active ? k.mod : k.dim,
        dash: tap.dash,
        door: tap.wireDoor,
      },
    )
  }

  return {
    // The frame first, so the boxes inside it draw over its edge rather than
    // under it — and the rack's own parts after the rack, for the same reason.
    nodes: [
      board,
      ...band,
      mix,
      ...path,
      bus,
      ...foot,
      ...parts,
      ...notes,
      ...labels,
    ],
    wires,
    doors,
    width,
    height:
      Math.max(
        pad.y + pad.h,
        ...parts.map(n => n.y + n.h),
        ...notes.map(n => n.y + n.h),
        ...labels.map(l => l.y + l.h),
      ) + MARGIN,
    palette: k,
    links: live,
  }
}

interface Tap {
  id: string
  label: string
  /** what the label opens: whatever this end is clipped onto */
  door: string
  /** what the wire opens: the bay it is patched at */
  wireDoor: string
  target: MapNode
  /** the box the wire enters through, which is the box it lands on unless what
      it lands on is riding inside another one */
  edge: MapNode
  dash: string
  /** whether it draws lit. A wire at no depth, or a mic turned right down, is
      soldered where it is soldered and draws greyed rather than not at all —
      and a supply line is dim whatever it is carrying, because it is a rail
      rather than a signal. */
  active: boolean
}

const tapY = (t: Tap) => midY(t.target)

function collectTaps(
  c: Controls,
  ctx: {
    byId: Map<string, MapNode>
    doors: Set<string>
    live: boolean
    /** the bends riding in the rack, by group, and the rack they ride in — a
        solder point the mic can still be at with the stage in none of the
        slots, and the box a wire onto one has to come in through */
    loosePart: Map<string, MapNode>
    rack: MapNode
    /** pad, bay, wear and Signal order, packed side by side with no gutter of their own — a
        wire landing on one of them needs the whole row's outer edge to clear,
        not just the box it lands on, or its label draws over a neighbour. */
    foot: MapNode[]
  },
): Tap[] {
  const taps: Tap[] = []
  const [first, last] = [ctx.foot[0], ctx.foot[ctx.foot.length - 1]]
  const footEdge = (n: MapNode): MapNode =>
    ctx.foot.includes(n) && first && last
      ? { ...n, x: first.x, w: last.x + last.w - first.x }
      : n

  // The mic, which is a patch point rather than a channel — so it draws as the
  // wire it is, onto whichever of the seven places it is soldered to. Turned
  // right down it is still soldered there, so it stays on the map greyed, the
  // way the feedback bus does at no amount.
  // Six of the seven solder points are a stage, and a stage can be in none of
  // the slots — in which case the wire runs in through the rack's edge and
  // lands on the chip riding in it, greyed: it is soldered exactly where you
  // put it, and there is nothing running through what you put it on.
  const micPoint = MIC_TARGET[Math.round(c.micPatch)] ?? 'mix'
  const onPath = ctx.byId.get(nodeId(micPoint))
  const inRack = ctx.loosePart.get(micPoint)
  const mic = onPath
    ? { target: onPath, edge: footEdge(onPath), active: c.micLevel > 0 }
    : inRack
      ? { target: inRack, edge: ctx.rack, active: false }
      : undefined
  if (mic) {
    ctx.doors.add('Mic')
    taps.push({
      id: 'mic',
      label: ctx.live && mic.active ? `mic ${c.micLevel.toFixed(2)}` : 'mic',
      door: 'Mic',
      wireDoor: 'Mic',
      dash: '1 3',
      ...mic,
    })
  }

  // Where the sag goes. Brownout is on the path because it gates and hums the
  // mix at a place, but the rail it drags is the board's, and three stages can
  // be wired to droop with it: the stompbox's 9V, the tape motor's capstan and
  // the desk's return amps. Each draws only once you have wired it — the link
  // sits at zero stock, and a rail nothing is hanging off is a line saying
  // nothing. Dotted in the supply's own dash and dim, like the bar over the toy
  // board: it is the same rail, and it is not a signal going anywhere.
  for (const [key, group] of RAIL_LINK) {
    if (c[key] <= 0) continue
    const target = ctx.byId.get(nodeId(group))
    if (!target) continue
    ctx.doors.add('Brownout')
    taps.push({
      id: `rail-${nodeId(group)}`,
      label: 'supply',
      door: 'Brownout',
      wireDoor: 'Brownout',
      target,
      edge: footEdge(target),
      dash: '1 2',
      active: false,
    })
  }

  // A wire onto a stage that isn't in the path does nothing, so it isn't drawn.
  for (const i of [0, 1, 2, 3] as const) {
    const src = Math.round(c[`mod${i}Src`])
    const depth = c[`mod${i}Depth`]
    const dest = WIRE_TARGET[Math.round(c[`mod${i}Dest`])]
    if (src === 0 || depth === 0 || !dest) continue
    const target = ctx.byId.get(nodeId(dest))
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
      edge: footEdge(target),
      dash: '1 3',
      active: true,
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

function words(
  s: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  anchor?: 'start' | 'end',
): El {
  return el(
    'text',
    { x, y, fill, fontSize: size, textAnchor: anchor ?? 'middle' },
    [s],
  )
}

// How far off stock a stage is sitting, and the way back: the number is the
// button, in a column of its own down the right of the rack. It draws over the
// door rather than inside it — a link inside a link is not a thing — and takes
// the whole column as its hit box, because two digits is not a target.
function resetButton(
  name: string,
  count: number,
  right: number,
  y: number,
  h: number,
  k: Palette,
  links: boolean,
): El[] {
  if (count === 0) return []
  const digits = words(
    String(count),
    right - COUNT_INSET,
    baseline(y, h, FONT),
    FONT,
    k.accent,
    'end',
  )
  if (!links) return [digits]
  const moved = `${count} control${count === 1 ? '' : 's'} moved`
  return [
    el(
      'g',
      {
        className: 'reset',
        'data-reset': name,
        // The doors are links, so a keyboard already reaches them. A number is
        // a verb rather than a place and has no link to be, so it says what it
        // is and takes a tab stop of its own — the panel offers no other way to
        // put a stage back without opening it first.
        role: 'button',
        tabIndex: 0,
        'aria-label': `put ${name} back where it booted — ${moved}`,
      },
      [
        el('title', {}, [
          `${name}: ${moved} — click to put them back where they booted, ctrl+z to bring them again`,
        ]),
        el('rect', {
          className: 'hit',
          x: right - COUNT_COL,
          y: y + 1,
          width: COUNT_COL,
          height: h - 2,
          rx: 3,
          fill: 'transparent',
        }),
        digits,
      ],
    ),
  ]
}

// How far up a source's fader is, along the foot of its own box. A source
// running off its own switch lights the bar, which is the map saying that what
// you are hearing starts here.
function levelBar(n: MapNode, k: Palette): El[] {
  // The empty part of the travel is drawn too: a bar that stops where the level
  // does is a bar with nothing to read it against.
  const [x, y, w] = [n.x + PAD_X, n.y + n.h - 11, n.w - PAD_X * 2]
  const track = el('rect', {
    x,
    y,
    width: w,
    height: 3,
    fill: k.border,
    fillOpacity: 0.6,
  })
  const level = n.level ?? 0
  if (level <= 0) return [track]
  return [
    track,
    el('rect', {
      x,
      y,
      width: Math.max(2, w * Math.min(1, level)),
      height: 3,
      fill: n.playing ? k.accent2 : k.fg,
      fillOpacity: n.playing ? 0.95 : 0.5,
    }),
  ]
}

// What each source is, drawn rather than spelt: a 12px glyph in the left of its
// own box, so the six read as six different machines before the names are. It
// carries the run state too — the two toys with a switch of their own light
// their glyph while they play, which is one marker doing the work of two.
const GLYPH: Record<string, (x: number, y: number, c: string) => El[]> = {
  'Toy keyboard': (x, y, c) => [
    el('rect', {
      x,
      y: y + 2,
      width: ICON,
      height: 8,
      rx: 1,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('path', {
      d: `M ${x + 4} ${y + 6.6} V ${y + 10} M ${x + 8} ${y + 6.6} V ${y + 10}`,
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('rect', { x: x + 3.1, y: y + 2, width: 1.8, height: 4.6, fill: c }),
    el('rect', { x: x + 7.1, y: y + 2, width: 1.8, height: 4.6, fill: c }),
  ],
  'FM chip': (x, y, c) => [
    el('rect', {
      x: x + 2.5,
      y: y + 1.5,
      width: 7,
      height: 9,
      rx: 0.8,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('path', {
      d: [3, 6, 9]
        .map(dy => `M ${x} ${y + dy} h 2.5 M ${x + 9.5} ${y + dy} h 2.5`)
        .join(' '),
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('circle', { cx: x + 4.3, cy: y + 3.3, r: 0.7, fill: c }),
  ],
  'Toy drums': (x, y, c) => [
    el('circle', {
      cx: x + 5,
      cy: y + 7,
      r: 4,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('circle', { cx: x + 5, cy: y + 7, r: 1.3, fill: c }),
    el('path', {
      d: `M ${x + 11.5} ${y + 1} L ${x + 7.4} ${y + 4.6}`,
      stroke: c,
      strokeWidth: 1.1,
      strokeLinecap: 'round',
    }),
  ],
  'Chaos osc': (x, y, c) => [
    el('path', {
      d: `M ${x} ${y + 8} L ${x + 2} ${y + 3} L ${x + 3.7} ${y + 10} L ${x + 5.8} ${y + 1.6} L ${x + 7.7} ${y + 9} L ${x + 9.3} ${y + 4} L ${x + ICON} ${y + 7}`,
      fill: 'none',
      stroke: c,
      strokeWidth: 1,
      strokeLinejoin: 'round',
    }),
  ],
  'Noise & crackle': (x, y, c) => [
    el('path', {
      d: (
        [
          [0.8, 3.2],
          [3.4, 1.4],
          [2.2, 6.4],
          [5.4, 4.4],
          [4.6, 9.4],
          [7.8, 2.6],
          [8.2, 7.4],
          [11, 5],
          [10.4, 9.6],
        ] as Point[]
      )
        .map(([dx, dy]) => `M ${x + dx} ${y + dy} a 0.8 0.8 0 1 0 0.01 0`)
        .join(' '),
      fill: c,
    }),
  ],
  // The four pedals, drawn as the boxes they would be on a floor: the stompbox
  // as an enclosure with a footswitch under its knob, and the other three as
  // what each one does to the signal rather than as three more enclosures — at
  // 12px a row of alike outlines says only "pedal", which is what their place
  // on the path already says.
  Stompbox: (x, y, c) => [
    el('rect', {
      x: x + 1.5,
      y: y + 0.5,
      width: 9,
      height: 11,
      rx: 1.2,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('circle', {
      cx: x + 6,
      cy: y + 3.6,
      r: 1.5,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('circle', { cx: x + 6, cy: y + 8.2, r: 1.5, fill: c }),
  ],
  'Tape delay': (x, y, c) => [
    ...[3.4, 8.6].flatMap(dx => [
      el('circle', {
        cx: x + dx,
        cy: y + 7,
        r: 2.6,
        fill: 'none',
        stroke: c,
        strokeWidth: 0.9,
      }),
      el('circle', { cx: x + dx, cy: y + 7, r: 0.7, fill: c }),
    ]),
    el('path', {
      d: `M ${x + 3.4} ${y + 3.2} H ${x + 8.6}`,
      stroke: c,
      strokeWidth: 0.9,
    }),
  ],
  'Delay pedal': (x, y, c) => [
    el('path', {
      d: [9, 6, 3.6, 2]
        .map((h, i) => `M ${x + 1.2 + i * 3} ${y + 10} v ${-h}`)
        .join(' '),
      stroke: c,
      strokeWidth: 1,
      strokeLinecap: 'round',
    }),
  ],
  'Spring verb': (x, y, c) => [
    el('path', {
      d: `M ${x + 0.4} ${y + 9} h 0.8 ${[0, 1, 2]
        .map(() => 'q 1.7 -9.5 3.4 0')
        .join(' ')} h 0.8`,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
  ],
  Sampler: (x, y, c) => [
    el('path', {
      d: [3.4, 8, 5, 10.4, 6, 2.8]
        .map((h, i) => `M ${x + 1.2 + i * 2} ${y + 6 - h / 2} v ${h}`)
        .join(' '),
      stroke: c,
      strokeWidth: 1,
      strokeLinecap: 'round',
    }),
  ],
}

/** the column at the left of a box its glyph rides in, where it has one. The
    count takes the same width off the other end, so a label centred on what is
    left of the box is still centred on the box. */
const iconCol = (label: string) => (GLYPH[label] ? ICON_COL : 0)

function glyph(n: MapNode, k: Palette, y: number): El[] {
  const draw = GLYPH[n.label]
  if (!draw) return []
  const c = n.playing ? k.accent2 : n.active || n.open ? k.fg : k.dim
  return [el('g', { className: 'glyph' }, draw(n.x + PAD_X, y, c))]
}

export function drawNode(n: MapNode, k: Palette, links: boolean): El {
  if (n.kind === 'label') {
    return el('g', { className: 'tap' }, [
      ...door(
        [
          words(
            n.label,
            n.x,
            baseline(n.y, n.h, SMALL),
            SMALL,
            n.active ? k.mod : k.dim,
            n.anchor,
          ),
        ],
        n.door,
        links,
      ),
    ])
  }
  // The toy board: an outline round what is one piece of hardware, and the
  // cheapest way on a drawing to say that three things share a supply. Dashed,
  // because it is a boundary rather than anything signal travels along. The lip
  // carries the door onto the parts the outline is round — the ones that are
  // hardware rather than a stage, and so have no box of their own — and is
  // named for them, because a lip reading anything else is a door lying about
  // where it goes.
  if (n.kind === 'frame') {
    return el('g', { className: 'node' }, [
      el('rect', {
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: 4,
        fill: 'none',
        stroke: k.border,
        strokeDasharray: '3 2',
      }),
      ...door(
        [words(n.label, n.x + PAD_X, n.y + CAP_H - 4, SMALL, k.dim, 'start')],
        n.door,
        links,
      ),
    ])
  }

  // The rack the bends sit in: no box of its own any more — ordering used to
  // open here and now opens off Signal order at the foot of the drawing, so
  // there is nothing left on this node worth a frame or a name. What it
  // carries — the bends in none of its slots — draws as its own chips,
  // positioned off this node's now-invisible bounds.
  if (n.kind === 'rack') return el('g', { className: 'node' }, [])

  // A chip riding in the rack: a short name in a dashed outline, because there
  // is nothing soldered to either end of it. A bend in none of the slots is one;
  // so is the door onto the solder those slots sit in, which lights the way a
  // stage does when what it names is doing something.
  if (n.kind === 'chip') {
    return el(
      'g',
      { className: 'node' },
      door(
        [
          el('rect', {
            className: 'box',
            x: n.x,
            y: n.y,
            width: n.w,
            height: n.h,
            rx: 3,
            fill: 'none',
            stroke: n.open ? k.fg : k.border,
            strokeDasharray: '2 2',
          }),
          words(
            n.label,
            n.x + n.w / 2,
            baseline(n.y, n.h, SMALL),
            SMALL,
            n.active || n.open ? k.fg : k.dim,
          ),
        ],
        n.door,
        links,
      ),
    )
  }

  // An instrument: a glyph of the machine it is, then a name and a count over
  // how far its fader is up. A box rather than a line in a rack, because what a
  // source is wired to is the point and only a box has edges for a wire to
  // land on.
  if (n.kind === 'inst') {
    const lit = n.open ? k.fg : n.count > 0 ? k.accent : k.border
    const inner: El[] = [
      el('rect', {
        className: 'box',
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: 3,
        fill: n.open ? k.open : k.raise,
        stroke: lit,
        strokeWidth: n.open ? 2 : 1,
      }),
      ...glyph(n, k, n.y + (INST_H - ICON) / 2 - 4),
      words(
        n.label,
        n.x + PAD_X + ICON_COL,
        n.y + 15.5,
        FONT,
        n.active || n.open ? k.fg : k.dim,
        'start',
      ),
      ...levelBar(n, k),
    ]
    return el('g', { className: 'node' }, [
      ...door(inner, n.door, links),
      ...resetButton(n.door ?? n.label, n.count, n.x + n.w, n.y, 20, k, links),
    ])
  }
  const lit = n.open ? k.fg : n.count > 0 ? k.accent : k.border
  const lead = iconCol(n.label)
  const inner = [
    el('rect', {
      className: 'box',
      x: n.x,
      y: n.y,
      width: n.w,
      height: n.h,
      rx: 4,
      fill: n.open ? k.open : k.bg,
      stroke: lit,
      strokeWidth: n.open ? 2 : 1,
    }),
    ...glyph(n, k, n.y + (n.h - ICON) / 2),
    // Centred on what is left between the glyph and the count's column, not on
    // the box: both columns are there whether or not they hold anything, so a
    // label centred on the box would sit off to one side of the space it has.
    words(
      n.label,
      n.x + lead + (n.w - lead - (links ? COUNT_COL : 0)) / 2,
      baseline(n.y, n.h, FONT),
      FONT,
      n.active || n.open ? k.fg : k.dim,
    ),
  ]
  return el('g', { className: 'node' }, [
    ...door(inner, n.door, links),
    ...resetButton(n.door ?? n.label, n.count, n.x + n.w, n.y, n.h, k, links),
  ])
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
