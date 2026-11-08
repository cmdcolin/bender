import { arrowhead, route, type Point } from 'skillet-shared/wire-route'

import { type ControlKey, type Controls } from '../controls.ts'
import { MIC } from '../dsp/micJacks.ts'
import { DEST } from '../dsp/modbus.ts'
import { CORD_DIV_NAMES } from '../dsp/stages/cord.ts'
import {
  TAPE_AT_BENDS,
  TAPE_AT_END,
  TAPE_AT_PEDALS,
} from '../dsp/stages/tape.ts'
import { SUPPLIED, SUPPLY as ON } from '../dsp/supplies.ts'
import { followsGate } from '../dsp/trigbus.ts'
import { MACHINES } from '../machines.ts'
import { PEDALS, pedalOrderAt } from '../pedals.ts'
import {
  AUDIO_TAKERS,
  audioDiv,
  audioFrom,
  audioLevel,
  cableName,
  KEY_RUNS,
  TRIGGER_CABLES,
  type Signal,
} from './connections.ts'
import {
  bendAt,
  BENDS,
  GROUPS,
  offValue,
  ownTouched,
  sliderFor,
  touchedCount,
} from './controls/index.ts'
import { intoOf, patchedInto, patchedLabel, UNITS } from './controls/jacks.ts'
import { MIC_JACKS, wireLabel, wireOn, wiredJacks } from './micWiring.ts'
import { el, textWidth, type El } from './svg.ts'

// The signal path, laid out and drawn: live bend order, the feedback wire, and
// where it lands. The panel mounts the drawing as React elements and
// scripts/chain-svg.ts writes the README's copy to a file, both from here.
//
// The layout is by hand because the drawing is a rack — a column of boxes,
// short hops between them, and a handful of wires round the outside — and
// nothing in it needs a solver. It used to go through graphviz, which is a
// megabyte of wasm to rank fifteen boxes nobody ever asked to be ranked.

const FB_TARGET = ['mix', 'Chaos osc', 'Plinky', 'Wraith'] as const

// Which group owns each patch-bay destination, in mod*Dest order.
// The box a patch wire onto each destination draws to. Keyed by name, so a
// destination added to DEST without a box here fails the type check.
const WIRE_BOX: Record<Exclude<keyof typeof DEST, `gone${number}`>, string> = {
  filtHz: 'Screech filter',
  ringHz: 'Ring mod',
  combHz: 'Comb',
  crushHz: 'Crusher',
  chipClock: 'Plinky',
  retrig: 'Clatter',
  tapeSpeed: 'Wraith',
  glitch: 'Glitch buffer',
  fbAmt: 'Feedback bus',
  stompDrive: 'Gnash',
  shiftHz: 'Freq shifter',
  bits: 'Crusher',
  drumCross: 'Clatter',
  starve: 'Plinky',
  drumTune: 'Clatter',
  revDecay: 'Boing',
  delayMs: 'Wraith',
  // A wire onto another wire's depth draws onto the bay's box.
  wDepth0: 'Patch bay',
  wDepth1: 'Patch bay',
  wDepth2: 'Patch bay',
  wDepth3: 'Patch bay',
  echoMs: 'Ricochet',
  ensRate: 'Chorale',
  sampleSpeed: 'Spool',
  loopSlide: 'Spool',
  loopSpan: 'Spool',
  oscStarve: 'Chaos osc',
  oscHz: 'Chaos osc',
  chipLevel: 'Plinky',
  drumLevel: 'Clatter',
  fmLevel: 'Glint',
  oscLevel: 'Chaos osc',
  noiseLevel: 'Noise & crackle',
  sampleLevel: 'Spool',
  filtRes: 'Screech filter',
  fmBright: 'Glint',
  fbMs: 'Feedback bus',
  chipDataLine: 'Plinky',
  chipDataFault: 'Plinky',
  chipAddrLine: 'Plinky',
  chipAddrFault: 'Plinky',
  drumDataLine: 'Clatter',
  drumDataFault: 'Clatter',
  drumAddrLine: 'Clatter',
  drumAddrFault: 'Clatter',
  fmDataLine: 'Glint',
  fmDataFault: 'Glint',
  fmAddrLine: 'Glint',
  fmAddrFault: 'Glint',
  fmWaveLine: 'Glint',
  fmWaveFault: 'Glint',
  fmWaveDataLine: 'Glint',
  fmWaveDataFault: 'Glint',
  fmBusCut: 'Glint',
  fmNoiseBlob: 'Glint',
  ringMix: 'Ring mod',
  drumBpm: 'Clatter',
  drumSwing: 'Clatter',
  drumChance: 'Clatter',
  drumWander: 'Clatter',
  drumDecay: 'Clatter',
  drumRing: 'Clatter',
  dlyLoopHz: 'Wraith',
  deckSpeed: 'Output',
  pcmLevel: 'Parlor',
  pcmAddrLine: 'Parlor',
  pcmAddrFault: 'Parlor',
  pcmDataLine: 'Parlor',
  pcmDataFault: 'Parlor',
  monoLevel: 'Growler',
  monoCutoff: 'Growler',
  monoEmph: 'Growler',
  monoPitch: 'Growler',
  chipCrosstalk: 'Plinky',
  chipScan: 'Plinky',
  chipPwm: 'Plinky',
  chipShort: 'Plinky',
  chipEnvCap: 'Plinky',
  chipGhost: 'Plinky',
  chipLoopFrom: 'Plinky',
  chipLoopTo: 'Plinky',
  chipBankLine: 'Plinky',
  chipBankFault: 'Plinky',
  chipDivLine: 'Plinky',
  chipDivFault: 'Plinky',
  fmPatchLine: 'Glint',
  fmPatchFault: 'Glint',
  fmPatchDataLine: 'Glint',
  fmPatchDataFault: 'Glint',
  fmClock: 'Glint',
  fmCpuClock: 'Glint',
  revWarble: 'Boing',
  drumRefDepth: 'Clatter',
  fmDacSlot: 'Glint',
  fmDacSlip: 'Glint',
  fmAlloc: 'Glint',
  fmColdBoot: 'Glint',
  fmAdder: 'Glint',
  fourLevel: 'Layercake',
  fourPitch: 'Layercake',
  fourAux: 'Layercake',
  four1MidHz: 'Layercake',
  chipStepTap: 'Plinky',
  chipEnvRelax: 'Plinky',
  chipEnvDiv: 'Plinky',
  chipOutAddr: 'Plinky',
  chipOutData: 'Plinky',
  chipPwmTap: 'Plinky',
  fmToyBus: 'Glint',
  chipFmClock: 'Plinky',
  chipHold: 'Plinky',
  chipHardSync: 'Plinky',
  chipXor: 'Plinky',
  chipEnvBits: 'Plinky',
  chipDutyEnv: 'Plinky',
  pcmRunOn: 'Parlor',
  pcmWrite: 'Parlor',
  pcmSignDir: 'Parlor',
  pcmLatch: 'Parlor',
  crushDataLine: 'Crusher',
  crushDataFault: 'Crusher',
  crushBusCut: 'Crusher',
  crushLadder: 'Crusher',
  crushRefDepth: 'Crusher',
  starve2: 'Plinky',
  distDraw: 'Clipper',
  distPinGain: 'Clipper',
  octRate: 'Octave',
  octChaos: 'Octave',
  drumStepTap: 'Clatter',
  chipKitAddr: 'Plinky',
  gndBounce: 'Plinky',
  pcmGlint: 'Parlor',
  chipOutKeys: 'Plinky',
  codecRate: 'Codec',
  codecErrors: 'Codec',
  rackClock: 'Rack verb',
  rackDecay: 'Rack verb',
  monoLoopPitch: 'Growler',
  monoChoke: 'Growler',
  drumMotor: 'Clatter',
  drumRush: 'Clatter',
  chipPump: 'Plinky',
  chipCrash: 'Plinky',
  fmRot: 'Glint',
  fmHeat: 'Glint',
  fmRing: 'Glint',
  pcmRunaway: 'Parlor',
  pcmCpuBus: 'Parlor',
  drumRot: 'Clatter',
  drumOutAddr: 'Clatter',
  monoRegTrip: 'Growler',
  chipLfsr: 'Plinky',
  chopWobble: 'Ring mod',
  chopDepth: 'Ring mod',
  chopWidth: 'Ring mod',
  combPump: 'Comb',
  combRail: 'Comb',
  combPluck: 'Comb',
  combWhistle: 'Comb',
  combSag: 'Comb',
  combPull: 'Comb',
  shiftDrift: 'Freq shifter',
  shiftQuad: 'Freq shifter',
  fmExpLine: 'Glint',
  fmExpFault: 'Glint',
  sheetLevel: 'Sheet',
  bottleLevel: 'Bottle',
  leadLevel: 'Howler',
  leadCutoff: 'Howler',
  leadEmph: 'Howler',
  leadPitch: 'Howler',
  leadLoopPitch: 'Howler',
  leadChoke: 'Howler',
  leadRegTrip: 'Howler',
  talkLevel: 'Prattle',
  pcmSlot: 'Parlor',
  pcmWordRate: 'Parlor',
  pcmRot: 'Parlor',
  fmIncLine: 'Glint',
  fmIncFault: 'Glint',
  fmCarry: 'Glint',
  fmSkew: 'Glint',
  fmPitchWire: 'Glint',
  drumTouch: 'Clatter',
  echoPull: 'Ricochet',
  echoSag: 'Ricochet',
  drumLeak: 'Clatter',
  drumSelfFire: 'Clatter',
  fmBodge: 'Glint',
  chipBodge: 'Plinky',
  revHowl: 'Boing',
  fmBodgeR: 'Glint',
  chipBodgeR: 'Plinky',
  drumTrigBias: 'Clatter',
  drumKickLevel: 'Clatter',
  drumSnareLevel: 'Clatter',
  drumHatLevel: 'Clatter',
  drumClapLevel: 'Clatter',
  drumTomLevel: 'Clatter',
  drumBellLevel: 'Clatter',
  drumOpenLevel: 'Clatter',
  drumCymLevel: 'Clatter',
  drumKickDecay: 'Clatter',
  drumSnareDecay: 'Clatter',
  drumHatDecay: 'Clatter',
  drumClapDecay: 'Clatter',
  drumTomDecay: 'Clatter',
  drumBellDecay: 'Clatter',
  drumOpenDecay: 'Clatter',
  drumCymDecay: 'Clatter',
  monoToyIn: 'Growler',
  leadToyIn: 'Howler',
  drumKickFeed: 'Clatter',
  drumKickVca: 'Clatter',
  drumMixDrive: 'Clatter',
  drumSnareMetal: 'Clatter',
  drumTankBank: 'Clatter',
  drumTankHiss: 'Clatter',
  drumTankFold: 'Clatter',
  drumHissLatch: 'Clatter',
  drumKickBank: 'Clatter',
  monoToyDiv: 'Growler',
  leadToyDiv: 'Howler',
  monoCordFrom: 'Growler',
  leadCordFrom: 'Howler',
}

