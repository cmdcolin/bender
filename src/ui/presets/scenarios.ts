import type { ControlKey, Controls } from '../../controls'
import {
  bendAt,
  BEND_SLOT_KEYS,
  GROUPS,
  ALL_SLIDERS,
  sliderFor,
  snapToStep,
} from '../controls'
import { fromPos } from '../slider-scale'
import { applyCut, CUTS, type CutDef } from './cuts'
import { inTime } from './quantize'
import { rollGroup, rollKeys } from './roll'
import { CLOCK_KEYS, YOURS } from './yours'

export interface ScenarioDef {
  name: string
  label: string
  blurb: string
  roll: (current: Controls, rand: () => number) => Controls
}

const WIRE_KEYS: ControlKey[] = [
  'fbDest',
  'micPatch',
  'mod0Src',
  'mod0Dest',
  'mod1Src',
  'mod1Dest',
  'mod2Src',
  'mod2Dest',
  'mod3Src',
  'mod3Dest',
  'trigToKeys',
  'trigKeysNote',
  'trigToDrum',
]

// Same parts, different order. Every bend keeps the settings you gave it and
// swaps places with another, and the wires that decide where things land get
// re-soldered — the one roll that asks "what if this went through that first"
// without any opinion about what it should sound like.
function rewire(current: Controls, rand: () => number): Controls {
  const next = { ...current }
  const slots = BEND_SLOT_KEYS.map(k => current[k])
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j]!, slots[i]!]
  }
  BEND_SLOT_KEYS.forEach((key, i) => {
    next[key] = slots[i]!
  })
  return rollKeys(next, WIRE_KEYS, rand)
}

const bendCount = () => (sliderFor('bendSlot0').choices?.length ?? 1) - 1

// One bend, on its own, turned up. Six at once is where a board turns to
// porridge; this clears the slots down to a single bend and rolls that one
// hard, so whatever comes back is a sound you can name.
function oneBend(current: Controls, rand: () => number): Controls {
  const slot = 1 + Math.floor(rand() * bendCount())
  const bend = bendAt(slot)!
  const group = GROUPS.find(g => g.name === bend.group)!
  const next = rollGroup(group, current, rand)
  BEND_SLOT_KEYS.forEach((key, i) => {
    next[key] = i === 0 ? slot : 0
  })
  // Rolled hard means heard: the one bend on the board does not get to sit at
  // a dry/wet of zero.
  next[bend.mix] = snapToStep(sliderFor(bend.mix), 0.6 + rand() * 0.4)
  return next
}

// A knife on a bus, off the panel's own list of the ones worth hearing. The
// blind dice leave these wires alone — they are shy, and a wire picked at random
// is as likely to be one this ROM never drives as one you can hear — so this is
// the roll that names them, and it draws from the same table the panels do
// rather than from the width of a bus. Half the time it wires a second chip as
// well, which is the one thing the panels cannot do from where they sit: two
// machines reading somebody else's bytes at once.
function knife(current: Controls, rand: () => number): Controls {
  const draw = (from: CutDef[]) => from[Math.floor(rand() * from.length)]!
  const first = draw(CUTS)
  const board = applyCut(first, current)
  const elsewhere = CUTS.filter(c => c.group !== first.group)
  return rand() < 0.5 ? applyCut(draw(elsewhere), board) : board
}

// Where a control has to sit for the board to be on the edge of running away:
// the feedbacks past unity, the supply on the floor, the DAC down to a few bits.
// Positions on the travel rather than values, so the table says "near the top"
// and the slider says what that means.
const WRECK: [ControlKey, number, number][] = [
  ['fbAmt', 0.65, 1],
  ['fbDelayMs', 0, 0.6],
  ['dlyFb', 0.7, 1],
  ['dlyMix', 0.3, 0.7],
  ['combFb', 0.8, 1],
  ['filtRes', 0.85, 1],
  ['chipStarve', 0.4, 0.9],
  ['chipCap', 0.45, 0.85],
  ['chipClipClock', 0.3, 0.9],
  ['brownAmt', 0.4, 0.9],
  ['driveDb', 0.5, 1],
  ['distMix', 0.5, 1],
  ['stompSag', 0.5, 1],
  ['bits', 0, 0.3],
  ['crushMix', 0.4, 1],
]

// Controls worth driving to an end of their travel: everything with a travel to
// drive, minus what is yours and the clock.
const slammable = () =>
  ALL_SLIDERS.filter(
    d => !d.choices && !YOURS.has(d.key) && !CLOCK_KEYS.has(d.key),
  )

// One, two or three controls all the way to an end, and nothing else touched.
// It is how a hand actually finds a sound — all the way up, listen, all the way
// back — and it is the opposite of a nudge, which asks a hundred questions at
// once and hands back a hundred answers you can't tell apart. Either end counts:
// a control slammed shut is as much an answer as one slammed open.
function slam(current: Controls, rand: () => number): Controls {
  const pool = slammable()
  const next = { ...current }
  const moved = new Set<ControlKey>()
  const count = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < count && pool.length > 0; i++) {
    const def = pool.splice(Math.floor(rand() * pool.length), 1)[0]!
    const pos = rand() < 0.5 ? rand() * 0.06 : 1 - rand() * 0.06
    next[def.key] = snapToStep(def, fromPos(def, pos))
    moved.add(def.key)
  }
  return inTime(next, key => moved.has(key))
}