export const WIRE_TARGET: readonly string[] = (() => {
  const ids = new Map<string, number>(Object.entries(DEST))
  const boxes: string[] = []
  for (const [key, box] of Object.entries(WIRE_BOX)) boxes[ids.get(key)!] = box
  return boxes
})()

// The stages that can be wired to droop with the board's supply, and the
// control on each that wires it. Brownout drags that rail — so does the toy's
// starve knob — and this is the only thing on the map that says how far its
// reach goes past its own box.
const RAIL_LINK = [
  ['stompSag', 'Gnash'],
  ['tapeMotorRail', 'Wraith'],
  ['fbSag', 'Feedback bus'],
] as const satisfies readonly (readonly [ControlKey, string])[]

const SRC_LABEL = sliderFor('mod0Src').choices ?? []

/** what the empty trigger lane calls itself, which is also its door */
const NO_TRIG = 'no trig patched'
const SPARE = 'spare'

/** the box on the supply rail, and its door */
const SUPPLY = 'Power supply'

// A wire's label names what it picks up, so it opens the thing it is clipped
// onto rather than the bay — mod*Src order. The rest (the bay's own LFO, the
// supply sag, the output envelope) belong to no one stage, so they open the bay.
const SRC_GROUP: Record<number, string> = {
  4: 'Mic',
  5: 'Body contact',
  6: 'Body contact',
  7: 'Feedback bus',
  8: 'Plinky',
  9: 'Clatter',
  10: 'Plinky',
}

const MIC_TARGET = MIC_JACKS.map(j => j.stage)

// What each source is turned up to, which is also whether it is in the mix at
// all: the loudest of its levels, as a share of the top of its normal stretch.
const SOURCE_LEVELS: Record<string, readonly ControlKey[]> = Object.fromEntries(
  MACHINES.map(m => [m.name, m.levels] as const),
)

const levelKey = (n: MapNode) => SOURCE_LEVELS[n.label]?.[0]

const SOURCE_MUTE: Record<string, ControlKey> = Object.fromEntries(
  MACHINES.flatMap(m => ('mute' in m ? [[m.name, m.mute] as const] : [])),
)

// The two you play, side by side across the head of the toy board. They are the
// pair: two machines with a run switch, a pattern and a set of keys each.
const TOY_ROW = ['Plinky', 'Clatter'] as const

// And the ones you don't. The FM chip has no keyboard and no sequencer of its
// own — its key input is soldered onto the toy's gate line — so it stands next
// to the keyboard, on the end of that wire, rather than beside the drums as an
// equal, and each machine soldered on after it stands the far side of the one
// before, because the wire runs along the row and a box on the end of it
// belongs next to the box it is soldered to. A machine the kit strikes but the
// gate line never reaches stands after the drums.
//
// All of them are inside the frame because they are one piece of hardware on
// one supply, which is what the frame and its rail are there to say; the starve
// knob on the keyboard's panel bends every one of them.
const BOARD = MACHINES.filter(m => m.map !== 'line')

// The mono synth, which a lone box under the row hangs under the end of the
// gate line for.
const MONO = 'Growler'

// The sources off the toy's supply rail, each standing on its own.
const LINE_ROW = MACHINES.filter(m => m.map === 'line').map(m => m.name)

// The levels and mixes that decide whether a stage is in the sound at all. Off
// is the bottom of the travel, or the top for a control that boots there, such
// as the reverb's Dry level.
export const GATES: Record<string, readonly ControlKey[]> = {
  ...SOURCE_LEVELS,
  ...Object.fromEntries(BENDS.map(b => [b.group, [b.mix]])),
  Gnash: ['stompMix'],
  Wraith: ['dlyMix'],
  Ricochet: ['echoLevel'],
  Boing: ['revMix', 'revDry'],
  Chorale: ['ensMix'],
  Ember: ['ampMix'],
  'Tape machine': ['tapeMix'],
  'Feedback bus': ['fbAmt', 'fb2Amt', 'fb3Amt'],
  Mic: ['micLevel'],
}

export const gateOff = (key: ControlKey): number => offValue(sliderFor(key))

const gateOpen = (name: string, c: Controls) =>
  GATES[name]!.some(k => c[k] !== gateOff(k))

/** The two stages every board has. */
export const FIXED: ReadonlySet<string> = new Set(['Mix bus', 'Output'])

/** The stages the board is using: a gated stage with its gate open, any other
    group moved off stock, and both ends of every wire the map draws. */
export function pedalWet(c: Controls, name: string) {
  const fed = FB_TARGET[Math.round(c.fbDest)] === name && c.fbAmt > 0
  const pedal = PEDALS.find(p => p.group === name)
  return (
    (pedal !== undefined && c[pedal.mix] > 0) ||
    (name === 'Wraith' && fed) ||
    (name === 'Boing' && c.revDry < 1)
  )
}

export function onBoard(c: Controls): Set<string> {
  const on = new Set(FIXED)
  for (const g of GROUPS)
    if (GATES[g.name] ? gateOpen(g.name, c) : ownTouched(g.name, c))
      on.add(g.name)
  for (const i of [0, 1, 2, 3] as const) {
    const src = Math.round(c[`mod${i}Src`])
    const dest = WIRE_TARGET[Math.round(c[`mod${i}Dest`])]
    if (src === 0 || c[`mod${i}Depth`] === 0 || !dest) continue
    on.add('Patch bay')
      .add(dest)
      .add(SRC_GROUP[src] ?? 'Patch bay')
  }
  for (const t of triggerBridges(c)) on.add(t.from).add(t.to)
  for (const u of UNITS) {
    const machines = patchedInto(c[u.into])
    if (machines.length > 0) on.add(u.group)
    for (const machine of machines) on.add(machine)
  }
  // A chip on the key line plays the toy keyboard's notes, so the keyboard is
  // its player even with its own fader down.
  for (const run of KEY_RUNS)
    if (on.has(run.machine) && followsGate(c[run.jumper])) on.add(TOY_ROW[0])
  if (on.has('Feedback bus')) on.add(FB_TARGET[Math.round(c.fbDest)] ?? 'mix')
  if (on.has('Mic'))
    for (const jack of wiredJacks(c)) on.add(MIC_TARGET[jack] ?? 'mix')
  on.delete('mix')
  return on
}

const fullLevel = (key: ControlKey) => {
  const def = sliderFor(key)
  return def.normal?.[1] ?? def.max
}

const sourceLevel = (name: string, c: Controls): number =>
  Math.max(...SOURCE_LEVELS[name]!.map(key => c[key] / fullLevel(key)))

export interface Palette {
  bg: string
  fg: string
  dim: string
  border: string
  accent: string
  accent2: string
  /** control wires, cool against the warm signal path */
  mod: string
  /** the kit's trigger lines, wherever a cable carries them */
  hits: string
  /** an audio cord, Plinky's output pin into a synth */
  audio: string
  /** fill behind the stage whose controls the panel is showing */
  open: string
  /** fill under the two toys, which sit in the rack rather than beside it */
  raise: string
}

// Literal copies of the panel's tokens. chain-map.test.ts checks them against
// tokens.css and theme.css.
export const PANEL: Palette = {
  bg: '#16161a',
  fg: '#e6e6ee',
  dim: '#85859a',
  border: '#63637a',
  accent: '#ff5d3b',
  accent2: '#ffb03b',
  mod: '#5ea9d8',
  hits: '#a184e8',
  audio: '#8b929c',
  open: '#332622',
  raise: '#26262e',
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
/** box names, drawn in capitals like every stage diagram's */
const FONT = 9
const SMALL = 10
const BOX_H = 22
const MIN_W = 100
/** the width a lone column of stages draws at, when its names need less */
const STAGE_W = 150
const PAD_X = 9
const ROW_GAP = 6
/** the lead from the supply box down to the frame's rail */
const FEED_H = 10
/** the channel the folded path's cable runs up, between the two columns */
const COL_GAP = 28
const INST_GAP = 12
/** the lip a frame carries its name on */
const CAP_H = 16
/** the inset the chips sit at inside the toy board's frame */
const FRAME_PAD = 6
/** the supply bar over the chips, and the trigger cables under them */
const RAIL_H = 10
const TRIG_H = 13
/** under the top row, for a patch wire onto a box with a neighbour either side */
const TRACK = 6
/** from the foot of the source rows down to the bar that collects them */
const COLLECT_H = 14
// the gap between the parts of a machine's insert column, and between columns
const JACK_GAP = 6
/** from the collector to the mix bus, and from the mix bus to the fold */
const BAND_GAP = 12
/** a source's own glyph, and the column it sits in at the left of its box */
const ICON = 12
const ICON_COL = 16
/** a loose bend riding in the rack: its own row inside the box, and the pad
    round its name */
const CHIP_H = 16
const CHIP_GAP = 4
const CHIP_PAD = 5
/** how far in from a box's right edge the key line drops to the row under it */
const KEY_DROP_IN = 30
const BADGE_R = 3
/** keeps a badge on an edge box inside the drawing's margin */
const BADGE_IN = 2
const LABEL_H = 12
/** from a wire label in the gutter to the box it feeds */
const STUB = 14
/** the outermost lane, which the feedback wire runs home in */
const LANE = 11
const BUS_GAP = 20
const MARGIN = 2

type Side = 'left' | 'right'

export interface MapNode {
  id: string
  kind: 'stage' | 'inst' | 'frame' | 'label' | 'jack' | 'rack' | 'chip'
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
  /** 'label' only: a live reading on a second line, which halves the gutter a
      wire's label takes */
  value?: string
  /** 'inst' only: how far its fader is up, along that fader's own travel */
  level?: number
  /** 'inst' only: something is coming out of it right now */
  playing?: boolean
  /** 'stage' only: the stage has its face on the bench in the main area */
  benched?: boolean
  /** the control the door aims at inside its stage */
  key?: ControlKey
  /** 'label' only: the group the reading opens, when the name opens another */
  valueDoor?: string
  valueKey?: ControlKey
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
  key?: ControlKey
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
  open?: string
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
  /** With wrap, runs the second column back up instead of down again, so the
      path is a loop: Output ends level with the mix bus and the feedback bus
      sits between them. Only where the feedback lands on the mix bus; any other
      destination folds the usual way. */
  loop?: boolean
  /** The stage whose controls the panel is showing, lit on the map. */
  open?: string
  /** Sources putting something on the bus right now, off the meters the desk
      reads — the panel knows it and the README doesn't. */
  playing?: readonly string[]
  /** Stages with a face on the bench, marked on their boxes. */
  benched?: readonly string[]
  /** The groups to draw; the README's copy leaves it out and draws them all. */
  shown?: ReadonlySet<string>
}

const caps = (label: string) => label.toUpperCase()
const nameWidth = (label: string) => textWidth(caps(label), FONT)
const chipW = (label: string) => nameWidth(label) + CHIP_PAD * 2
const chipRoom = (
  loose: readonly (typeof BENDS)[number][],
  name: 'group' | 'label',
) => CHIP_GAP * 2 + PAD_X + Math.max(0, ...loose.map(b => chipW(b[name])))

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
  id: ControlKey
  from: string
  to: string
  label: string
  signal: Signal | 'audio'
  door?: string
}

function audioBridges(c: Controls): Bridge[] {
  return AUDIO_TAKERS.filter(
    t => audioLevel(c, t.id) > 0 && audioFrom(c, t.id) !== t.machine,
  ).map(t => {
    const div = audioDiv(c, t.id)
    return {
      id: t.key,
      from: audioFrom(c, t.id),
      to: t.machine,
      label: `audio${div > 0 ? ` ${CORD_DIV_NAMES[div]}` : ''} → ${t.machine}`,
      signal: 'audio',
      door: t.machine,
    }
  })
}

function triggerBridges(c: Controls): Bridge[] {
  return TRIGGER_CABLES.filter(x => x.plugged(c)).map(x => ({
    id: x.key,
    from: x.from,
    to: x.to,
    label: cableName(c, x),
    signal: x.signal,
  }))
}

const mapNode = (
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

/** How wide a box has to be to hold what is written on it. */
const natural = (n: MapNode) =>
  PAD_X * 2 + (n.kind === 'inst' ? ICON_COL : 0) + nameWidth(n.label)
const sum = (row: MapNode[]) => row.reduce((a, n) => a + natural(n), 0)

type Parts = ReturnType<typeof pickParts>
type Measured = Parts & ReturnType<typeof measure>
type LaidDown = Measured & ReturnType<typeof layDown>
type Laid = LaidDown & ReturnType<typeof layAcross>

export function buildMap(c: Controls, o: Options = {}): ChainMap {
  const picked = pickParts(c, o)
  const measured = { ...picked, ...measure(picked) }
  const laidDown = { ...measured, ...layDown(measured) }
  const m = { ...laidDown, ...layAcross(laidDown) }
  boardWires(m)
  bandWires(m)
  pathWires(m)
  feedbackWires(m)
  const labels = tapWires(m)

  const { k, live, doors, wires, board, band, mix, path, bus, busShown } = m
  const { foot, notes, fittings, has, hasBoard } = m
  // The frame first, so the boxes inside it draw over its edge rather than
  // under it — and the rack's own parts after the rack, for the same reason.
  const nodes = [
    ...(hasBoard && has(board.door!) ? [board] : []),
    ...band,
    mix,
    ...path,
    ...(busShown ? [bus] : []),
    ...foot,
    ...m.parts,
    ...notes,
    ...labels,
    ...(foot.length ? [fittings] : []),
  ]
  return {
    nodes,
    wires,
    doors: o.shown
      ? new Set([...nodes, ...wires].flatMap(n => (n.door ? [n.door] : [])))
      : doors,
    width: m.width,
    height: Math.max(...nodes.map(n => n.y + n.h)) + MARGIN,
    palette: k,
    links: live,
    open: o.open,
  }
}

// What the drawing holds: every box, which of them are drawn, and the run they
// make, before any of them has a size or a place.
function pickParts(c: Controls, o: Options) {
  const k = o.palette ?? PANEL
  const live = o.live !== false
  // Every group the drawing opens, whether from a box, a strip row or a wire,
  // collected as it is drawn. The panel shelves whatever is left, so no group
  // is left without a door.
  const doors = new Set<string>(Object.keys(SOURCE_LEVELS))
  const wires: MapWire[] = []

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
      d: route(pts, 6),
      arrow: arrowhead(pts, 4, 2),
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

  const stage = (name: string, active: boolean): MapNode => {
    doors.add(name)
    return mapNode(nodeId(name), 'stage', name, {
      count: live ? touchedCount(name, c) : 0,
      active,
      open: o.open === name,
      door: name,
      benched: o.benched?.includes(name),
    })
  }

  // The sources, as the seven boxes they are. Which of them is wired to which is
  // the thing the map is here to say: four of these share a supply, one of the
  // four has no keyboard of its own, and the other three start where they stand.
  const playing = new Set(o.playing ?? [])
  const instrument = (name: string): MapNode => {
    const level = sourceLevel(name, c)
    const mute = SOURCE_MUTE[name]
    return mapNode(nodeId(name), 'inst', name, {
      count: live ? touchedCount(name, c) : 0,
      active: level > 0 && !(mute && c[mute] > 0),
      open: o.open === name,
      door: name,
      level,
      playing: playing.has(name),
      h: BOX_H,
    })
  }
  const has = (name: string) => !o.shown || o.shown.has(name)
  const drawn = (n: MapNode) => has(n.label)
  const allChips = BOARD.map(m => instrument(m.name))
  const box = (name: string) => allChips.find(n => n.label === name)!
  const kb = box(TOY_ROW[0])
  const drums = box(TOY_ROW[1])
  const mono = box(MONO)
  const gateLine = KEY_RUNS.map(r => box(r.machine))
  const chips = allChips.filter(drawn)
  // Five across is wider than the panel's column, so the panel snakes the row:
  // the gate line runs along the top and drops onto the mono synth under its
  // end, and the drums sit under the keyboard they trade triggers with. Three
  // or fewer fit on one row.
  const oneRow = [
    kb,
    ...gateLine,
    ...allChips.filter(n => n !== kb && !gateLine.includes(n)),
  ].filter(drawn)
  const chipRows =
    o.wrap && oneRow.length > 3
      ? (['top', 'under'] as const)
          .map(row =>
            BOARD.filter(m => m.map === row)
              .map(m => box(m.name))
              .filter(drawn),
          )
          .filter(r => r.length > 0)
      : oneRow.length > 0
        ? [oneRow]
        : []
  const lower = new Set(chipRows[1] ?? [])
  const hasBoard = chipRows.length > 0
  const allLines = LINE_ROW.map(instrument)
  const lines = allLines.filter(drawn)
  // Four across fills the drawing, so a fifth starts a row of its own. The
  // panel's column is narrower again, so it stacks them two by two, an even grid
  // hung off one bus line down the middle.
  const across = o.wrap ? 2 : 4
  const lineRows = Array.from(
    { length: Math.ceil(lines.length / across) },
    (_, r) => lines.slice(r * across, (r + 1) * across),
  )
  const spine = !!o.wrap
  // The frame is a door onto the parts on the board that have no box: the cap
  // on the timing pin, the reset chip, the one output stage.
  doors.add('Board parts')
  const board = mapNode('toy_board', 'frame', 'board parts', {
    door: 'Board parts',
  })
  // The bus is a stage like any other, with a door, a count and a way back. Its
  // id stays 'mix': the feedback return and the mic wire both name it by that.
  doors.add('Mix bus')
  const mix = mapNode('mix', 'stage', 'Mix bus', {
    count: live ? touchedCount('Mix bus', c) : 0,
    // Only the first of the mic's seven solder points is the mix — the rest land
    // in the middle of something, and a shout browning the toy out is not a
    // channel on this desk.
    active:
      [...allLines, ...allChips].some(n => n.active) ||
      (c.micLevel > 0 && wireOn(c, MIC.mix) > 0),
    open: o.open === 'Mix bus',
    door: 'Mix bus',
  })

  const path: MapNode[] = []
  const lay = (n: MapNode) => {
    if (drawn(n)) path.push(n)
  }

  // The rack, at the head of the run: the signal walks into it before it walks
  // the slots. Six slots and ten bends, so four are always in none of them —
  // those ride at the head of the path as loose chips, each a door of its own.
  const slotted = bendOrder(c)
  const machineOf = (unit: string) => {
    const into = intoOf(unit)
    return into ? patchedLabel(c[into]) : undefined
  }
  const bends = slotted.filter(n => has(n) && !machineOf(n))
  const loose = BENDS.filter(
    b => !slotted.includes(b.group) && has(b.group) && !machineOf(b.group),
  )
  for (const b of loose) doors.add(b.group)
  // The rack draws only a caption for its chips, and the run passes it by. Its
  // bounds anchor the chips and the run's arrow to the first bend.
  const rack = mapNode('rack', 'rack', loose.length ? SPARE : '')
  const tapeAt = Math.round(c.tapeAt)
  const tape = () => stage('Tape machine', c.tapeMix > 0)
  if (tapeAt === TAPE_AT_BENDS) lay(tape())
  if (bends.length || loose.length) path.push(rack)
  for (const name of bends) {
    const bend = BEND_BY_NAME.get(name)
    path.push(stage(name, bend ? c[bend.mix] > 0 && !c[bend.mute] : true))
  }
  if (tapeAt === TAPE_AT_PEDALS) lay(tape())

  for (const i of pedalOrderAt(c.pedalOrder)) {
    const { group, mute } = PEDALS[i]!
    if (!machineOf(group)) lay(stage(group, pedalWet(c, group) && !c[mute]))
  }

  // Units cabled onto one machine, in the order they run there: a column per
  // machine under the band, headed by the machine's name.
  const pedalNames = pedalOrderAt(c.pedalOrder).map(i => PEDALS[i]!.group)
  const runOrder = [
    ...slotted,
    ...BENDS.map(b => b.group).filter(g => !slotted.includes(g)),
    ...pedalNames,
  ]
  const unitWet = (name: string) => {
    const bend = BEND_BY_NAME.get(name)
    const pedal = PEDALS.find(p => p.group === name)
    return bend
      ? c[bend.mix] > 0 && !c[bend.mute]
      : pedal
        ? pedalWet(c, name) && !c[pedal.mute]
        : false
  }
  const inserts = [...new Set(runOrder.flatMap(n => machineOf(n) ?? []))].map(
    machine => {
      const first = machine.split(' + ')[0]!
      doors.add(first)
      const units = runOrder.filter(n => machineOf(n) === machine)
      return {
        machine: first,
        head: mapNode(`into_${nodeId(machine)}`, 'jack', machine, {
          door: first,
          active: units.some(unitWet),
          w: nameWidth(machine),
          h: LABEL_H,
        }),
        chips: units.map(name => {
          doors.add(name)
          return mapNode(nodeId(name), 'chip', name, {
            door: name,
            active: unitWet(name),
            open: o.open === name,
            count: live ? touchedCount(name, c) : 0,
            w: chipW(name) + iconCol(name),
            h: CHIP_H - 2,
          })
        }),
      }
    },
  )

  // The stage's own run test: the drop rate alone does nothing with no sag.
  lay(
    stage(
      'Brownout',
      c.brownAmt > 0 || c.brownCrackle > 0 || c.humLevel > 0 || c.couple > 0,
    ),
  )
  if (tapeAt === TAPE_AT_END) lay(tape())
  path.push(stage('Output', true))

  // The bus is soldered to the board whether or not it is turned up, so it
  // stays on the map — greyed at zero, like any other stage sitting at no mix.
  const fbUp = c.fbAmt > 0 || c.fb2Amt > 0 || c.fb3Amt > 0
  const bus = stage('Feedback bus', fbUp)
  const busShown = has(bus.label)
  const pathAndBus = busShown ? [...path, bus] : path

  // The fittings the path runs past rather than through: the bay, the pad you
  // push one with, the wear that covers the whole board, and which order the
  // bends and the pedals run in. They sit at the foot of the drawing, under the
  // bus, and stay there greyed with nothing patched.
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
  const fittings = mapNode('fittings', 'label', 'fittings', {
    w: textWidth('fittings', SMALL),
    active: false,
    anchor: 'start',
    h: LABEL_H,
  })
  // Pad then bay, left to right, because that is the way the one wire between
  // them runs: the pad's two axes reach the board only through the bay. Wear
  // and Signal order touch neither, so they stand clear on the end.
  const foot = [pad, bay, wear, order].filter(drawn)

  // The trigger bridges are patch cables, so they are only in the way when one
  // is patched — and the board's frame is only as deep as what is inside it.
  const patchedTrigs = triggerBridges(c)
  const trigs = [...patchedTrigs, ...audioBridges(c)].filter(
    t => has(t.from) && has(t.to),
  )
  doors.add('Trigger patch')
  // The key line runs from the keyboard through each chip clipped onto it.
  const keyed = drawn(kb) ? gateLine.filter(drawn) : []
  const noTrig =
    hasBoard &&
    has('Trigger patch') &&
    !patchedTrigs.some(t => has(t.from) && has(t.to))
  const cables = trigs.filter(t => t.signal !== 'audio').length
  const cordsFrom = Math.max(cables, keyed.length > 0 ? 1 : 0)
  const trigRows = trigs.map((t, i) =>
    t.signal === 'audio' ? cordsFrom + i - cables : i,
  )
  const laneRows = Math.max(0, ...trigRows.map(r => r + 1))
  const laneUsed = keyed.length > 0 || trigs.length > 0 || noTrig
  const wiredInto = new Set(
    patched.map(i => WIRE_TARGET[Math.round(c[`mod${i}Dest`])]),
  )
  const topRow = chipRows[0] ?? []
  const underRow = new Set(
    chipRows.flatMap(row =>
      row.slice(1, -1).filter(n => wiredInto.has(n.label)),
    ),
  )

  // Notes the drawing writes on itself: a part that is on the board with
  // nothing wired to it, named where it would be wired. When neither toy fires
  // the other, the empty lane says so in a chip, which is a door.
  const trigAnchor = drawn(drums) ? drums : chipRows[0]?.[0]
  const noTrigChip =
    noTrig && trigAnchor
      ? mapNode('no_trig', 'chip', NO_TRIG, {
          door: 'Trigger patch',
          active: false,
          open: o.open === 'Trigger patch',
          w: textWidth(NO_TRIG, SMALL) + CHIP_PAD * 2,
          h: CHIP_H - 2,
        })
      : undefined
  // The rail has a box of its own, in the lip over its bar: five machines run
  // off it.
  const supply = hasBoard
    ? mapNode('supply', 'inst', SUPPLY, {
        door: SUPPLY,
        count: live ? touchedCount(SUPPLY, c) : 0,
        open: o.open === SUPPLY,
      })
    : undefined
  if (supply) supply.w = natural(supply)

  return {
    c,
    o,
    k,
    live,
    doors,
    wires,
    wire,
    bar,
    has,
    drawn,
    kb,
    mono,
    chips,
    chipRows,
    lower,
    hasBoard,
    lines,
    lineRows,
    spine,
    board,
    mix,
    path,
    rack,
    loose,
    bus,
    busShown,
    pathAndBus,
    fbUp,
    pad,
    bay,
    order,
    fittings,
    foot,
    trigs,
    trigRows,
    laneRows,
    keyed,
    laneUsed,
    topRow,
    underRow,
    trigAnchor,
    noTrigChip,
    supply,
    inserts,
  }
}

// How the path folds and how wide everything is.
function measure(p: Parts) {
  const { o, c, path, bus, busShown, pathAndBus, chipRows, lineRows, foot } = p
  const { rack, mix, board, loose } = p

  // A short path reads straight down; folding it leaves a column of one.
  const fold = !!o.wrap && path.length > 4
  const loop = fold && !!o.loop && busShown && Math.round(c.fbDest) === 0
  const cut = !fold
    ? path.length
    : loop
      ? Math.min(foldAt([...path, bus]), path.length - 1)
      : foldAt(path)
  const [down, up] = [path.slice(0, cut), path.slice(cut)]
  const upCol = loop ? [bus, ...up.toReversed()] : up
  const cols = up.length ? 2 : 1
  const spans = cols === 2 && !loop && down[0] === rack

  // One content width for the whole drawing, wide enough for the source band
  // and for the folded path both, and whichever came out narrower stretches to
  // it. The band is the usual winner: seven boxes across beats two columns.
  const stageNeed = Math.max(
    MIN_W,
    // The widest chip in the rack, right of the run: its bench name in half a
    // lone column or out across the second, its short name beside the loop.
    chipRoom(loose, loop ? 'label' : 'group') * (spans ? 1 : 2),
    // The rack draws no box of its own, so its label costs no width — only
    // the stages actually on the path do.
    ...pathAndBus
      .filter(n => n.kind !== 'rack')
      .map(n => PAD_X * 2 + iconCol(n.label) + nameWidth(n.label)),
  )
  const content = Math.ceil(
    Math.max(
      ...chipRows.map(
        row => sum(row) + INST_GAP * (row.length - 1) + FRAME_PAD * 2,
      ),
      ...lineRows.map(row => sum(row) + INST_GAP * (row.length - 1)),
      sum(foot) + INST_GAP * (foot.length - 1),
      cols * stageNeed + (cols - 1) * COL_GAP,
    ),
  )
  const colW = (content - (cols - 1) * COL_GAP) / cols
  // A single column hangs off the mix bus at the width its names need, rather
  // than stretching to the source band above it.
  const boxW = cols === 1 ? Math.min(colW, Math.max(stageNeed, STAGE_W)) : colW
  for (const n of pathAndBus) n.w = boxW
  rack.w = colW
  mix.w = cols === 1 ? boxW : content
  board.w = content
  for (const n of foot) n.w = natural(n)

  // The loose bends sit right of the run, which passes them by, and wrap onto
  // another row rather than off the box. They may reach over the second
  // column, which then starts under them. The chips show bench names when
  // every one fits, and short names when any does not.
  const chipEnd = (spans ? content : colW) - PAD_X
  const rackChips: {
    group: string
    label: string
    x: number
    row: number
    w: number
  }[] = []
  {
    const indent = colW / 2 + CHIP_GAP * 2
    const full = loose.every(b => indent + chipW(b.group) <= chipEnd)
    let [x, row] = [indent, 0]
    for (const b of loose) {
      const label = full ? b.group : b.label
      const w = chipW(label)
      if (x > indent && x + w > chipEnd) {
        row++
        x = indent
      }
      rackChips.push({ group: b.group, label, x, row, w })
      x += w + CHIP_GAP
    }
  }
  const lastChip = rackChips[rackChips.length - 1]
  rack.h = Math.max(CHIP_H, (lastChip ? lastChip.row + 1 : 0) * CHIP_H) + 2

  const overUp = rackChips.some(ch => ch.x + ch.w > colW)

  // The insert columns, packed out from the middle where the band meets the
  // bus, alternately left and right, a new row when neither side has room.
  const jackCols: { at: number; row: number; w: number; h: number }[] = []
  const rowHeights: number[] = []
  {
    const mid = content / 2
    let [left, right, row] = [mid, mid, 0]
    for (const ins of p.inserts) {
      const w = Math.max(ins.head.w, ...ins.chips.map(ch => ch.w))
      const h = LABEL_H + ins.chips.length * (CHIP_H - 2 + JACK_GAP)
      const leftRoom = (l: number) => l - JACK_GAP - w >= 0
      const rightRoom = (r: number) => r + JACK_GAP + w <= content
      if (!leftRoom(left) && !rightRoom(right) && (left < mid || right > mid)) {
        row++
        left = mid
        right = mid
      }
      const goLeft =
        leftRoom(left) && (mid - left <= right - mid || !rightRoom(right))
      const at = goLeft
        ? left - JACK_GAP - w
        : Math.max(Math.min(right + JACK_GAP, content - w), 0)
      if (goLeft) left = at
      else right = at + w
      jackCols.push({ at, row, w, h })
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, h)
    }
  }
  const jackH = rowHeights.reduce((a, h) => a + h + JACK_GAP, 0)

  return {
    loop,
    down,
    up,
    upCol,
    cols,
    content,
    colW,
    boxW,
    rackChips,
    overUp,
    jackCols,
    rowHeights,
    jackH,
  }
}