// Pairs that fight. Wind one up and the other decides whether the result
// screams, gates or dies on the spot, so rolling the two together lands on the
// boundary between those — which is where a circuit stops being predictable.
// Rolled independently, the same two controls land in the middle of both
// travels, which is where it sounds like a setting rather than an event.
const ANTAGONISTS: [ControlKey, ControlKey][] = [
  ['fbAmt', 'fbDelayMs'],
  ['fbAmt', 'fbTone'],
  ['filtRes', 'filtDriveDb'],
  ['chipStarve', 'chipClockX'],
  ['chipStarve', 'chipLatch'],
  // How far the rail goes against how long it takes to get there. Wound up
  // together they are a dive; either one alone is a setting.
  ['chipStarve', 'chipCap'],
  ['chipCap', 'chipClipHz'],
  ['chipClipClock', 'chipClipHz'],
  ['dlyFb', 'delayMs'],
  ['combFb', 'combHz'],
  ['stompDrive', 'stompSag'],
  ['shiftFb', 'shiftHz'],
  ['drumRetrigHz', 'drumDecay'],
  ['couple', 'filtRes'],
  ['oscStarve', 'oscXmod'],
]

// Two pairs, each driven to opposite ends of itself: one of them near the top of
// its travel and its opposite number near the bottom, which is the corner of the
// pair rather than the middle of it. Everything else is left where it stood, so
// what comes back is the board you had, standing on an edge.
function edge(current: Controls, rand: () => number): Controls {
  const pairs = [...ANTAGONISTS]
  const next = { ...current }
  const moved = new Set<ControlKey>()
  for (let i = 0; i < 2 && pairs.length > 0; i++) {
    const [a, b] = pairs.splice(Math.floor(rand() * pairs.length), 1)[0]!
    const high = rand() < 0.5
    for (const [key, top] of [
      [a, high],
      [b, !high],
    ] as const) {
      const def = sliderFor(key)
      const pos = top ? 0.82 + rand() * 0.18 : rand() * 0.18
      next[key] = snapToStep(def, fromPos(def, pos))
      moved.add(key)
    }
  }
  return inTime(next, key => moved.has(key))
}

// The mechanisms that make the board stop repeating itself, turned up together
// — because each of them alone is a detail and the four of them at once is a
// different instrument. Nothing here is a sound: they are all statements about
// how the board behaves over minutes rather than over a note.
const AGE: [ControlKey, number, number][] = [
  ['heatAmt', 0.55, 1],
  ['faultCluster', 0.5, 1],
  ['chipDrift', 0.15, 0.6],
  ['chipLatch', 0.2, 0.7],
  ['jointChatter', 0.05, 0.4],
  ['relayRate', 0, 0.3],
  ['couple', 0.25, 0.8],
]

function age(current: Controls, rand: () => number): Controls {
  const next = { ...current }
  for (const [key, lo, hi] of AGE) {
    const def = sliderFor(key)
    next[key] = snapToStep(def, lo + rand() * (hi - lo))
  }
  return next
}

// Everything that can run away, wound up at once. The safety tail holds it at
// the rails, so the worst this can do is be loud and horrible — which is the
// request.
function wreck(current: Controls, rand: () => number): Controls {
  const next = { ...current }
  const moved = new Set<ControlKey>()
  for (const [key, lo, hi] of WRECK) {
    const def = sliderFor(key)
    next[key] = snapToStep(def, fromPos(def, lo + rand() * (hi - lo)))
    moved.add(key)
  }
  return inTime(next, key => moved.has(key))
}

// A row of boards for the hunt to listen through, rather than one board handed
// over unheard. The two rolls that go looking for an edge do most of it, with a
// rewire among them because the same parts in a different order is often the one
// that squeals.
export function huntCandidates(
  current: Controls,
  rand: () => number,
  count = 6,
): Controls[] {
  const rolls = [edge, slam, edge, rewire, slam, edge]
  return Array.from({ length: count }, (_, i) =>
    rolls[i % rolls.length]!(current, rand),
  )
}

// The rolls a single panel can't offer, because each one is about how the
// stages sit together rather than about what any one of them is set to. Every
// label carries "random" because that is the part a name like "rewire" hides:
// the button does not open a rewiring dialog, it rolls one and hands it over.
export const SCENARIOS: ScenarioDef[] = [
  {
    name: 'rewire',
    label: 'random rewire',
    blurb:
      'Shuffle the bend order and re-solder the wires — same parts, different board',
    roll: rewire,
  },
  {
    name: 'one bend',
    label: 'random one bend',
    blurb: 'Clear the slots down to a single bend and roll that one hard',
    roll: oneBend,
  },
  {
    name: 'knife',
    label: 'random knife',
    blurb:
      'A named cut on one chip’s bus, and half the time a second on another — the wires the blind dice leave alone',
    roll: knife,
  },
  {
    name: 'wreck it',
    label: 'random wreck',
    blurb:
      'Every feedback past unity, the supply on the floor, the DAC down to a few bits',
    roll: wreck,
  },
  {
    name: 'slam',
    label: 'random slam',
    blurb:
      'One to three controls all the way to an end of their travel, nothing else touched',
    roll: slam,
  },
  {
    name: 'on the edge',
    label: 'random edge',
    blurb:
      'Two pairs that fight, each driven to opposite corners — the boundary rather than the middle',
    roll: edge,
  },
  {
    name: 'let it age',
    label: 'random aging',
    blurb:
      'Heat, clustered faults, a wandering crystal and a latching die: a board that stops repeating itself',
    roll: age,
  },
]