// Every box's y, top to bottom.
function layDown(m: Measured) {
  const { board, chipRows, underRow, laneUsed, laneRows, lower, hasBoard } = m
  const { lineRows, mix, loop, down, upCol, bus, busShown, foot, fittings } = m
  const { supply, rack, overUp } = m

  if (supply) supply.y = MARGIN
  board.y = supply ? supply.y + supply.h + FEED_H : MARGIN
  const railY = board.y + CAP_H + 2
  const chipY = board.y + BOX_H + RAIL_H / 2 + 2
  for (const n of chipRows[0] ?? []) n.y = chipY
  // The lane under the row, which carries everything written about the row
  // rather than about one box in it: what the key line is, the bridges you have
  // patched across it, and — when you have patched none — that there are none.
  const trackY = chipY + BOX_H + TRACK / 2
  const underTop = [...underRow].some(n => !lower.has(n))
  const underLow = [...underRow].some(n => lower.has(n))
  const laneY = chipY + BOX_H + (underTop ? TRACK : 0)
  const trigY = laneY + TRIG_H
  const laneEnd =
    laneY + (laneUsed ? Math.max(CHIP_H, laneRows * TRIG_H) + 4 : 0)
  const lowY = laneEnd + 4
  const lowTrackY = lowY + BOX_H + TRACK / 2
  const rail2Y = lowY + BOX_H + (underLow ? TRACK : 0) + RAIL_H / 2
  for (const n of lower) n.y = lowY
  const boardFloor = lower.size
    ? rail2Y + RAIL_H / 2
    : Math.max(laneEnd, chipY + BOX_H + RAIL_H / 2)
  board.h = hasBoard ? boardFloor - board.y : 0

  const lineY = hasBoard ? board.y + board.h + BAND_GAP : MARGIN
  for (const [r, row] of lineRows.entries())
    for (const n of row) n.y = lineY + r * (BOX_H + BAND_GAP)
  const bandBottom = lineRows.length
    ? lineY + (lineRows.length - 1) * (BOX_H + BAND_GAP) + BOX_H
    : board.y + board.h
  const jackTop = bandBottom + (m.jackH ? ROW_GAP : 0)
  {
    const rowTop = (r: number) =>
      jackTop + m.rowHeights.slice(0, r).reduce((a, h) => a + h + JACK_GAP, 0)
    for (const [i, ins] of m.inserts.entries()) {
      let y = rowTop(m.jackCols[i]!.row)
      ins.head.y = y
      y += LABEL_H + JACK_GAP
      for (const ch of ins.chips) {
        ch.y = y
        y += ch.h + JACK_GAP
      }
    }
  }
  const collectY = jackTop + m.jackH + COLLECT_H
  mix.y = collectY + BAND_GAP

  const pathTop = mix.y + mix.h + (loop ? LABEL_H + ROW_GAP : ROW_GAP)
  const upTop = pathTop + (overUp ? rack.h + ROW_GAP : 0)
  for (const [col, top] of [
    [down, pathTop],
    [upCol, upTop],
  ] as const) {
    let y = top
    for (const n of col) {
      n.y = y
      y += n.h + ROW_GAP
    }
  }
  const bodyBottom = Math.max(pathTop + stack(down), upTop + stack(upCol))
  if (!loop) bus.y = bodyBottom + BUS_GAP
  const captionY =
    loop || !busShown ? bodyBottom + BUS_GAP : bus.y + bus.h + ROW_GAP
  const footY = captionY + LABEL_H + 2
  for (const n of foot) n.y = footY
  fittings.y = captionY

  const trackUnder = (n: MapNode) => (lower.has(n) ? lowTrackY : trackY)
  return {
    railY,
    chipY,
    trackUnder,
    laneY,
    trigY,
    rail2Y,
    collectY,
    bodyBottom,
  }
}

// Every box's x, laid out at an origin of zero so the gutters can be measured
// off where each box landed, then everything shifted right once by the gutter.
function layAcross(d: LaidDown) {
  const { c, o, live, doors, has, chipRows, topRow, mono, lineRows, spine } = d
  const { content, board, mix, cols, colW, boxW, down, upCol, rack, loop } = d
  const { bus, busShown, foot, rackChips, pathAndBus, chips, lines } = d
  const { underRow, path, fittings, noTrigChip, trigAnchor, lower } = d
  const { laneY, supply } = d

  // By their labels rather than evenly: the chip is the one you do not play and
  // it should not come out the size of the two you do.
  for (const [r, row] of chipRows.entries()) {
    if (r === 1 && row.length === 1) continue
    spread(
      row,
      FRAME_PAD,
      content - FRAME_PAD * 2,
      row.map(() => INST_GAP),
      natural,
    )
  }
  // A lone box on the lower row takes the width of the box it hangs under: the
  // drums under the keyboard, the mono synth under the end of the gate line.
  if (chipRows[1]?.length === 1) {
    const [only] = chipRows[1]
    const above = only === mono ? topRow[topRow.length - 1]! : topRow[0]!
    ;[only!.w, only!.x] = [above.w, above.x]
  }
  const lineGap = spine ? INST_GAP * 1.5 : INST_GAP
  for (const row of lineRows) {
    if (spine) {
      const w = (content - lineGap) / 2
      for (const [i, n] of row.entries()) [n.w, n.x] = [w, i * (w + lineGap)]
      continue
    }
    spread(
      row,
      0,
      content,
      row.map(() => INST_GAP),
      natural,
    )
  }
  board.x = 0
  mix.x = cols === 1 ? (colW - boxW) / 2 : 0
  for (const n of down) n.x = n === rack ? 0 : (colW - boxW) / 2
  for (const n of upCol) n.x = boxW + COL_GAP
  if (!loop) bus.x = (content - boxW) / 2
  if (d.jackCols.length) {
    const shift = Math.min(
      Math.max(
        spineAt(d) - content / 2,
        -Math.min(...d.jackCols.map(j => j.at)),
      ),
      content - Math.max(...d.jackCols.map(j => j.at + j.w)),
    )
    for (const [i, ins] of d.inserts.entries()) {
      const col = d.jackCols[i]!
      const mid = col.at + shift + col.w / 2
      ins.head.x = mid - ins.head.w / 2
      for (const ch of ins.chips) ch.x = mid - ch.w / 2
    }
  }
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
      mapNode(nodeId(ch.group), 'chip', ch.label, {
        door: ch.group,
        active: false,
        open: o.open === ch.group,
        x: rack.x + ch.x,
        y: rack.y + ch.row * CHIP_H + 2,
        w: ch.w,
        h: CHIP_H - 2,
      }),
    ]),
  )
  const jackParts = d.inserts.flatMap(ins => [ins.head, ...ins.chips])
  const parts: MapNode[] = [...loosePart.values(), ...jackParts]
  const band = [...chips, ...lines]
  const byId = new Map(
    [
      ...pathAndBus,
      ...band,
      ...foot,
      mix,
      ...d.inserts.flatMap(ins => ins.chips),
    ].map(n => [n.id, n]),
  )

  // Where the feedback lands, and so which side of the map it comes home on.
  const fbTarget =
    byId.get(nodeId(FB_TARGET[Math.round(c.fbDest)] ?? 'mix')) ?? mix
  const rowEdge = (row: MapNode[]): MapNode => ({
    ...row[0]!,
    w: row[row.length - 1]!.x + row[row.length - 1]!.w - row[0]!.x,
  })
  const taps = collectTaps(c, {
    byId,
    doors,
    live,
    loosePart,
    rack,
    foot,
    has,
  }).map(t => {
    const row = chipRows.find(r => r.includes(t.target))
    return row && underRow.has(t.target) ? { ...t, edge: rowEdge(row) } : t
  })

  // Which edge of the drawing a label on this box hangs off. A box in the right
  // column, or in the right-hand half of the band, reaches for the right — and
  // the feedback bus takes the edge the feedback wire isn't already using.
  const half = (n: MapNode): Side => (midX(n) > content / 2 ? 'right' : 'left')
  const fbSide = half(fbTarget)
  const sideOf = (target: MapNode): Side =>
    target === bus ? (fbSide === 'left' ? 'right' : 'left') : half(target)
  const tapSideOf = (t: Tap) =>
    underRow.has(t.target) ? half(t.target) : sideOf(t.edge)

  // How much gutter a tap needs: its label, its run onto the box, and back off
  // whatever the box already sits in from that edge.
  const reach = (t: Tap, side: Side) =>
    tapWidth(t) +
    STUB -
    (side === 'left' ? t.edge.x : content - (t.edge.x + t.edge.w))
  const laneSide = loop || !busShown ? undefined : fbSide
  const gutter = (side: Side) =>
    Math.ceil(
      Math.max(
        laneSide === side ? LANE : 0,
        ...taps
          .filter(t => tapSideOf(t) === side)
          .map(t => (laneSide === side ? LANE : 0) + reach(t, side)),
      ),
    )
  const sideGutter = Math.max(gutter('left'), gutter('right'))
  // Which edge each tap reaches for, settled before the shift: sideOf reads an
  // x measured from zero.
  const tapSide = new Map(taps.map(t => [t, tapSideOf(t)]))

  const colX = MARGIN + sideGutter
  for (const n of [...path, ...band, ...foot, ...parts, board, mix, bus])
    n.x += colX
  for (const edge of new Set(taps.map(t => t.edge)))
    if (!byId.has(edge.id) || byId.get(edge.id) !== edge) edge.x += colX
  fittings.x = foot[0]?.x ?? 0

  const width = MARGIN * 2 + sideGutter * 2 + content
  const laneX = (side: Side) =>
    side === 'left' ? MARGIN + LANE / 2 : width - MARGIN - LANE / 2

  const notes: MapNode[] = []
  if (noTrigChip && trigAnchor) {
    // Under the keyboard, the note would sit on the key line's label if it
    // were centred on the drums. Its top clears the box above it, so the
    // outline does not run along the foot of the drums.
    noTrigChip.x = lower.has(trigAnchor)
      ? trigAnchor.x + PAD_X
      : midX(trigAnchor) - noTrigChip.w / 2
    noTrigChip.y = laneY + 1
    notes.push(noTrigChip)
  }
  if (supply) {
    supply.x = board.x + (board.w - supply.w) / 2
    notes.push(supply)
  }

  return {
    parts,
    band,
    byId,
    fbTarget,
    taps,
    tapSide,
    fbSide,
    laneSide,
    colX,
    width,
    laneX,
    notes,
  }
}

const SUPPLY_KEY = new Map<string, ControlKey>(
  SUPPLIED.map(m => [m.name, m.supply]),
)

// A machine moved to the second cells or the bench drops no tap onto the rail.
const onSharedCells = (c: Controls, label: string) => {
  const key = SUPPLY_KEY.get(label)
  return !key || Math.round(c[key]) === ON.shared
}

// The run of the gate line that ends on a box.
const runOf = (n: MapNode) => KEY_RUNS.find(r => r.machine === n.label)!

// The supply rail, the key line and the trigger bridges, all inside the toy
// board's frame.
function boardWires(m: Laid) {
  const { k, wire, bar, doors, board, chips, lower, railY, rail2Y, chipY } = m
  const { kb, keyed, laneY, trigs, trigRows } = m
  const { byId, trigY, noTrigChip } = m
  const { hasBoard } = m

  // One dotted loop round every machine on the rail. It starts mid-top so the
  // four corners round off and the seam falls on a straight run.
  const railLeft = board.x + FRAME_PAD / 2
  const railRight = board.x + board.w - FRAME_PAD / 2
  const railBottom = board.y + board.h
  if (hasBoard)
    bar(
      'rail',
      board,
      board,
      [
        [(railLeft + railRight) / 2, railY],
        [railRight, railY],
        [railRight, railBottom],
        [railLeft, railBottom],
        [railLeft, railY],
        [(railLeft + railRight) / 2, railY],
      ],
      {
        color: k.dim,
        dash: '1 2',
        door: SUPPLY,
      },
    )
  if (m.supply)
    bar(
      'supply-feed',
      m.supply,
      board,
      [
        [midX(m.supply), m.supply.y + m.supply.h],
        [midX(m.supply), railY],
      ],
      { color: k.dim, door: SUPPLY },
    )
  for (const toy of chips.filter(n => onSharedCells(m.c, n.label)))
    bar(
      `rail-${toy.id}`,
      board,
      toy,
      lower.has(toy)
        ? [
            [midX(toy), rail2Y],
            [midX(toy), toy.y + toy.h],
          ]
        : [
            [midX(toy), railY],
            [midX(toy), chipY],
          ],
      { color: k.dim, dash: '1 2', door: SUPPLY },
    )

  // The key line, which is solder rather than a cable you patched: the FM chip
  // has no keyboard and no sequencer, so every note it plays arrives on the
  // gate line the toy brings out. Each chip clips on through its own jumper, and
  // a run is drawn live while any drawn jumper beyond it is still soldered.
  const reaches = (i: number) =>
    keyed.slice(i).some(n => followsGate(m.c[runOf(n).jumper]))
  const keyLine = (i: number) => ({
    door: 'Trigger patch',
    key: runOf(keyed[i]!).jumper,
    ...(reaches(i) ? { color: k.accent2 } : { color: k.dim, dash: '3 3' }),
  })
  // In the lane under the joint rather than on it. The gap between two boxes
  // is twelve pixels and the word is twice that, so a label written there lands
  // on whichever box it overhangs — which is a button, and a word sitting on a
  // button reads as its name.
  const keyLabel: NonNullable<MapWire['label']> = {
    text: reaches(0) ? 'keyboard notes' : 'notes cut',
    x: keyed[0] ? (kb.x + kb.w + keyed[0].x) / 2 : 0,
    y: laneY + LABEL_H,
    anchor: 'middle',
  }
  for (const [i, to] of keyed.entries()) {
    const from = i === 0 ? kb : keyed[i - 1]!
    // Snaked, the line drops off the end of the row onto the box under it, near
    // the right edge so it stays clear of a trigger landing on the middle.
    const dropX = from.x + from.w - KEY_DROP_IN
    const pts: Point[] =
      lower.has(to) && !lower.has(from)
        ? dropX > to.x && dropX < to.x + to.w
          ? [
              [dropX, from.y + from.h],
              [dropX, to.y],
            ]
          : elbowV([dropX, from.y + from.h], [midX(to), to.y], to.y - 4)
        : [
            [from.x + from.w, from.y + BOX_H / 2],
            [to.x, from.y + BOX_H / 2],
          ]
    wire(runOf(to).id, from, to, pts, {
      ...keyLine(i),
      ...(i === 0 && { label: keyLabel }),
    })
  }

  if (noTrigChip) {
    const keyHalf = textWidth(keyLabel.text, SMALL) / 2 + 3
    if (
      keyed.length &&
      keyLabel.x - keyHalf < noTrigChip.x + noTrigChip.w &&
      keyLabel.x + keyHalf > noTrigChip.x
    )
      keyLabel.x = noTrigChip.x + noTrigChip.w + keyHalf + 1
  }
  doors.add(SUPPLY)

  // The bridges you patch yourself, in the lane under the row and in the patch
  // colour, so nothing here reads like the soldered line above it.
  const port = (n: MapNode) => (lower.has(n) ? n.y : n.y + n.h)
  // A bridge between a box and the one under it drops straight down the overlap
  // the two share, each at its own x so two bridges on one pair stay apart, and
  // writes its label clear of every drop.
  const drops = trigs.map((t, i) => {
    const [from, to] = [byId.get(nodeId(t.from))!, byId.get(nodeId(t.to))!]
    if (lower.has(from) === lower.has(to)) return undefined
    const [lo, hi] = [
      Math.max(from.x, to.x),
      Math.min(from.x + from.w, to.x + to.w),
    ]
    if (hi - lo < TRIG_H * 2) return undefined
    const upper = lower.has(from) ? to : from
    const x = midX(upper) + (i - (trigs.length - 1) / 2) * TRIG_H
    return Math.min(hi - TRIG_H, Math.max(lo + TRIG_H, x))
  })
  const dropLabelX = Math.max(0, ...drops.map(x => x ?? 0)) + 5
  const keyW = textWidth(keyLabel.text, SMALL)
  for (const [i, t] of trigs.entries()) {
    const [from, to] = [byId.get(nodeId(t.from))!, byId.get(nodeId(t.to))!]
    const y = trigY + trigRows[i]! * TRIG_H
    const x = drops[i]
    const label: NonNullable<MapWire['label']> =
      x === undefined
        ? {
            text: t.label,
            x: (midX(from) + midX(to)) / 2,
            y: y - 3,
            anchor: 'middle',
          }
        : { text: t.label, x: dropLabelX, y: y - 3, anchor: 'start' }
    // The lane's top row also carries the key line's label, which steps right
    // past a bridge label that runs under the joint.
    const w = textWidth(label.text, SMALL)
    const left = label.anchor === 'start' ? label.x : label.x - w / 2
    if (
      Math.abs(label.y - keyLabel.y) < LABEL_H / 2 &&
      left < keyLabel.x + keyW / 2 + 3 &&
      left + w > keyLabel.x - keyW / 2 - 3
    )
      keyLabel.x = left + w + 4 + keyW / 2
    wire(
      t.id,
      from,
      to,
      x === undefined
        ? [
            [midX(from), port(from)],
            [midX(from), y],
            [midX(to), y],
            [midX(to), port(to)],
          ]
        : [
            [x, port(from)],
            [x, port(to)],
          ],
      {
        color:
          t.signal === 'hits'
            ? k.hits
            : t.signal === 'audio'
              ? k.audio
              : k.accent2,
        dash: '4 3',
        door: t.door ?? 'Trigger patch',
        key: t.id,
        label,
      },
    )
  }
}

// Where the band's leads meet on their way down to the bus: the gap nearest the
// bus in the first row of line machines, else under the board, else over the
// bus.
const gapsOf = (row: readonly MapNode[]) =>
  row.slice(1).map((n, i) => (row[i]!.x + row[i]!.w + n.x) / 2)

const gapAt = (row: readonly MapNode[], mix: MapNode) =>
  gapsOf(row).reduce(
    (best, x) =>
      Math.abs(x - midX(mix)) < Math.abs(best - midX(mix)) ? x : best,
    gapsOf(row)[0] ?? midX(mix),
  )

function spineAt(m: {
  lineRows: MapNode[][]
  chipRows: MapNode[][]
  hasBoard: boolean
  mix: MapNode
}) {
  const { lineRows, chipRows, hasBoard, mix } = m
  const first = lineRows[0]
  return first
    ? gapAt(first, mix)
    : hasBoard
      ? gapAt(chipRows[chipRows.length - 1] ?? [], mix)
      : midX(mix)
}

// Everything meets on one bar and the bar feeds the mix. The board's own output
// comes down the channel between two of the boxes under it rather than through
// one of them, which is the whole reason the band is a grid. In a stacked band
// it comes down the first gap, steps across between the rows and down the
// second.
function bandWires(m: Laid) {
  const { k, wire, bar, mix, lineRows, chipRows, hasBoard, board, spine } = m
  const { collectY, down, inserts } = m

  const gapX = (row: MapNode[]) => gapAt(row, mix)
  const channels = lineRows.map(gapX)
  const lastRow = chipRows[chipRows.length - 1] ?? []
  const spineX = spineAt(m)

  // Each machine's insert column: its name, cabled down through what is
  // patched into it, and on into the bus where the band's leads meet.
  for (const { machine, head, chips: units } of inserts) {
    const x = midX(head)
    const color = head.active ? k.border : k.dim
    const stops = [head, ...units]
    for (let i = 1; i < stops.length; i++) {
      const [a, b] = [stops[i - 1]!, stops[i]!]
      wire(
        `${a.id}-${b.id}`,
        a,
        b,
        [
          [x, a.y + a.h],
          [x, b.y],
        ],
        { color, door: machine },
      )
    }
    const last = stops[stops.length - 1]!
    bar(
      `${last.id}-in`,
      last,
      mix,
      [
        [x, last.y + last.h],
        [x, collectY],
        [spineX, collectY],
      ],
      { color: k.border, door: mix.door },
    )
  }
  const boardBottom = board.y + board.h
  const inGap =
    lastRow.length < 2 ||
    lastRow
      .slice(1)
      .some((n, i) => spineX > lastRow[i]!.x + lastRow[i]!.w && spineX < n.x)
  if (hasBoard)
    bar(
      'board-out',
      board,
      mix,
      elbowV(
        [inGap ? spineX : gapX(lastRow), boardBottom],
        [spineX, collectY],
        boardBottom + Math.min(BAND_GAP, COLLECT_H) / 2,
      ),
      { color: k.border, door: mix.door },
    )
  if (spine) {
    for (const row of lineRows)
      for (const [i, src] of row.entries())
        bar(
          `${src.id}-out`,
          src,
          mix,
          [
            [i === 0 ? src.x + src.w : src.x, midY(src)],
            [spineX, midY(src)],
          ],
          { color: k.border, door: src.door, key: levelKey(src) },
        )
  }
  const leads: number[] = []
  for (const row of spine ? [] : lineRows)
    for (const src of row) {
      const x = midX(src)
      leads.push(x)
      bar(
        `${src.id}-out`,
        src,
        mix,
        [
          [x, src.y + src.h],
          [x, collectY],
        ],
        { color: k.border, door: src.door, key: levelKey(src) },
      )
    }
  if (!spine)
    bar(
      'collect',
      mix,
      mix,
      [
        [Math.min(spineX, ...channels, ...leads), collectY],
        [Math.max(spineX, ...channels, ...leads), collectY],
      ],
      { color: k.border, door: mix.door },
    )
  wire(
    'collect-mix',
    mix,
    mix,
    [
      [channels.length ? midX(mix) : spineX, collectY],
      [channels.length ? midX(mix) : spineX, mix.y],
    ],
    { color: k.border, door: mix.door },
  )
  const first = run(down)[0]
  if (first)
    wire(
      'mix-path',
      mix,
      first,
      [
        [midX(first), mix.y + mix.h],
        [midX(first), first.y],
      ],
      { color: k.border, door: mix.door },
    )
}

// The boxes the signal runs through: the rack's chips sit beside the run.
const run = (col: MapNode[]) => col.filter(n => n.kind !== 'rack')

// The path: a hop from the foot of each box to the head of the next, and the
// fold between the two columns.
function pathWires(m: Laid) {
  const { k, wire, has, order, down, up, loop, colX, boxW } = m
  const orderDoor = has(order.label) ? order.door : undefined
  const [downRun, upRun] = [run(down), run(up)]
  for (const col of [downRun, upRun]) {
    for (let i = 1; i < col.length; i++) {
      const [a, b] = [col[i - 1]!, col[i]!]
      wire(
        `${a.id}-${b.id}`,
        a,
        b,
        loop && col === upRun
          ? [
              [midX(a), a.y],
              [midX(b), b.y + b.h],
            ]
          : [
              [midX(a), a.y + a.h],
              [midX(b), b.y],
            ],
        { color: k.border, door: orderDoor },
      )
    }
  }

  // The fold: down the left, up the empty channel between the columns, into the
  // top of the right. The one line on the map that isn't a short hop, which is
  // what makes it read as the cable carrying the eye across.
  if (loop) {
    const [a, b] = [downRun[downRun.length - 1]!, upRun[0]!]
    const turnY = Math.max(a.y + a.h, b.y + b.h) + ROW_GAP
    wire(
      'fold',
      a,
      b,
      [
        [midX(a), a.y + a.h],
        [midX(a), turnY],
        [midX(b), turnY],
        [midX(b), b.y + b.h],
      ],
      { color: k.accent, door: orderDoor },
    )
  } else if (upRun.length) {
    const [a, b] = [downRun[downRun.length - 1]!, upRun[0]!]
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
      { color: k.accent, door: orderDoor },
    )
  }
}

// Out of the path onto the feedback bus, and home round the outside of the rack.
// Both wires carry the bus's own door, so clicking the line that runs off the
// output opens the bus's controls without hunting for the box.
function feedbackWires(m: Laid) {
  const { c, k, live, wire, busShown, path, fbUp, bus, loop, fbTarget } = m
  const { laneX, fbSide, bodyBottom } = m
  if (!busShown) return
  const fbY = midY(fbTarget)
  const tail = path[path.length - 1]!
  const fbColor = fbUp ? k.accent2 : k.dim
  wire(
    'fb-out',
    tail,
    bus,
    loop
      ? [
          [midX(tail), tail.y],
          [midX(bus), bus.y + bus.h],
        ]
      : elbowV([midX(tail), tail.y + tail.h], [midX(bus), bus.y], bus.y - 10),
    { color: fbColor, dash: '4 3', door: 'Feedback bus', key: 'fbAmt' },
  )
  const fbLabel = live ? c.fbAmt.toFixed(2) : 'feedback'
  if (loop) {
    wire(
      'fb-home',
      bus,
      fbTarget,
      [
        [midX(bus), bus.y],
        [midX(bus), fbTarget.y + fbTarget.h],
      ],
      {
        color: fbColor,
        dash: '4 3',
        door: 'Feedback bus',
        key: 'fbAmt',
        label: {
          text: fbLabel,
          x: midX(bus) + 5,
          y: bus.y - ROW_GAP,
          anchor: 'start',
        },
      },
    )
    return
  }
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
      key: 'fbAmt',
      label: {
        text: fbLabel,
        x: lane + (fbSide === 'left' ? 4 : -4),
        y: bodyBottom + 13,
        anchor: fbSide === 'left' ? 'start' : 'end',
      },
    },
  )
}

// The pad's wire into the bay, then every wire off the patch bay and the mic as
// a label out in the gutter with a short run onto what it feeds.
function tapWires(m: Laid): MapNode[] {
  const { k, wire, drawn, pad, bay, laneSide, fbTarget, taps, tapSide } = m
  const { underRow, trackUnder } = m

  // Dotted and cool, like every other line off the bay: a control line rather
  // than anything you can hear.
  if (drawn(pad) && drawn(bay))
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

  const labels: MapNode[] = []
  // Where a label would be struck through by a line already drawn: its
  // neighbours, and the run the feedback wire comes home on.
  const taken: Record<Side, [number, number][]> = { left: [], right: [] }
  const fbY = midY(fbTarget)
  if (laneSide) taken[laneSide].push([fbY - LABEL_H / 2, fbY + LABEL_H / 2])
  const clear = (side: Side, want: number, h: number) => {
    let y = want
    for (const [top, bottom] of taken[side].toSorted((a, b) => a[0] - b[0]))
      if (y < bottom && y + h > top) y = bottom + 3
    taken[side].push([y, y + h])
    return y
  }

  const riseX = (n: MapNode, side: Side) =>
    side === 'left' ? n.x + PAD_X : n.x + n.w - PAD_X
  for (const tap of taps.toSorted((a, b) => tapY(a) - tapY(b))) {
    const side = tapSide.get(tap)!
    const h = tap.value ? LABEL_H * 2 : LABEL_H
    const under = underRow.has(tap.target)
    const trackY = trackUnder(tap.target)
    const y = clear(side, (under ? trackY : tapY(tap)) - LABEL_H / 2, h)
    const edge = side === 'left' ? tap.edge.x : tap.edge.x + tap.edge.w
    const land = side === 'left' ? tap.target.x : tap.target.x + tap.target.w
    const anchorX = edge + (side === 'left' ? -STUB : STUB)
    const label = mapNode(tap.id, 'label', tap.label, {
      door: tap.door,
      key: tap.labelKey,
      ...(tap.valueDoor && { valueDoor: tap.valueDoor, valueKey: tap.key }),
      active: tap.active,
      x: anchorX,
      y,
      w: tapWidth(tap),
      h,
      anchor: side === 'left' ? 'end' : 'start',
      value: tap.value,
    })
    labels.push(label)
    wire(
      `${tap.id}-wire`,
      label,
      tap.target,
      under
        ? [
            ...elbowH(
              [anchorX + (side === 'left' ? 3 : -3), y + LABEL_H / 2],
              [riseX(tap.target, side), trackY],
              (anchorX + edge) / 2,
            ),
            [riseX(tap.target, side), tap.target.y + tap.target.h],
          ]
        : elbowH(
            [anchorX + (side === 'left' ? 3 : -3), y + LABEL_H / 2],
            [land, tapY(tap)],
            (anchorX + edge) / 2,
          ),
      {
        color: tap.active ? k.mod : k.dim,
        dash: tap.dash,
        door: tap.wireDoor,
        key: tap.key,
      },
    )
  }
  return labels
}

interface Tap {
  id: string
  label: string
  value?: string
  /** what the label opens: whatever this end is clipped onto */
  door: string
  /** what the wire opens: the bay it is patched at */
  wireDoor: string
  /** the control the wire sets, which a reading on the label sets too */
  key: ControlKey
  labelKey?: ControlKey
  /** where the reading opens, when that is not where the label does */
  valueDoor?: string
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

const tapWidth = (t: Tap) =>
  Math.max(textWidth(t.label, SMALL), textWidth(t.value ?? '', SMALL))

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
    has: (name: string) => boolean
  },
): Tap[] {
  const taps: Tap[] = []
  const [first, last] = [ctx.foot[0], ctx.foot[ctx.foot.length - 1]]
  const footEdge = (n: MapNode): MapNode =>
    ctx.foot.includes(n) && first && last
      ? { ...n, x: first.x, w: last.x + last.w - first.x }
      : n

  // The mic, which is a patch point rather than a channel — so it draws as the
  // wire it is, onto whichever jack it is soldered to, and says so when it runs
  // through the mic delay on the way. Turned
  // right down it is still soldered there, so it stays on the map greyed, the
  // way the feedback bus does at no amount.
  // Every solder point but the mix is a stage, and a stage can be in none of
  // the slots — in which case the wire runs in through the rack's edge and
  // lands on the chip riding in it, greyed: it is soldered exactly where you
  // put it, and there is nothing running through what you put it on.
  // A second wire draws as a second tap, unless it lands on the same box as
  // the first, where one wire stands for both.
  const micTaps: string[] = []
  wiredJacks(c).forEach((jack, at) => {
    const wire = at === 0 ? 1 : 2
    const micPoint = MIC_TARGET[jack] ?? 'mix'
    const onPath = ctx.byId.get(nodeId(micPoint))
    const inRack = ctx.loosePart.get(micPoint)
    const mic = onPath
      ? { target: onPath, edge: footEdge(onPath), active: c.micLevel > 0 }
      : inRack
        ? { target: inRack, edge: ctx.rack, active: false }
        : undefined
    if (mic && ctx.has('Mic') && !micTaps.includes(mic.target.id)) {
      micTaps.push(mic.target.id)
      ctx.doors.add('Mic')
      taps.push({
        id: wire === 1 ? 'mic' : 'mic2',
        label: wireLabel(c, wire),
        value: ctx.live && mic.active ? c.micLevel.toFixed(2) : undefined,
        door: 'Mic',
        wireDoor: 'Mic',
        key: 'micLevel',
        labelKey: wireLabel(c, wire) === 'mic' ? 'micLevel' : 'micDelay',
        dash: '1 3',
        ...mic,
      })
    }
  })

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
      key,
      labelKey: key,
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
      label: `${SRC_LABEL[src]}`,
      value: ctx.live ? depth.toFixed(2) : undefined,
      door: pickup,
      wireDoor: 'Patch bay',
      key: `mod${i}Depth`,
      valueDoor: 'Patch bay',
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

const BEND_BY_NAME = new Map<string, (typeof BENDS)[number]>(
  BENDS.map(b => [b.group, b]),
)

// ---- the drawing ----------------------------------------------------------

const baseline = (y: number, h: number, size: number) => y + h / 2 + size * 0.35

function door(
  inner: El[],
  name: string | undefined,
  links: boolean,
  current = false,
  key?: ControlKey,
): El[] {
  if (!name || !links) return inner
  return [
    el(
      'a',
      {
        href: `#${groupAnchor(name)}`,
        'data-door': name,
        ...(key && { 'data-key': key }),
        'aria-label': `${name} controls`,
        ...(current && { 'aria-current': 'true' }),
      },
      inner,
    ),
  ]
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

// A dot on a box's top-right corner when a control in the stage is off stock.
// It draws outside the door, since a link can't hold a link, and it is signage:
// the stage's own panel puts it back.
function touchedMark(n: MapNode, k: Palette): El[] {
  if (n.count === 0) return []
  return [
    el('g', { className: 'touched', 'data-touched': n.door ?? n.label }, [
      el('title', {}, [`${n.count} control${n.count === 1 ? '' : 's'} moved`]),
      el('circle', {
        cx: n.x + n.w - BADGE_IN,
        cy: n.y + BADGE_IN,
        r: BADGE_R,
        fill: k.accent,
        stroke: k.bg,
        strokeWidth: 1.5,
      }),
    ]),
  ]
}

// A bar down the left edge of a stage whose face is on the bench, so the map
// says which pedals are in the main area without opening each one.
function benchedMark(n: MapNode, k: Palette): El[] {
  if (!n.benched) return []
  return [
    el(
      'rect',
      {
        className: 'benched',
        x: n.x + 2,
        y: n.y + 3,
        width: 2,
        height: n.h - 6,
        rx: 1,
        fill: k.fg,
      },
      [el('title', {}, ['on the bench'])],
    ),
  ]
}

// How far up a source's fader is, along the foot of its own box. A source with
// something coming out of it lights the bar, which is the map saying that what
// you are hearing starts here — the fader is where it is set to, and the colour
// is whether that setting is doing anything.
function levelBar(n: MapNode, k: Palette, meter: number): El[] {
  // The empty part of the travel is drawn too: a bar that stops where the level
  // does is a bar with nothing to read it against. Every source's travel is as
  // long as the narrowest box's, so a wide box doesn't read as a loud one.
  const [x, y, w] = [
    n.x + PAD_X,
    n.y + n.h - 4,
    Math.min(meter, n.w - PAD_X * 2),
  ]
  const track = el('rect', {
    x,
    y,
    width: w,
    height: 2,
    fill: k.border,
    fillOpacity: 0.3,
  })
  const level = n.level ?? 0
  if (level <= 0) return [track]
  return [
    track,
    el('rect', {
      x,
      y,
      width: Math.max(2, w * Math.min(1, level)),
      height: 2,
      fill: n.playing ? k.accent2 : k.fg,
      fillOpacity: n.playing ? 0.95 : 0.5,
    }),
  ]
}

// What each source is, drawn rather than spelt: a 12px glyph in the left of its
// own box, so the seven read as seven different machines before the names are. It
// carries the run state too — a machine lights its glyph while something is
// coming out of it, which is one marker doing the work of two.
const GLYPH: Record<string, (x: number, y: number, c: string) => El[]> = {
  Plinky: (x, y, c) => [
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
  Glint: (x, y, c) => [
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
  Parlor: (x, y, c) => {
    const h = [9, 5, 2, 3, 7, 10]
    const steps = h.map((v, i) => `M ${x + i * 2} ${y + v} h 2`)
    const risers = h
      .slice(1)
      .map((v, i) => `M ${x + (i + 1) * 2} ${y + h[i]!} V ${y + v}`)
    return [
      el('path', {
        d: [...steps, ...risers].join(' '),
        fill: 'none',
        stroke: c,
        strokeWidth: 0.9,
        strokeLinejoin: 'miter',
      }),
    ]
  },
  Growler: (x, y, c) => [
    el('path', {
      d: `M ${x} ${y + 10} L ${x + 4} ${y + 2} V ${y + 10} L ${x + 8} ${y + 2} V ${y + 10} L ${x + 12} ${y + 2}`,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
      strokeLinejoin: 'miter',
    }),
  ],
  // A speech balloon.
  Prattle: (x, y, c) => [
    el('path', {
      d: `M ${x + 1} ${y + 1.5} H ${x + 11} V ${y + 8} H ${x + 5.5} L ${x + 2.5} ${y + 11} V ${y + 8} H ${x + 1} Z`,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
      strokeLinejoin: 'round',
    }),
  ],
  Howler: (x, y, c) => [
    el('path', {
      d: `M ${x} ${y + 10} L ${x + 6} ${y + 1} V ${y + 10} L ${x + 12} ${y + 1} V ${y + 10}`,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
      strokeLinejoin: 'miter',
    }),
  ],
  Clatter: (x, y, c) => [
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
  // A sheet of steel with its two pickups.
  Sheet: (x, y, c) => [
    el('rect', {
      x,
      y: y + 2,
      width: ICON,
      height: 8,
      fill: 'none',
      stroke: c,
      strokeWidth: 1,
    }),
    el('circle', { cx: x + 3.5, cy: y + 4.5, r: 1, fill: c }),
    el('circle', { cx: x + 8.5, cy: y + 7.5, r: 1, fill: c }),
  ],
  // A bottle: neck, shoulder and body.
  Bottle: (x, y, c) => [
    el('path', {
      d: `M ${x + 5} ${y} L ${x + 7} ${y} L ${x + 7} ${y + 3} L ${x + 9} ${y + 5} L ${x + 9} ${y + 12} L ${x + 3} ${y + 12} L ${x + 3} ${y + 5} L ${x + 5} ${y + 3} Z`,
      fill: 'none',
      stroke: c,
      strokeWidth: 1,
      strokeLinejoin: 'round',
    }),
  ],
  // A cassette: the shell, its two hubs and the window between them.
  Layercake: (x, y, c) => [
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
    el('circle', { cx: x + 3.6, cy: y + 5.6, r: 1.4, fill: c }),
    el('circle', { cx: x + 8.4, cy: y + 5.6, r: 1.4, fill: c }),
    el('path', {
      d: `M ${x + 2.5} ${y + 8.6} h 7`,
      stroke: c,
      strokeWidth: 0.9,
    }),
  ],
  // The six pedals, drawn as the boxes they would be on a floor: the stompbox
  // as an enclosure with a footswitch under its knob, and the other five as
  // what each one does to the signal rather than as five more enclosures — at
  // 12px a row of alike outlines says only "pedal", which is what their place
  // on the path already says.
  Gnash: (x, y, c) => [
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
  Wraith: (x, y, c) => [
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
  Ricochet: (x, y, c) => [
    el('path', {
      d: [9, 6, 3.6, 2]
        .map((h, i) => `M ${x + 1.2 + i * 3} ${y + 10} v ${-h}`)
        .join(' '),
      stroke: c,
      strokeWidth: 1,
      strokeLinecap: 'round',
    }),
  ],
  Boing: (x, y, c) => [
    el('path', {
      d: `M ${x + 0.4} ${y + 9} h 0.8 ${[0, 1, 2]
        .map(() => 'q 1.7 -9.5 3.4 0')
        .join(' ')} h 0.8`,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
  ],
  // One wave and the same wave a beat late, which is the whole of a chorus.
  Chorale: (x, y, c) =>
    [0, 2.6].map(dy =>
      el('path', {
        d: `M ${x + 1} ${y + 4 + dy} q 2.5 -3 5 0 q 2.5 3 5 0`,
        fill: 'none',
        stroke: c,
        strokeWidth: 0.9,
      }),
    ),
  // A valve: the glass, with the plate and the grid standing inside it.
  Ember: (x, y, c) => [
    el('path', {
      d: `M ${x + 3} ${y + 10.5} V ${y + 4.6} a 3 3.6 0 0 1 6 0 V ${y + 10.5} z`,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('path', {
      d: `M ${x + 4.8} ${y + 9} V ${y + 4.8} M ${x + 7.2} ${y + 9} V ${y + 4.8}`,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
  ],
  // Two cells in a case: the rail the five machines on the board run off.
  [SUPPLY]: (x, y, c) => [
    el('rect', {
      x,
      y: y + 3,
      width: 10,
      height: 6,
      rx: 1,
      fill: 'none',
      stroke: c,
      strokeWidth: 0.9,
    }),
    el('rect', { x: x + 10, y: y + 5, width: 1.6, height: 2, fill: c }),
    el('rect', { x: x + 2, y: y + 4.6, width: 2.2, height: 2.8, fill: c }),
    el('rect', { x: x + 5.4, y: y + 4.6, width: 2.2, height: 2.8, fill: c }),
  ],
  Spool: (x, y, c) => [
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

function glyph(n: MapNode, k: Palette, y: number, pad = PAD_X): El[] {
  const draw = GLYPH[n.label]
  if (!draw) return []
  const c = n.playing ? k.accent2 : n.active || n.open ? k.fg : k.dim
  return [el('g', { className: 'glyph' }, draw(n.x + pad, y, c))]
}

// A box's edge says whether the stage is doing anything, and the touched dot
// on its corner says whether a control in it has moved.
const edge = (n: MapNode, k: Palette) =>
  n.open ? k.fg : n.active ? k.dim : k.border

export function drawNode(
  n: MapNode,
  k: Palette,
  links: boolean,
  meter = Infinity,
): El {
  if (n.kind === 'label') {
    const fill = n.active ? k.mod : k.dim
    const top = baseline(n.y, LABEL_H, SMALL)
    const name = words(n.label, n.x, top, SMALL, fill, n.anchor)
    const value = n.value
      ? [words(n.value, n.x, top + LABEL_H, SMALL, fill, n.anchor)]
      : []
    return el(
      'g',
      { className: 'tap' },
      n.valueDoor && value.length
        ? [
            ...door([name], n.door, links, n.open, n.key),
            ...door(value, n.valueDoor, links, false, n.valueKey),
          ]
        : door([name, ...value], n.door, links, n.open, n.key),
    )
  }
  if (n.kind === 'jack')
    return el(
      'g',
      { className: 'node' },
      door(
        [
          words(
            caps(n.label),
            midX(n),
            baseline(n.y, n.h, FONT),
            FONT,
            n.active ? k.fg : k.dim,
          ),
        ],
        n.door,
        links,
        n.open,
      ),
    )
  // The supply loop is the board's outline; the frame draws only its name, the
  // door onto the board's parts that have no box.
  if (n.kind === 'frame') {
    return el('g', { className: 'node' }, [
      ...door(
        [words(n.label, n.x + PAD_X, n.y + CAP_H - 2, SMALL, k.dim, 'start')],
        n.door,
        links,
        n.open,
      ),
    ])
  }

  if (n.kind === 'rack')
    return el(
      'g',
      { className: 'node' },
      n.label
        ? [
            words(
              n.label,
              midX(n) - CHIP_GAP * 2,
              baseline(n.y + 2, CHIP_H - 2, SMALL),
              SMALL,
              k.dim,
              'end',
            ),
          ]
        : [],
    )

  // A chip riding in the rack: a flat pill rather than a box, because nothing
  // runs through it. A bend in none of the slots is one; so is the note that
  // no trigger is patched.
  if (n.kind === 'chip') {
    const lead = iconCol(n.label)
    const ink = n.active || n.open ? k.fg : k.dim
    const note = n.id === 'no_trig'
    return el('g', { className: 'node' }, [
      ...door(
        [
          el('rect', {
            className: 'box',
            x: n.x,
            y: n.y,
            width: n.w,
            height: n.h,
            rx: n.h / 2,
            fill: k.raise,
            stroke: n.open ? k.fg : 'none',
          }),
          ...(lead ? glyph(n, k, n.y + (n.h - ICON) / 2, CHIP_PAD) : []),
          words(
            note ? n.label : caps(n.label),
            n.x + lead + (n.w - lead) / 2,
            baseline(n.y, n.h, note ? SMALL : FONT),
            note ? SMALL : FONT,
            ink,
          ),
        ],
        n.door,
        links,
        n.open,
      ),
      ...touchedMark(n, k),
    ])
  }

  // An instrument: a glyph of the machine it is, then a name and a count over
  // how far its fader is up. A box rather than a line in a rack, because what a
  // source is wired to is the point and only a box has edges for a wire to
  // land on.
  if (n.kind === 'inst') {
    const lit = edge(n, k)
    const bar = n.level !== undefined
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
      ...glyph(n, k, n.y + (n.h - ICON) / 2 - (bar ? 1.5 : 0)),
      words(
        caps(n.label),
        n.x + PAD_X + ICON_COL,
        baseline(n.y, n.h - (bar ? 3 : 0), FONT),
        FONT,
        n.active || n.open ? k.fg : k.dim,
        'start',
      ),
      ...(bar ? levelBar(n, k, meter) : []),
    ]
    return el(
      'g',
      { className: n.id === 'supply' ? 'node rail-chip' : 'node' },
      [...door(inner, n.door, links, n.open), ...touchedMark(n, k)],
    )
  }
  const lit = edge(n, k)
  // Every box with room for a glyph column keeps one, so the names down a
  // column share a centre whether or not their stage has a glyph.
  const roomy = n.w >= PAD_X * 2 + ICON_COL + nameWidth(n.label)
  const lead = iconCol(n.label) || (roomy ? ICON_COL : 0)
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
    words(
      caps(n.label),
      n.x + lead + (n.w - lead) / 2,
      baseline(n.y, n.h, FONT),
      FONT,
      n.active || n.open ? k.fg : k.dim,
    ),
    ...benchedMark(n, k),
  ]
  return el('g', { className: 'node' }, [
    ...door(inner, n.door, links, n.open),
    ...touchedMark(n, k),
  ])
}

function drawWire(w: MapWire, links: boolean, open?: string): El {
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
  return el(
    'g',
    { className: 'wire', 'data-wire': w.id },
    door(parts, w.door, links, w.door === open, w.key),
  )
}

// Boxes come before wires so Tab reaches a stage before the wires round it.
// The supply rail alone stays underneath, since it runs behind the boxes.
export function drawMap(map: ChainMap): El {
  const meter = Math.min(
    ...map.nodes.filter(n => n.level !== undefined).map(n => n.w - PAD_X * 2),
  )
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
      ...map.wires
        .filter(w => w.id === 'rail')
        .map(w => drawWire(w, map.links, map.open)),
      ...map.nodes.map(n => drawNode(n, map.palette, map.links, meter)),
      ...map.wires
        .filter(w => w.id !== 'rail')
        .map(w => drawWire(w, map.links, map.open)),
    ],
  )
}
